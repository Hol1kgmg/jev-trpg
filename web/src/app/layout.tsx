import type { Metadata } from 'next';
import { Cinzel, Shippori_Mincho } from 'next/font/google';
import './globals.css';

// 見出し用の欧文セリフ。和文は含まないので、本文には使わない
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-cinzel' });
// 本文用の和文明朝。IM Fell English（欧文のみ）の代わり
const shippori = Shippori_Mincho({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-shippori',
});

export const metadata: Metadata = {
  title: '静かな観測',
  description: '1人用コズミックホラーTRPG',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${cinzel.variable} ${shippori.variable}`}>
      <body>{children}</body>
    </html>
  );
}
