import type { Metadata } from 'next';
import { Cinzel, Shippori_Mincho } from 'next/font/google';
import './globals.css';
import { siteName } from '@/lib/site';

// 見出し用の欧文セリフ。和文は含まないので、本文には使わない
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cinzel' });
// 本文用の和文明朝。IM Fell English（欧文のみ）の代わり
const shippori = Shippori_Mincho({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-shippori',
});

const description =
  'ブラウザで遊ぶ 1 人用のコズミックホラー TRPG。探索者と怪異はランダム生成。毎ターン「観察・攻撃・働きかけ・退く」から方針を選び、最大 8 ターンで決着する。';

// metadataBase は Vercel 上では VERCEL_PROJECT_PRODUCTION_URL から自動解決される
export const metadata: Metadata = {
  title: { default: siteName, template: `%s | ${siteName}` },
  description,
  keywords: ['TRPG', 'コズミックホラー', '1人用', 'ソロ', 'ブラウザゲーム', '静かな観測'],
  formatDetection: { email: false, address: false, telephone: false },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName,
    title: siteName,
    description,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description,
    images: ['/og-image.png'],
  },
  category: 'Gaming',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${cinzel.variable} ${shippori.variable}`}>
      <body>{children}</body>
    </html>
  );
}
