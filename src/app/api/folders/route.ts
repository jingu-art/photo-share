import { NextResponse } from 'next/server';
import { listFolders } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const folders = await listFolders();
    return NextResponse.json({ folders }, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('Error listing folders:', error);
    return NextResponse.json(
      { error: 'フォルダの取得に失敗しました' },
      { status: 500 }
    );
  }
}
