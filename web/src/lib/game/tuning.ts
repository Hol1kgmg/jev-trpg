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

/** 手がかりの揃ったルートの条件を満たす行動（meets_clear）への加算 */
export const routeBonus = 20;

export const rateMin = 5;
export const rateMax = 95;

/** この値以上の出目はファンブル */
export const fumbleFloor = 96;

/** 確信度のしきい値（research.md R-002） */
export const confidenceThresholds = {
  /** plausibility の confidence がこれ未満なら ambiguous（ロールしない） */
  ambiguous: 0.5,
  meetsClear: 0.7,
  metaCheat: 0.6,
  /** baseline_match がこれ以上なら「ただ〇〇する」と同じ扱い（空欄と同じ Judgment に固定） */
  baselineMatch: 0.7,
} as const;

export const maxTurn = 8;

/** HP と正気度の上限。開始時はどちらも上限値ちょうど（data-model.md Investigator） */
export const maxHp = 10;
export const maxSanity = 10;

/** 怪異の段階の境界。turn から導出する（data-model.md EntityStage） */
export const stageThresholds = { appearance: 3, agitation: 6 } as const;

export function entityStage(turn: number): EntityStage {
  if (turn <= stageThresholds.appearance) return 'appearance';
  if (turn <= stageThresholds.agitation) return 'agitation';
  return 'frenzy';
}

/** Jev の呼び出しタイムアウト（ミリ秒） */
export const jevTimeoutMs = 5000;

/** 事前判定の 1 ターンあたりの上限。超えたら入力を固定し、最後の判定で確定する（ADR 0004） */
export const previewLimit = 10;

/** 入力欄からフォーカスが外れてから事前判定を送るまでの待ち（ミリ秒） */
export const previewDebounceMs = 3000;

/**
 * 失敗系の結果ほど恐怖に曝される。horrorExposure（0〜3 に丸めた値）に足して正気度を減らす。
 * 成功は並の恐怖（exposure 1）なら無償。観察を「いくらで見えるか」の判定にするための基準
 */
const sanityLossByOutcome: Record<Outcome, number> = {
  critical_success: -2,
  success: -1,
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
