import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client } from '@aws-sdk/client-s3';
import { findFolderByName, createFolder, getFolderInfo } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';

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

    if (!fileName || !fileType) {
      return NextResponse.json({ error: 'fileName と fileType は必須です' }, { status: 400 });
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

    const fileKey = `${ROOT}/${folderId}/${fileName}`;

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
