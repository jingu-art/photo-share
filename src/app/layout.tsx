import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UploadButton } from './components/UploadButton';
import './globals.css';

export const metadata: Metadata = {
  title: 'フォトシェア',
  description: '写真を簡単にシェアできるサービスです',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="bg-gray-50 min-h-screen font-sans antialiased">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-lg font-bold text-gray-800 no-underline">
              フォトシェア
            </a>
            <Suspense fallback={null}>
              <UploadButton />
            </Suspense>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
