'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
}

interface FolderData {
  id: string;
  name: string;
  createdTime: string;
  files: FileInfo[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function Lightbox({
  files,
  initialIndex,
  onClose,
}: {
  files: FileInfo[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imgLoaded, setImgLoaded] = useState(false);

  const file = files[currentIndex];

  const goPrev = useCallback(() => {
    setImgLoaded(false);
    setCurrentIndex((i) => (i > 0 ? i - 1 : files.length - 1));
  }, [files.length]);

  const goNext = useCallback(() => {
    setImgLoaded(false);
    setCurrentIndex((i) => (i < files.length - 1 ? i + 1 : 0));
  }, [files.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Touch swipe support
  const touchStartRef = useRef<number | null>(null);

  const handleTouchStartActual = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(diff) > 50) {
      if (diff < 0) goNext();
      else goPrev();
    }
    touchStartRef.current = null;
  };

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onTouchStart={handleTouchStartActual}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button
          onClick={onClose}
          className="text-white p-2 -ml-2"
          aria-label="閉じる"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="text-white text-sm">
          {currentIndex + 1} / {files.length}
        </span>
        <a
          href={`/api/photos/${file.id}?download=1`}
          download={file.name}
          className="text-white p-2 -mr-2"
          aria-label="ダウンロード"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>

      {/* Image container */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          key={file.id}
          src={`/api/photos/${file.id}`}
          alt={file.name}
          className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImgLoaded(true)}
        />
      </div>

      {/* Navigation arrows (shown only if multiple photos) */}
      {files.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 active:bg-black/60"
            aria-label="前の写真"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 active:bg-black/60"
            aria-label="次の写真"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* File name */}
      <div className="px-4 pb-4 text-center flex-shrink-0">
        <p className="text-white/60 text-xs truncate">{file.name}</p>
      </div>
    </div>
  );
}

export default function FolderPage() {
  const params = useParams();
  const folderId = params.folderId as string;

  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/folders/${folderId}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'アルバムの読み込みに失敗しました');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [folderId]);

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!window.confirm(`「${fileName}」を削除しますか？`)) return;
    setDeletingFileId(fileId);
    try {
      const res = await fetch(`/api/photos/${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setData((prev) =>
        prev ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) } : prev
      );
    } catch {
      alert('削除に失敗しました');
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleDeleteFolder = async () => {
    if (!data) return;
    if (!window.confirm(`「${data.name}」をすべて削除しますか？\nこの操作は取り消せません。`)) return;
    setDeletingFolder(true);
    try {
      const res = await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      window.location.href = '/';
    } catch {
      alert('削除に失敗しました');
      setDeletingFolder(false);
    }
  };

  const handleDownload = () => {
    setDownloading(true);
    const link = document.createElement('a');
    link.href = `/api/download/${folderId}`;
    link.click();
    // Reset after a delay
    setTimeout(() => setDownloading(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px' }} />
        <p className="text-gray-500 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="text-5xl">⚠️</div>
        <p className="text-gray-600">{error}</p>
        <a
          href="/"
          className="text-blue-500 text-sm underline"
        >
          トップに戻る
        </a>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Lightbox */}
      {lightboxIndex !== null && data.files.length > 0 && (
        <Lightbox
          files={data.files}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Header */}
      <div className="mb-4">
        <a href="/" className="flex items-center gap-1 text-sm text-gray-500 active:text-gray-700 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          一覧に戻る
        </a>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{data.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(data.createdTime)} · {data.files.length}枚
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading || data.files.length === 0}
              className="flex items-center gap-1.5 bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl active:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? '準備中...' : 'ZIP'}
            </button>
            <button
              onClick={handleDeleteFolder}
              disabled={deletingFolder}
              className="flex items-center gap-1.5 bg-red-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl active:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deletingFolder ? '削除中...' : 'フォルダを削除'}
            </button>
          </div>
        </div>
      </div>

      {/* Photo grid */}
      {data.files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="text-4xl">📭</div>
          <p className="text-gray-500">このアルバムには写真がありません</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {data.files.map((file, index) => (
            <div key={file.id} className="relative aspect-square">
              <button
                onClick={() => setLightboxIndex(index)}
                className="w-full h-full overflow-hidden bg-gray-100 rounded-lg active:opacity-80 transition-opacity"
                aria-label={file.name}
              >
                <img
                  src={`/api/photos/${file.id}`}
                  alt={file.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id, file.name); }}
                disabled={deletingFileId === file.id}
                className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm active:bg-black/70 disabled:opacity-50 transition-colors"
                aria-label={`${file.name}を削除`}
              >
                {deletingFileId === file.id ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  '🗑️'
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
