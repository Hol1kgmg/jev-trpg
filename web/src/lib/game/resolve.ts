// 成功率の算出・d100・状態更新。すべてコード側の純関数で、rng は注入する（Constitution I）。
// Judgment を引数に取るだけなので、Jev をモックせずともテストできる（Constitution IV）。

import { checkEnding, readyRoutes, reveal } from './ending';
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
  routeBonus,
  sanityLoss,
} from './tuning';
import {
  DIRECTION_SKILL,
  type Check,
  type Direction,
  type GameState,
  type Judgment,
  type LogEntry,
  type Outcome,
  type RateBreakdown,
} from './types';

export type TurnDelta = { hp: number; sanity: number; clueId: string | null };

export type TurnResult = {
  state: GameState;
  outcome: Outcome;
  narration: string;
  delta: TurnDelta;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** rate = clamp(skill + plausibilityMod + routeBonus, 5, 95)。技能は方針で確定する。内訳ごと返す */
export function rateBreakdown(
  state: GameState,
  direction: Direction,
  judgment: Judgment,
): RateBreakdown {
  const skill = DIRECTION_SKILL[direction];
  const base = state.investigator.skills[skill];
  const plausible = clamp(Math.round(judgment.plausibility), 0, 4);

  // 決め手は「手がかりが揃ったルート」で「その条件を満たす行動」をしたときだけ
  const ready = direction !== 'observe' && readyRoutes(state).includes(direction);
  const route = ready && judgment.meetsClear ? routeBonus : 0;

  const plausibility = plausibilityMod[plausible];
  return {
    skill,
    base,
    plausibility,
    route,
    rate: clamp(base + plausibility + route, rateMin, rateMax),
  };
}

export const successRate = (state: GameState, direction: Direction, judgment: Judgment): number =>
  rateBreakdown(state, direction, judgment).rate;

/** 事前判定でプレイヤーに見せる内訳。ロールしない判定（ambiguous / meta / fallback）は null */
export function previewBreakdown(
  state: GameState,
  direction: Direction,
  judgment: Judgment,
): RateBreakdown | null {
  if (judgment.metaCheat || judgment.confidence < confidenceThresholds.ambiguous) return null;
  return rateBreakdown(state, direction, judgment);
}

function rollOutcome(
  state: GameState,
  direction: Direction,
  judgment: Judgment,
  rng: Rng,
): { outcome: Outcome; check: Check } {
  const breakdown = rateBreakdown(state, direction, judgment);
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
      : rollOutcome(state, direction, judgment, rng);

  const succeeded = outcome === 'critical_success' || outcome === 'success';

  // 観察は「見えるか」ではなく「いくらで見えるか」の判定。失敗でも手がかりは得る（正気度で払う）。
  // 得られないのは致命的失敗と、ロールしないターンだけ。出し尽くしたあとは増えない（AS 2-2）
  const nextClueId =
    Object.keys(state.clues).find((id) => !state.acquiredClueIds.includes(id)) ?? null;
  const observed = direction === 'observe' && (succeeded || outcome === 'failure');
  const acquiredClueId = observed ? nextClueId : null;

  const hpDelta = -hpLoss(outcome, direction);
  const sanityDelta = -sanityLoss(outcome, judgment.horrorExposure);
  const hp = clamp(state.investigator.hp + hpDelta, 0, maxHp);
  const sanity = clamp(state.investigator.sanity + sanityDelta, 0, maxSanity);

  const narration = narrateOutcome(state, direction, outcome, rng, {
    clueText: acquiredClueId ? state.clues[acquiredClueId].text : undefined,
    exhausted: observed && nextClueId === null,
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

  const reason = checkEnding(next, direction, judgment, outcome);
  if (reason !== null) {
    next = {
      ...next,
      ending: { reason, text: narrateEnding(next, reason, rng, direction), reveal: reveal(next) },
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
