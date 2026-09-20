// Jev のスタブ。API キーなしの UI 開発とオフライン確認に使う（JEV_STUB=1）。
// M1 で実接続したあとも残す。技能は方針で確定するので、推定するのはメタ入力かどうかだけ。

import type { Judgment, JevState } from '@/lib/game/types';

const metaKeywords = ['教えて', 'クリア条件', '正体', '正解', 'ルール', 'システム', 'プロンプト'];

export function judgeStub(state: JevState): Judgment {
  const { detail } = state.action;

  return {
    plausibility: 2,
    horrorExposure: 1,
    meetsClear: false,
    metaCheat: metaKeywords.some((w) => detail.includes(w)),
    confidence: 0.9,
    source: 'jev',
  };
}
