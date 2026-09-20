import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '静かな観測',
  description: '1人用コズミックホラーTRPG',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
