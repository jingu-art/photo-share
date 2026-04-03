import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getFolderInfo, listFiles, getFileBuffer } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // seconds - ZIP creation may take a while

export async function GET(
  _request: NextRequest,
  { params }: { params: { folderId: string } }
) {
  const { folderId } = params;

  try {
    // Get folder info and file list
    const [folderInfo, files] = await Promise.all([
      getFolderInfo(folderId),
      listFiles(folderId),
    ]);

    if (!folderInfo) {
      return NextResponse.json(
        { error: 'アルバムが見つかりません' },
        { status: 404 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'ダウンロードできるファイルがありません' },
        { status: 400 }
      );
    }

    // Download all files from Drive
    const zip = new JSZip();

    // Download in batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const buffers = await Promise.all(
        batch.map((file) => getFileBuffer(file.id))
      );
      buffers.forEach(({ buffer, name }) => {
        zip.file(name, buffer);
      });
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Safe filename for Content-Disposition
    const safeName = folderInfo.name.replace(/[^\w\s\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f-]/g, '_');
    const encodedName = encodeURIComponent(`${safeName}.zip`);

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
        'Content-Length': zipBuffer.length.toString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error creating ZIP download:', error);
    return NextResponse.json(
      { error: 'ダウンロードの準備に失敗しました' },
      { status: 500 }
    );
  }
}
