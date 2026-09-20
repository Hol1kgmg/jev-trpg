// 調整用の数値はすべてこの 1 ファイルに集約する（research.md R-006 / Constitution V）。
// テストプレイでバランスを変えるときは、ここ以外を触らない。

import type { ActionType, Outcome } from './types';

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
  /** action_type の confidence がこれ未満なら ambiguous（ロールしない） */
  ambiguous: 0.5,
  exploitsWeakness: 0.7,
  meetsClear: 0.7,
  metaCheat: 0.6,
} as const;

export const maxTurn = 12;

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

/** 身体的な危険を伴う行動種別ほど HP を削る */
const hpRiskByActionType: Record<ActionType, number> = {
  investigate: 0,
  combat: 2,
  persuade: 0,
  escape: 1,
  ritual: 1,
  hide: 0,
  other: 0,
};

/** HP の減少量。成功系では削らない */
export function hpLoss(outcome: Outcome, actionType: ActionType): number {
  if (outcome === 'critical_success' || outcome === 'success') return 0;
  if (outcome === 'meta') return 0;
  const risk = hpRiskByActionType[actionType];
  if (outcome === 'fumble') return risk + 1;
  if (outcome === 'ambiguous') return 0;
  return risk;
}
