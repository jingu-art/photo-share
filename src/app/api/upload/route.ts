import { NextRequest, NextResponse } from 'next/server';
import {
  findFolderByName,
  createFolder,
  uploadFile,
  getStorageUsageBytes,
  getFolderInfo,
} from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_STORAGE = 8 * 1024 * 1024 * 1024; // 8GB total

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const folderIdParam = formData.get('folderId');
    const folderName = formData.get('folderName');

    const files = formData.getAll('files') as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    // Per-file size check (20MB)
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `ファイル「${file.name}」が20MBを超えています（${(file.size / 1024 / 1024).toFixed(1)}MB）。1ファイル最大20MBまでです。`,
          },
          { status: 400 }
        );
      }
    }

    // Total storage check (8GB)
    const currentUsage = await getStorageUsageBytes();
    const newFilesSize = files.reduce((sum, f) => sum + f.size, 0);
    if (currentUsage + newFilesSize > MAX_STORAGE) {
      const usageGB = (currentUsage / 1024 / 1024 / 1024).toFixed(2);
      return NextResponse.json(
        {
          error: `ストレージ使用量が上限（8GB）に達しているためアップロードできません（現在 ${usageGB}GB 使用中）。古いフォルダを削除してください。`,
        },
        { status: 400 }
      );
    }

    let folderId: string;
    let resolvedFolderName: string;

    if (folderIdParam && typeof folderIdParam === 'string' && folderIdParam.trim()) {
      // folderId 指定：直接そのフォルダへアップロード
      const info = await getFolderInfo(folderIdParam.trim());
      if (!info) {
        return NextResponse.json({ error: '指定されたフォルダが見つかりません' }, { status: 404 });
      }
      folderId = info.id;
      resolvedFolderName = info.name;
    } else {
      // folderName 指定：同名検索 → なければ新規作成
      if (!folderName || typeof folderName !== 'string' || !folderName.trim()) {
        return NextResponse.json({ error: 'アルバム名またはフォルダIDが必要です' }, { status: 400 });
      }
      const trimmedName = folderName.trim();
      folderId = (await findFolderByName(trimmedName)) ?? (await createFolder(trimmedName));
      resolvedFolderName = trimmedName;
    }

    // Upload one by one to stay within R2 write request limits
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await uploadFile(folderId, file.name, file.type || 'application/octet-stream', buffer);
    }

    return NextResponse.json({
      folderId,
      folderName: resolvedFolderName,
      uploadedCount: files.length,
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    const message = error instanceof Error ? error.message : 'アップロードに失敗しました';
    return NextResponse.json(
      { error: `アップロードに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
