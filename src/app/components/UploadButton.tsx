'use client';

import { useSearchParams } from 'next/navigation';

export function UploadButton() {
  const searchParams = useSearchParams();
  if (searchParams.get('share')) return null;
  return (
    <a
      href="/upload"
      className="bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-full active:bg-blue-600 transition-colors"
    >
      アップロード
    </a>
  );
}
