// 素材マニフェストの検証（SC-010 / SC-011 / data-model.md 検証ルール）。
// public/ に画像を 1 枚置いた時点で、登録し忘れがここで落ちる。

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assets } from './assets';

const PUBLIC_DIR = new URL('../../public/', import.meta.url).pathname;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'];

/** public/ 配下の画像ファイルを、public/ からの相対パスで列挙する */
function imageFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // public/ が存在しない段階では素材ゼロ
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return imageFiles(full);
    const isImage = IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
    return isImage ? [relative(PUBLIC_DIR, full)] : [];
  });
}

describe('素材マニフェスト', () => {
  it('public/ 配下の画像とマニフェストの path が一致する（SC-010）', () => {
    const onDisk = imageFiles(PUBLIC_DIR).sort();
    const registered = assets.map((a) => a.path).sort();
    expect(registered).toEqual(onDisk);
  });

  it('path が重複しない', () => {
    const paths = assets.map((a) => a.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('加工した素材は改変が許されている（FR-024）', () => {
    for (const asset of assets.filter((a) => a.modified)) {
      expect(asset.modification, `${asset.path} は改変不可の素材を加工している`).toBe(true);
    }
  });

  it('クレジット必須の素材は表示文が空でない（SC-011）', () => {
    for (const asset of assets.filter((a) => a.requiresCredit)) {
      expect(asset.creditText.trim(), `${asset.path} の creditText が空`).not.toBe('');
    }
  });

  it('出所のフィールドが埋まっている', () => {
    for (const asset of assets) {
      expect(asset.sourceUrl, `${asset.path} の sourceUrl が空`).not.toBe('');
      expect(asset.author, `${asset.path} の author が空`).not.toBe('');
      expect(asset.license, `${asset.path} の license が空`).not.toBe('');
      expect(asset.commercialUse, `${asset.path} は商用利用不可`).toBe(true);
    }
  });
});
