import { NextRequest, NextResponse } from 'next/server';
import { streamFile, deleteFile } from '@/lib/cloudflare-r2';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const isDownload = request.nextUrl.searchParams.get('download') === '1';

  try {
    const { stream, mimeType, name } = await streamFile(fileId);

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
    };

    if (isDownload) {
      // Encode filename for Content-Disposition
      const encodedName = encodeURIComponent(name);
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodedName}`;
    }

    // Convert Node.js readable stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk);
        });
        stream.on('end', () => {
          controller.close();
        });
        stream.on('error', (err: Error) => {
          controller.error(err);
        });
      },
      cancel() {
        // Destroy the stream if the client disconnects
        if (typeof (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy === 'function') {
          (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
        }
      },
    });

    return new NextResponse(webStream, { headers });
  } catch (error) {
    console.error('Error proxying photo:', error);
    return NextResponse.json(
      { error: '写真の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  try {
    await deleteFile(fileId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: '写真の削除に失敗しました' }, { status: 500 });
  }
}
