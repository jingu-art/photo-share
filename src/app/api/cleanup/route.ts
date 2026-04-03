import { NextRequest, NextResponse } from 'next/server';
import { listAllFolders, deleteFolder } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify Bearer token
  const authorization = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 500 }
    );
  }

  if (!authorization || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const folders = await listAllFolders();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldFolders = folders.filter((folder) => {
      const createdAt = new Date(folder.createdTime);
      return createdAt < sevenDaysAgo;
    });

    // Delete old folders
    const results = await Promise.allSettled(
      oldFolders.map((folder) => deleteFolder(folder.id))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    const deletedFolders = oldFolders.map((f, i) => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
      deleted: results[i].status === 'fulfilled',
    }));

    console.log(`Cleanup: deleted ${succeeded} folders, failed ${failed}`);

    return NextResponse.json({
      deletedCount: succeeded,
      failedCount: failed,
      totalChecked: folders.length,
      deletedFolders,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    return NextResponse.json(
      { error: 'クリーンアップに失敗しました' },
      { status: 500 }
    );
  }
}
