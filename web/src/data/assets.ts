// 使用する画像素材の出所。web/public/ に置く画像は、必ずここに 1 件登録する（FR-024）。
// 登録漏れ・削除漏れは assets.test.ts が落とす（SC-010）。
//
// 登録してよいもの: 第三者のフリー素材・CC ライセンス素材のうち、商用利用と
// （加工するなら）改変が許されているもの。
// 登録してはならないもの: TRPG 出版社・発売元が配布する図版類（FR-024 / research.md R-009）。

import type { AssetEntry } from '@/lib/game/types';

export const assets: AssetEntry[] = [
  {
    // OGP 画像。本プロジェクトの自作
    path: 'og-image.png',
    sourceUrl: 'https://github.com/Hol1kgmg/jev-trpg',
    author: 'Hol1kgmg',
    license: 'All rights reserved',
    licenseUrl: 'https://github.com/Hol1kgmg/jev-trpg',
    requiresCredit: false,
    creditText: '',
    commercialUse: true,
    modification: true,
    modified: false,
  },
];
