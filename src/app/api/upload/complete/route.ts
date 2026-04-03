import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { folderId, fileKey } = body;

    if (!folderId || !fileKey) {
      return NextResponse.json({ error: 'folderId と fileKey は必須です' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in upload complete:', error);
    return NextResponse.json({ error: '完了通知の処理に失敗しました' }, { status: 500 });
  }
}
