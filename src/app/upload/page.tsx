'use client';

import { useState, useRef, useCallback } from 'react';

type Mode = 'new' | 'existing';

interface FolderOption {
  id: string;
  name: string;
  fileCount: number;
  createdTime: string;
}

export default function UploadPage() {
  const [mode, setMode] = useState<Mode>('new');
  const [folderName, setFolderName] = useState('');
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleModeChange = (next: Mode) => {
    setError(null);
    setMode(next);
    if (next === 'existing') {
      setFoldersLoading(true);
      fetch('/api/folders')
        .then((r) => r.json())
        .then((data) => {
          const fetched: FolderOption[] = data.folders ?? [];
          setFolders(fetched);
          if (fetched.length > 0) {
            setSelectedFolderId(fetched[0].id);
          } else {
            setError('アルバムがまだありません。先に新規作成してください。');
          }
        })
        .catch(() => {
          setError('フォルダ一覧の取得に失敗しました');
        })
        .finally(() => setFoldersLoading(false));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && fileInputRef.current) {
      const dt = new DataTransfer();
      Array.from(droppedFiles).forEach((f) => dt.items.add(f));
      fileInputRef.current.files = dt.files;
      setFiles(dt.files);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (mode === 'new' && !folderName.trim()) {
      setError('アルバム名を入力してください');
      return;
    }
    if (mode === 'existing' && !selectedFolderId) {
      setError('アルバムを選択してください');
      return;
    }
    if (!files || files.length === 0) {
      setError('写真を選択してください');
      return;
    }

    const fileArray = Array.from(files);
    setError(null);
    setUploading(true);
    setCompletedCount(0);
    setFailedCount(0);
    setTotalCount(fileArray.length);

    let resolvedFolderId: string | null = null;
    let resolvedFolderName = '';
    let successCount = 0;
    let failCount = 0;

    const uploadSingle = async (
      file: File,
      folderId: string | null,
      isFirst: boolean,
    ): Promise<{ ok: boolean; folderId?: string; folderName?: string }> => {
      const formData = new FormData();
      if (isFirst) {
        if (mode === 'new') {
          formData.append('folderName', folderName.trim());
        } else {
          formData.append('folderId', selectedFolderId);
        }
      } else {
        formData.append('folderId', folderId!);
      }
      formData.append('files', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          setCompletedCount((prev) => prev + 1);
          return { ok: true, folderId: data.folderId, folderName: data.folderName };
        }
        setFailedCount((prev) => prev + 1);
        return { ok: false };
      } catch {
        setFailedCount((prev) => prev + 1);
        return { ok: false };
      }
    };

    const CHUNK_SIZE = 5;
    const chunks: File[][] = [];
    for (let i = 0; i < fileArray.length; i += CHUNK_SIZE) {
      chunks.push(fileArray.slice(i, i + CHUNK_SIZE));
    }

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];

      if (chunkIdx === 0) {
        // 1枚目を先に送ってfolderIdを確定する
        const firstResult = await uploadSingle(chunk[0], null, true);
        if (!firstResult.ok) {
          setError('アップロードに失敗しました');
          setUploading(false);
          return;
        }
        resolvedFolderId = firstResult.folderId!;
        resolvedFolderName = firstResult.folderName!;
        successCount++;

        // 残り最大4枚を並列送信
        if (chunk.length > 1) {
          const results = await Promise.all(
            chunk.slice(1).map((f) => uploadSingle(f, resolvedFolderId, false)),
          );
          for (const r of results) {
            if (r.ok) successCount++;
            else failCount++;
          }
        }
      } else {
        // 2チャンク目以降は5枚同時並列
        const results = await Promise.all(
          chunk.map((f) => uploadSingle(f, resolvedFolderId, false)),
        );
        for (const r of results) {
          if (r.ok) successCount++;
          else failCount++;
        }
      }
    }

    setUploading(false);
    if (resolvedFolderId) {
      setFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setCompletedCount(0);
      setFailedCount(0);
      setTotalCount(0);
      const msg = failCount > 0
        ? `✅ ${successCount}枚アップロード完了（失敗: ${failCount}枚）`
        : `✅ ${successCount}枚アップロード完了`;
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 2000);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const isUploadDisabled =
    uploading ||
    !files ||
    files.length === 0 ||
    (mode === 'new' && !folderName.trim()) ||
    (mode === 'existing' && !selectedFolderId);

  return (
    <div>
      <div className="mb-6">
        <a href="/" className="flex items-center gap-1 text-sm text-gray-500 active:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          戻る
        </a>
      </div>

      <h1 className="text-xl font-bold text-gray-800 mb-6">写真をアップロード</h1>

      <div className="space-y-5">

        {/* モード切り替えタブ */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => handleModeChange('new')}
            disabled={uploading}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'new'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 active:bg-gray-50'
            }`}
          >
            新しいアルバム
          </button>
          <button
            onClick={() => handleModeChange('existing')}
            disabled={uploading}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-l border-gray-200 ${
              mode === 'existing'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-600 active:bg-gray-50'
            }`}
          >
            既存に追加
          </button>
        </div>

        {/* 新規作成：アルバム名入力 */}
        {mode === 'new' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              アルバム名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => { setFolderName(e.target.value); setError(null); }}
              placeholder="例：家族旅行2025"
              maxLength={100}
              disabled={uploading}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        )}

        {/* 既存に追加：ドロップダウン */}
        {mode === 'existing' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              アルバムを選択 <span className="text-red-500">*</span>
            </label>
            {foldersLoading ? (
              <div className="w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-400 text-sm bg-gray-50">
                読み込み中...
              </div>
            ) : folders.length === 0 ? (
              <div className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-400 text-sm bg-gray-50">
                アルバムがまだありません
              </div>
            ) : (
              <select
                value={selectedFolderId}
                onChange={(e) => { setSelectedFolderId(e.target.value); setError(null); }}
                disabled={uploading}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}（{f.fileCount}枚）{formatDate(f.createdTime)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* 完了メッセージ */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="text-sm font-medium text-green-600">{successMessage}</p>
          </div>
        )}

        {/* 写真選択 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            写真を選択 <span className="text-red-500">*</span>
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              uploading
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 bg-white cursor-pointer active:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            {files && files.length > 0 ? (
              <div>
                <div className="text-3xl mb-2">🖼️</div>
                <p className="text-base font-medium text-gray-800">{files.length}枚の写真を選択中</p>
                <p className="text-sm text-blue-500 mt-1">タップして変更</p>
              </div>
            ) : (
              <div>
                <div className="text-4xl mb-2">📷</div>
                <p className="text-base font-medium text-gray-700">タップして写真を選択</p>
                <p className="text-sm text-gray-400 mt-1">複数枚まとめて選択できます</p>
              </div>
            )}
          </div>
        </div>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* プログレスバー */}
        {uploading && (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-sm text-gray-600">アップロード中...</span>
              <span className="text-sm font-medium text-blue-600">
                {completedCount + failedCount}/{totalCount}枚完了
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: totalCount > 0 ? `${Math.round(((completedCount + failedCount) / totalCount) * 100)}%` : '0%' }}
              />
            </div>
            {failedCount > 0 && (
              <p className="text-xs text-red-400 mt-1 text-center">失敗: {failedCount}枚</p>
            )}
            <p className="text-xs text-gray-400 mt-1 text-center">しばらくお待ちください...</p>
          </div>
        )}

        {/* アップロードボタン */}
        <button
          onClick={handleUpload}
          disabled={isUploadDisabled}
          className="w-full py-4 rounded-xl bg-blue-500 text-white font-semibold text-base active:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'アップロード中...' : 'アップロードする'}
        </button>

        <p className="text-center text-xs text-gray-400">
          ※ 写真は7日後に自動的に削除されます
        </p>
      </div>
    </div>
  );
}
