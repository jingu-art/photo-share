import { NextRequest, NextResponse } from 'next/server';
import { getFolderInfo, listFiles, deleteFolder } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { folderId: string } }
) {
  const { folderId } = params;

  try {
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

    return NextResponse.json({
      id: folderInfo.id,
      name: folderInfo.name,
      createdTime: folderInfo.createdTime,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
      })),
    });
  } catch (error) {
    console.error('Error fetching folder detail:', error);
    return NextResponse.json(
      { error: 'アルバムの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { folderId: string } }
) {
  const { folderId } = params;
  try {
    const info = await getFolderInfo(folderId);
    if (!info) {
      return NextResponse.json({ error: 'アルバムが見つかりません' }, { status: 404 });
    }
    await deleteFolder(folderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json({ error: 'アルバムの削除に失敗しました' }, { status: 500 });
  }
}
