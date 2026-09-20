// 調整用の数値はすべてこの 1 ファイルに集約する（research.md R-006 / Constitution V）。
// テストプレイでバランスを変えるときは、ここ以外を触らない。

import type { Direction, EntityStage, Outcome } from './types';

/** plausibility（0〜4 に丸めた値）→ 成功率の補正 */
export const plausibilityMod: Record<number, number> = {
  0: -40,
  1: -20,
  2: 0,
  3: 15,
  4: 30,
};

/** exploits_weakness かつ前提手がかりを所持している場合の加算 */
export const weaknessBonus = 20;

export const rateMin = 5;
export const rateMax = 95;

/** この値以上の出目はファンブル */
export const fumbleFloor = 96;

/** 確信度のしきい値（research.md R-002） */
export const confidenceThresholds = {
  /** skill の confidence がこれ未満なら ambiguous（ロールしない） */
  ambiguous: 0.5,
  exploitsWeakness: 0.7,
  meetsClear: 0.7,
  metaCheat: 0.6,
} as const;

export const maxTurn = 8;

/** 怪異の段階の境界。turn から導出する（data-model.md EntityStage） */
export const stageThresholds = { appearance: 3, agitation: 6 } as const;

export function entityStage(turn: number): EntityStage {
  if (turn <= stageThresholds.appearance) return 'appearance';
  if (turn <= stageThresholds.agitation) return 'agitation';
  return 'frenzy';
}

/** 生成の再試行上限（research.md R-007） */
export const generationRetryLimit = 50;

/** Jev の呼び出しタイムアウト（ミリ秒） */
export const jevTimeoutMs = 5000;

/** 失敗系の結果ほど恐怖に曝される。horrorExposure（0〜3 に丸めた値）に足して正気度を減らす */
const sanityLossByOutcome: Record<Outcome, number> = {
  critical_success: -1,
  success: 0,
  failure: 1,
  fumble: 2,
  ambiguous: 0,
  meta: 0,
};

/** 正気度の減少量。0 未満にはしない（回復はさせない） */
export function sanityLoss(outcome: Outcome, horrorExposure: number): number {
  const exposure = Math.round(Math.min(3, Math.max(0, horrorExposure)));
  return Math.max(0, exposure + sanityLossByOutcome[outcome]);
}

/** 身体的な危険を伴う方向性ほど HP を削る */
const hpRiskByDirection: Record<Direction, number> = {
  observe: 0,
  attack: 2,
  engage: 1,
  withdraw: 1,
};

/** HP の減少量。成功系では削らない */
export function hpLoss(outcome: Outcome, direction: Direction): number {
  if (outcome === 'critical_success' || outcome === 'success') return 0;
  if (outcome === 'meta') return 0;
  const risk = hpRiskByDirection[direction];
  if (outcome === 'fumble') return risk + 1;
  if (outcome === 'ambiguous') return 0;
  return risk;
}
