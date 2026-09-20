// 使用素材のクレジット（FR-025）。assets.ts の requiresCredit: true を列挙する。

import Link from 'next/link';
import { assets } from '@/data/assets';

export const metadata = { title: 'クレジット' };

export default function CreditsPage() {
  const credited = assets.filter((a) => a.requiresCredit);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <header className="border-b border-edge pb-3">
        <h1 className="font-display text-lg tracking-wider">クレジット</h1>
      </header>

      <section className="text-xs leading-relaxed text-dim">
        <p>
          本作は独自のルール・世界観による創作物です。既存のTRPG作品の公式・公認製品ではなく、
          それらの権利者とは無関係です。
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm text-dim">使用素材</h2>
        {credited.length === 0 ? (
          <p className="text-xs text-dim">クレジット表示を要する素材は使用していません。</p>
        ) : (
          <ul className="grid gap-3 text-xs leading-relaxed">
            {credited.map((asset) => (
              <li key={asset.path} className="border-l border-edge pl-3">
                <p>{asset.creditText}</p>
                <p className="text-dim">
                  作者: {asset.author}／ライセンス:{' '}
                  <a className="underline" href={asset.licenseUrl} rel="noreferrer noopener">
                    {asset.license}
                  </a>
                  {asset.modified && '（本作で加工）'}
                </p>
                <p className="text-dim">
                  出典:{' '}
                  <a className="underline" href={asset.sourceUrl} rel="noreferrer noopener">
                    {asset.sourceUrl}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="text-xs underline text-dim" href="/">
        戻る
      </Link>
    </main>
  );
}
