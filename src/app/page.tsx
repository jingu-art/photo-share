'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ─── 型定義 ────────────────────────────────────────────────
interface FileInfo { id: string; name: string; mimeType: string; }
interface Folder { id: string; name: string; createdTime: string; fileCount: number; }
interface FolderData { id: string; name: string; createdTime: string; files: FileInfo[]; }

// ─── ヘルパー ───────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

// ─── CopyButton ────────────────────────────────────────────
function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors min-w-[80px] ${
        copied ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-300 text-gray-600 active:bg-gray-100'
      }`}
    >
      {copied ? 'コピー済み' : 'URLをコピー'}
    </button>
  );
}

// ─── Lightbox ──────────────────────────────────────────────
function Lightbox({ files, initialIndex, onClose }: { files: FileInfo[]; initialIndex: number; onClose: () => void; }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imgLoaded, setImgLoaded] = useState(false);
  const touchStartRef = useRef<number | null>(null);
  const file = files[currentIndex];

  const goPrev = useCallback(() => { setImgLoaded(false); setCurrentIndex(i => i > 0 ? i - 1 : files.length - 1); }, [files.length]);
  const goNext = useCallback(() => { setImgLoaded(false); setCurrentIndex(i => i < files.length - 1 ? i + 1 : 0); }, [files.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') goPrev(); if (e.key === 'ArrowRight') goNext(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, goPrev, goNext]);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onTouchStart={e => { touchStartRef.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartRef.current === null) return;
        const diff = e.changedTouches[0].clientX - touchStartRef.current;
        if (Math.abs(diff) > 50) { diff < 0 ? goNext() : goPrev(); }
        touchStartRef.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={onClose} className="text-white p-2 -ml-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span className="text-white text-sm">{currentIndex + 1} / {files.length}</span>
        <a href={`/api/photos/${file.id}?download=1`} download={file.name} className="text-white p-2 -mr-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {!imgLoaded && <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
        <img key={file.id} src={`/api/photos/${file.id}`} alt={file.name} className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setImgLoaded(true)} />
      </div>
      {files.length > 1 && (
        <>
          <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 active:bg-black/60">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 active:bg-black/60">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}
      <div className="px-4 pb-4 text-center flex-shrink-0">
        <p className="text-white/60 text-xs truncate">{file.name}</p>
      </div>
    </div>
  );
}

// ─── RightPane（デスクトップ右ペイン）──────────────────────
function RightPane({
  folderId,
  onFolderDeleted,
  onFileCountChanged,
}: {
  folderId: string | null;
  onFolderDeleted: (id: string) => void;
  onFileCountChanged: (id: string, delta: number) => void;
}) {
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  useEffect(() => {
    if (!folderId) { setData(null); return; }
    setLoading(true);
    setLightboxIndex(null);
    fetch(`/api/folders/${folderId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [folderId]);

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!window.confirm(`「${fileName}」を削除しますか？`)) return;
    setDeletingFileId(fileId);
    try {
      const res = await fetch(`/api/photos/${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setLightboxIndex(null);
      setData(prev => prev ? { ...prev, files: prev.files.filter(f => f.id !== fileId) } : prev);
      if (folderId) onFileCountChanged(folderId, -1);
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
      onFolderDeleted(folderId!);
      setData(null);
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
    setTimeout(() => setDownloading(false), 3000);
  };

  // 未選択
  if (!folderId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm select-none">
        ← フォルダを選択してください
      </div>
    );
  }

  // 読み込み中
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="h-full flex flex-col">
      {lightboxIndex !== null && data.files.length > 0 && (
        <Lightbox files={data.files} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}

      {/* 右ペインヘッダー */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-800 truncate">{data.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{data.files.length}枚</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading || data.files.length === 0}
            className="flex items-center gap-1.5 bg-gray-800 text-white text-xs font-medium px-3 py-2 rounded-lg active:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloading ? '準備中...' : 'ZIP'}
          </button>
          <button
            onClick={handleDeleteFolder}
            disabled={deletingFolder}
            className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-medium px-3 py-2 rounded-lg active:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {deletingFolder ? '削除中...' : 'フォルダ削除'}
          </button>
        </div>
      </div>

      {/* 写真グリッド */}
      <div className="flex-1 overflow-y-auto p-3">
        {data.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="text-4xl">📭</div>
            <p className="text-gray-400 text-sm">このアルバムには写真がありません</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {data.files.map((file, index) => (
              <div key={file.id} className="relative aspect-square">
                <button
                  onClick={() => setLightboxIndex(index)}
                  className="w-full h-full overflow-hidden bg-gray-100 rounded-lg active:opacity-80 transition-opacity"
                >
                  <img src={`/api/photos/${file.id}`} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteFile(file.id, file.name); }}
                  disabled={deletingFileId === file.id}
                  className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm active:bg-black/70 disabled:opacity-50 transition-colors"
                >
                  {deletingFileId === file.id
                    ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    : '🗑️'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HomePageInner ─────────────────────────────────────────
function HomePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const shareParam = searchParams.get('share');
  const shareIds = shareParam ? shareParam.split(',').filter(Boolean) : null;
  const isShareView = shareIds !== null;

  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [shareCopied, setShareCopied] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const fetchFolders = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/folders');
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'エラー'); }
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const displayedFolders = isShareView
    ? folders.filter(f => shareIds!.includes(f.id))
    : folders;

  const getFolderUrl = (folderId: string) =>
    typeof window !== 'undefined' ? `${window.location.origin}/folder/${folderId}` : `/folder/${folderId}`;

  // フォルダクリック：PCなら右ペインに表示、モバイルならページ遷移
  const handleFolderClick = (e: React.MouseEvent, folderId: string) => {
    if (window.innerWidth >= 768) {
      e.preventDefault();
      setSelectedFolderId(folderId);
    }
  };

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCheckedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleShareCopy = async () => {
    const url = `${window.location.origin}/?share=${Array.from(checkedIds).join(',')}`;
    await copyToClipboard(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // フォルダ削除後（右ペインから）
  const handleFolderDeleted = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setCheckedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    if (selectedFolderId === id) setSelectedFolderId(null);
  };

  // 写真削除後（右ペインから）
  const handleFileCountChanged = (folderId: string, delta: number) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, fileCount: Math.max(0, f.fileCount + delta) } : f));
  };

  // フォルダカード（左ペイン・モバイル共通）
  const FolderCard = ({ folder }: { folder: Folder }) => {
    const checked = checkedIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <a
        href={`/folder/${folder.id}`}
        onClick={e => handleFolderClick(e, folder.id)}
        className={`block rounded-xl border p-3 transition-colors ${
          isSelected
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 bg-white active:bg-gray-50'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {/* チェックボックス（共有ビューでは非表示） */}
          {!isShareView && (
            <div
              onClick={e => toggleCheck(folder.id, e)}
              className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
              style={{ borderColor: checked ? '#3b82f6' : '#d1d5db', backgroundColor: checked ? '#3b82f6' : 'white' }}
            >
              {checked && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 text-sm truncate">{folder.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatDateShort(folder.createdTime)} · {folder.fileCount}枚
            </p>
          </div>

          {/* URLコピー（モバイルのみ表示、PC左ペインでは省略） */}
          <div onClick={e => e.preventDefault()} className="md:hidden flex-shrink-0">
            <CopyButton url={getFolderUrl(folder.id)} />
          </div>
        </div>
      </a>
    );
  };

  return (
    <div>
      {/* 共有ビューバナー */}
      {isShareView && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-blue-700 font-medium">📋 共有ビュー（{displayedFolders.length}件のアルバム）</p>
          <button onClick={() => router.push('/')} className="text-xs text-blue-500 border border-blue-300 rounded-full px-3 py-1.5 active:bg-blue-100 whitespace-nowrap">
            すべて表示に戻る
          </button>
        </div>
      )}

      {/* ヘッダー行（通常ビューのみ） */}
      {!isShareView && (
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-800">アルバム一覧</h1>
          <button
            onClick={() => fetchFolders(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-blue-500 active:text-blue-700 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            更新
          </button>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px', borderStyle: 'solid' }} />
          <p className="text-gray-500 text-sm">読み込み中...</p>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={() => fetchFolders()} className="mt-2 text-sm text-red-500 underline">再試行</button>
        </div>
      )}

      {/* 空状態 */}
      {!loading && !error && displayedFolders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="text-5xl">📷</div>
          <p className="text-gray-500 text-base">{isShareView ? '表示できるアルバムがありません' : 'まだアルバムがありません'}</p>
          {!isShareView && (
            <>
              <p className="text-gray-400 text-sm">写真をアップロードして共有しましょう</p>
              <a href="/upload" className="mt-2 bg-blue-500 text-white font-medium px-6 py-3 rounded-full active:bg-blue-600 transition-colors">
                写真をアップロード
              </a>
            </>
          )}
        </div>
      )}

      {/* ─── 2ペインレイアウト ─── */}
      {!loading && !error && displayedFolders.length > 0 && (
        <>
          {/* モバイル：カードリスト（既存の動作） */}
          <ul className="space-y-3 md:hidden pb-24">
            {displayedFolders.map(folder => (
              <li key={folder.id}>
                <FolderCard folder={folder} />
              </li>
            ))}
            <li>
              <p className="text-center text-xs text-gray-400 pt-2">※ アルバムは7日後に自動削除されます</p>
            </li>
          </ul>

          {/* PC・タブレット：2ペインレイアウト */}
          <div className="hidden md:flex border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm" style={{ height: 'calc(100vh - 120px)' }}>
            {/* 左ペイン */}
            <div className="w-[280px] flex-shrink-0 border-r border-gray-200 flex flex-col">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {displayedFolders.map(folder => (
                  <FolderCard key={folder.id} folder={folder} />
                ))}
              </div>
              <div className="flex-shrink-0 p-3 border-t border-gray-100">
                <p className="text-center text-xs text-gray-400">※ 7日後に自動削除</p>
              </div>
            </div>

            {/* 右ペイン */}
            <div className="flex-1 overflow-hidden">
              <RightPane
                folderId={selectedFolderId}
                onFolderDeleted={handleFolderDeleted}
                onFileCountChanged={handleFileCountChanged}
              />
            </div>
          </div>
        </>
      )}

      {/* 複数フォルダ共有ボタン（固定フッター） */}
      {!isShareView && checkedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg z-40">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleShareCopy}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-colors ${
                shareCopied ? 'bg-green-500 text-white' : 'bg-blue-500 text-white active:bg-blue-600'
              }`}
            >
              {shareCopied ? '✅ URLをコピーしました' : `🔗 選択した${checkedIds.size}件のフォルダを共有`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── エクスポート ───────────────────────────────────────────
export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-8 h-8 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: '3px', borderStyle: 'solid' }} />
        <p className="text-gray-500 text-sm">読み込み中...</p>
      </div>
    }>
      <HomePageInner />
    </Suspense>
  );
}
