// 成功率の算出・d100・状態更新。すべてコード側の純関数で、rng は注入する（Constitution I）。
// Judgment を引数に取るだけなので、Jev をモックせずともテストできる（Constitution IV）。

import { checkEnding, reveal } from './ending';
import { narrateEnding, narrateOutcome, type Rng } from './narrate';
import {
  confidenceThresholds,
  fumbleFloor,
  hpLoss,
  maxHp,
  maxSanity,
  plausibilityMod,
  rateMax,
  rateMin,
  sanityLoss,
  weaknessBonus,
} from './tuning';
import type {
  Check,
  Direction,
  GameState,
  Judgment,
  LogEntry,
  Outcome,
  RateBreakdown,
} from './types';

export type TurnDelta = { hp: number; sanity: number; clueId: string | null };

export type TurnResult = {
  state: GameState;
  outcome: Outcome;
  narration: string;
  delta: TurnDelta;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** rate = clamp(skill + plausibilityMod + weaknessBonus, 5, 95)。内訳ごと返す */
export function rateBreakdown(state: GameState, judgment: Judgment): RateBreakdown {
  const base = state.investigator.skills[judgment.skill];
  const plausible = clamp(Math.round(judgment.plausibility), 0, 4);

  const acquired = new Set(state.acquiredClueIds);
  const knowsWeakness = state.entity.weakness.requiredClueIds.every((id) => acquired.has(id));
  const weakness = judgment.exploitsWeakness && knowsWeakness ? weaknessBonus : 0;

  const plausibility = plausibilityMod[plausible];
  return {
    skill: judgment.skill,
    base,
    plausibility,
    weakness,
    rate: clamp(base + plausibility + weakness, rateMin, rateMax),
  };
}

export const successRate = (state: GameState, judgment: Judgment): number =>
  rateBreakdown(state, judgment).rate;

/** 事前判定でプレイヤーに見せる内訳。ロールしない判定（ambiguous / meta / fallback）は null */
export function previewBreakdown(state: GameState, judgment: Judgment): RateBreakdown | null {
  if (judgment.metaCheat || judgment.confidence < confidenceThresholds.ambiguous) return null;
  return rateBreakdown(state, judgment);
}

function rollOutcome(
  state: GameState,
  judgment: Judgment,
  rng: Rng,
): { outcome: Outcome; check: Check } {
  const breakdown = rateBreakdown(state, judgment);
  const { rate } = breakdown;
  const roll = Math.floor(rng() * 100) + 1;
  const check = { ...breakdown, roll };
  if (roll >= fumbleFloor) return { outcome: 'fumble', check };
  if (roll <= Math.ceil(rate / 5)) return { outcome: 'critical_success', check };
  if (roll <= rate) return { outcome: 'success', check };
  return { outcome: 'failure', check };
}

export function resolveTurn(
  state: GameState,
  direction: Direction,
  detail: string,
  judgment: Judgment,
  rng: Rng,
): TurnResult {
  // 決着後は何も変えない（FR-020）
  if (state.ending !== null) {
    return {
      state,
      outcome: state.log.at(-1)?.outcome ?? 'ambiguous',
      narration: state.ending.text,
      delta: { hp: 0, sanity: 0, clueId: null },
    };
  }

  const { outcome, check } = judgment.metaCheat
    ? { outcome: 'meta' as const, check: undefined }
    : judgment.confidence < confidenceThresholds.ambiguous
      ? { outcome: 'ambiguous' as const, check: undefined }
      : rollOutcome(state, judgment, rng);

  const succeeded = outcome === 'critical_success' || outcome === 'success';

  // 手がかりは観察の成功でのみ増える。出し尽くしたあとは増えない（AS 2-2）
  const nextClueId =
    Object.keys(state.clues).find((id) => !state.acquiredClueIds.includes(id)) ?? null;
  const observedWell = succeeded && direction === 'observe';
  const acquiredClueId = observedWell ? nextClueId : null;

  const hpDelta = -hpLoss(outcome, direction);
  const sanityDelta = -sanityLoss(outcome, judgment.horrorExposure);
  const hp = clamp(state.investigator.hp + hpDelta, 0, maxHp);
  const sanity = clamp(state.investigator.sanity + sanityDelta, 0, maxSanity);

  const narration = narrateOutcome(state, direction, outcome, rng, {
    clueText: acquiredClueId ? state.clues[acquiredClueId].text : undefined,
    exhausted: observedWell && nextClueId === null,
  });

  let next: GameState = {
    ...state,
    investigator: { ...state.investigator, hp, sanity },
    turn: state.turn + 1,
    // 事前判定は 1 ターン限り（ADR 0004）
    previews: 0,
    preview: null,
    acquiredClueIds: acquiredClueId
      ? [...state.acquiredClueIds, acquiredClueId]
      : state.acquiredClueIds,
  };

  const reason = checkEnding(next, judgment, outcome);
  if (reason !== null) {
    next = {
      ...next,
      ending: { reason, text: narrateEnding(next, reason, rng), reveal: reveal(next) },
    };
  }

  const entry: LogEntry = {
    turn: state.turn,
    direction,
    detail,
    outcome,
    ...(check && { check }),
    narration,
    delta: {
      hp: hp - state.investigator.hp,
      sanity: sanity - state.investigator.sanity,
      clueId: acquiredClueId,
    },
  };
  next = { ...next, log: [...state.log, entry] };

  return { state: next, outcome, narration, delta: entry.delta };
}
