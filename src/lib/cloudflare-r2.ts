import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

function getClient(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME || 'photo-share';
}

const ROOT = 'photo-share';
const METADATA_FILE = '_metadata.json';

interface FolderMetadata {
  name: string;
  createdAt: string;
}

export interface FolderInfo {
  id: string;
  name: string;
  createdTime: string;
  fileCount: number;
}

export interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
}

export function encodeFileId(folderId: string, fileName: string): string {
  return Buffer.from(`${folderId}|||${fileName}`).toString('base64url');
}

export function decodeFileId(fileId: string): { folderId: string; fileName: string } {
  const decoded = Buffer.from(fileId, 'base64url').toString('utf-8');
  const sepIdx = decoded.indexOf('|||');
  if (sepIdx === -1) throw new Error('Invalid fileId');
  return { folderId: decoded.slice(0, sepIdx), fileName: decoded.slice(sepIdx + 3) };
}

// Handles both legacy timestamp prefix (e.g. 1713000000000_photo.jpg)
// and current index prefix (e.g. 0000_photo.jpg).
function parseFileName(keyName: string): { timestamp: number | null; originalName: string } {
  const match = keyName.match(/^(\d+)_(.+)$/);
  if (match) {
    return { timestamp: parseInt(match[1], 10), originalName: match[2] };
  }
  return { timestamp: null, originalName: keyName };
}

function mimeFromExt(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return map[ext] || 'application/octet-stream';
}

// Paginate through all objects under a prefix
async function listAllObjects(
  prefix: string
): Promise<Array<{ key: string; size: number }>> {
  const client = getClient();
  const objects: Array<{ key: string; size: number }> = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) objects.push({ key: obj.Key, size: obj.Size ?? 0 });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

/**
 * Get total storage usage in bytes for all objects under ROOT
 */
export async function getStorageUsageBytes(): Promise<number> {
  const objects = await listAllObjects(`${ROOT}/`);
  return objects.reduce((sum, o) => sum + o.size, 0);
}

/**
 * List folders created within the last 7 days, sorted newest first
 */
export async function listFolders(): Promise<FolderInfo[]> {
  const client = getClient();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const allObjects = await listAllObjects(`${ROOT}/`);
  const metaKeys = allObjects.filter((o) => o.key.endsWith(`/${METADATA_FILE}`));

  const folders: FolderInfo[] = [];

  for (const metaObj of metaKeys) {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket(), Key: metaObj.key })
    );
    const body = await res.Body?.transformToString('utf-8');
    if (!body) continue;

    const meta: FolderMetadata = JSON.parse(body);
    const createdAt = new Date(meta.createdAt);
    if (createdAt < sevenDaysAgo) continue;

    const folderId = metaObj.key.split('/')[1];
    const folderPrefix = `${ROOT}/${folderId}/`;
    const fileCount = allObjects.filter(
      (o) => o.key.startsWith(folderPrefix) && !o.key.endsWith(`/${METADATA_FILE}`)
    ).length;

    folders.push({ id: folderId, name: meta.name, createdTime: meta.createdAt, fileCount });
  }

  folders.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
  return folders;
}

/**
 * Find a folder by display name. Returns folderId (UUID) or null.
 */
export async function findFolderByName(name: string): Promise<string | null> {
  const client = getClient();
  const allObjects = await listAllObjects(`${ROOT}/`);
  const metaKeys = allObjects.filter((o) => o.key.endsWith(`/${METADATA_FILE}`));

  for (const metaObj of metaKeys) {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket(), Key: metaObj.key })
    );
    const body = await res.Body?.transformToString('utf-8');
    if (!body) continue;
    const meta: FolderMetadata = JSON.parse(body);
    if (meta.name === name) return metaObj.key.split('/')[1];
  }

  return null;
}

/**
 * Create a new folder. Returns folderId (UUID).
 */
export async function createFolder(name: string): Promise<string> {
  const client = getClient();
  const folderId = randomUUID();
  const meta: FolderMetadata = { name, createdAt: new Date().toISOString() };

  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: `${ROOT}/${folderId}/${METADATA_FILE}`,
      Body: JSON.stringify(meta),
      ContentType: 'application/json',
    })
  );

  return folderId;
}

/**
 * Upload a file. Returns encoded fileId.
 */
export async function uploadFile(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<string> {
  const client = getClient();
  const timestamp = Date.now();
  const timedFileName = `${timestamp}_${fileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: `${ROOT}/${folderId}/${timedFileName}`,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  return encodeFileId(folderId, timedFileName);
}

/**
 * List files in a folder (excludes metadata file), sorted by upload order.
 * Files with a timestamp prefix ({digits}_{name}) come first, sorted ascending.
 * Legacy files without a timestamp prefix are sorted by name and placed at the end.
 */
export async function listFiles(folderId: string): Promise<FileInfo[]> {
  const objects = await listAllObjects(`${ROOT}/${folderId}/`);

  const items = objects
    .filter((o) => !o.key.endsWith(`/${METADATA_FILE}`))
    .map((o) => {
      const keyName = o.key.split('/').pop()!;
      const { timestamp, originalName } = parseFileName(keyName);
      return {
        id: encodeFileId(folderId, keyName),
        name: originalName,
        mimeType: mimeFromExt(originalName),
        timestamp,
      };
    });

  items.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null) return a.timestamp - b.timestamp;
    if (a.timestamp !== null) return -1;
    if (b.timestamp !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  return items.map(({ id, name, mimeType }) => ({ id, name, mimeType }));
}

/**
 * Get folder metadata
 */
export async function getFolderInfo(
  folderId: string
): Promise<{ id: string; name: string; createdTime: string } | null> {
  const client = getClient();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket(),
        Key: `${ROOT}/${folderId}/${METADATA_FILE}`,
      })
    );
    const body = await res.Body?.transformToString('utf-8');
    if (!body) return null;
    const meta: FolderMetadata = JSON.parse(body);
    return { id: folderId, name: meta.name, createdTime: meta.createdAt };
  } catch {
    return null;
  }
}

/**
 * Stream a file from R2
 */
export async function streamFile(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; name: string }> {
  const { folderId, fileName } = decodeFileId(fileId);
  const client = getClient();

  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket(), Key: `${ROOT}/${folderId}/${fileName}` })
  );

  return {
    stream: res.Body as unknown as NodeJS.ReadableStream,
    mimeType: res.ContentType || mimeFromExt(fileName),
    name: parseFileName(fileName).originalName,
  };
}

/**
 * Get file content as buffer
 */
export async function getFileBuffer(
  fileId: string
): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const { folderId, fileName } = decodeFileId(fileId);
  const client = getClient();

  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket(), Key: `${ROOT}/${folderId}/${fileName}` })
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error('Empty response body');

  return {
    buffer: Buffer.from(bytes),
    name: parseFileName(fileName).originalName,
    mimeType: res.ContentType || mimeFromExt(fileName),
  };
}

/**
 * Delete a single file by fileId
 */
export async function deleteFile(fileId: string): Promise<void> {
  const { folderId, fileName } = decodeFileId(fileId);
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: `${ROOT}/${folderId}/${fileName}` })
  );
}

/**
 * Delete a folder and all its contents
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const client = getClient();
  const objects = await listAllObjects(`${ROOT}/${folderId}/`);
  await Promise.all(
    objects.map((o) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: o.key }))
    )
  );
}

/**
 * List all folders (no date filter), sorted oldest first — for cleanup
 */
export async function listAllFolders(): Promise<
  Array<{ id: string; name: string; createdTime: string }>
> {
  const client = getClient();
  const allObjects = await listAllObjects(`${ROOT}/`);
  const metaKeys = allObjects.filter((o) => o.key.endsWith(`/${METADATA_FILE}`));

  const folders = await Promise.all(
    metaKeys.map(async (metaObj) => {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket(), Key: metaObj.key })
      );
      const body = await res.Body?.transformToString('utf-8');
      if (!body) return null;
      const meta: FolderMetadata = JSON.parse(body);
      return {
        id: metaObj.key.split('/')[1],
        name: meta.name,
        createdTime: meta.createdAt,
      };
    })
  );

  return folders
    .filter((f): f is { id: string; name: string; createdTime: string } => f !== null)
    .sort((a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime());
}
