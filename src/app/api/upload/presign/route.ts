import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client } from '@aws-sdk/client-s3';
import { findFolderByName, createFolder, getFolderInfo, getStorageUsageBytes } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_STORAGE = 8 * 1024 * 1024 * 1024; // 8GB total

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderIdParam = searchParams.get('folderId');
    const folderName = searchParams.get('folderName');
    const fileName = searchParams.get('fileName');
    const fileType = searchParams.get('fileType');
    const fileSize = Number(searchParams.get('fileSize') ?? '0');

    if (!fileName || !fileType) {
      return NextResponse.json({ error: 'fileName と fileType は必須です' }, { status: 400 });
    }

    // Per-file size check (20MB)
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイル「${fileName}」が20MBを超えています（${(fileSize / 1024 / 1024).toFixed(1)}MB）。1ファイル最大20MBまでです。` },
        { status: 400 }
      );
    }

    // Total storage check (8GB)
    const currentUsage = await getStorageUsageBytes();
    if (currentUsage + fileSize > MAX_STORAGE) {
      const usageGB = (currentUsage / 1024 / 1024 / 1024).toFixed(2);
      return NextResponse.json(
        { error: `ストレージ使用量が上限（8GB）に達しているためアップロードできません（現在 ${usageGB}GB 使用中）。古いフォルダを削除してください。` },
        { status: 400 }
      );
    }

    let folderId: string;

    if (folderIdParam && folderIdParam.trim()) {
      const info = await getFolderInfo(folderIdParam.trim());
      if (!info) {
        return NextResponse.json({ error: '指定されたフォルダが見つかりません' }, { status: 404 });
      }
      folderId = info.id;
    } else {
      if (!folderName || !folderName.trim()) {
        return NextResponse.json({ error: 'folderId または folderName が必要です' }, { status: 400 });
      }
      const trimmedName = folderName.trim();
      folderId = (await findFolderByName(trimmedName)) ?? (await createFolder(trimmedName));
    }

    // sessionBase はクライアントがアップロード開始時に一度だけ記録した Date.now() 値。
    // sessionBase + fileIndex を並べることで、同一セッション内の順序と
    // セッション間の時系列順を両立し、追加アップロード時の重複を防ぐ。
    const sessionBase = Number(searchParams.get('sessionBase') ?? String(Date.now()));
    const fileIndexNum = Number(searchParams.get('fileIndex') ?? '0');
    const actualIndex = String(sessionBase + fileIndexNum).padStart(13, '0');
    const fileKey = `${ROOT}/${folderId}/${actualIndex}_${fileName}`;

    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: bucket(),
      Key: fileKey,
      ContentType: fileType,
    });

    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 600 });

    return NextResponse.json({ presignedUrl, folderId, fileKey });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    const message = error instanceof Error ? error.message : 'Presigned URL の生成に失敗しました';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
