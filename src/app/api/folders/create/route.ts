import { NextRequest, NextResponse } from 'next/server';
import { createFolder, findFolderByName } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { folderName } = await request.json();
    if (!folderName?.trim()) {
      return NextResponse.json({ error: 'フォルダ名を入力してください' }, { status: 400 });
    }
    const name = (folderName as string).trim();
    const existing = await findFolderByName(name);
    if (existing) {
      return NextResponse.json({ error: '同名のアルバムが既に存在します' }, { status: 409 });
    }
    const folderId = await createFolder(name);
    return NextResponse.json({ folderId, name, createdAt: new Date().toISOString() });
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json({ error: 'フォルダの作成に失敗しました' }, { status: 500 });
  }
}
