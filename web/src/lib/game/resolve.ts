// 成功率の算出・d100・状態更新。すべてコード側の純関数で、rng は注入する（Constitution I）。
// Judgment を引数に取るだけなので、Jev をモックせずともテストできる（Constitution IV）。

import { checkEnding, reveal } from './ending';
import { narrateEnding, narrateOutcome, type Rng } from './narrate';
import {
  fumbleFloor,
  hpLoss,
  plausibilityMod,
  rateMax,
  rateMin,
  sanityLoss,
  weaknessBonus,
} from './tuning';
import { confidenceThresholds } from './tuning';
import type { GameState, Judgment, LogEntry, Outcome } from './types';

export type TurnDelta = { hp: number; sanity: number; clueId: string | null };

export type TurnResult = {
  state: GameState;
  outcome: Outcome;
  narration: string;
  delta: TurnDelta;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** rate = clamp(skill + plausibilityMod + weaknessBonus, 5, 95) */
export function successRate(state: GameState, judgment: Judgment): number {
  const skill = state.investigator.skills[judgment.skill];
  const plausible = clamp(Math.round(judgment.plausibility), 0, 4);

  const acquired = new Set(state.acquiredClueIds);
  const knowsWeakness = state.entity.weakness.requiredClueIds.every((id) => acquired.has(id));
  const bonus = judgment.exploitsWeakness && knowsWeakness ? weaknessBonus : 0;

  return clamp(skill + plausibilityMod[plausible] + bonus, rateMin, rateMax);
}

function rollOutcome(state: GameState, judgment: Judgment, rng: Rng): Outcome {
  const rate = successRate(state, judgment);
  const roll = Math.floor(rng() * 100) + 1;
  if (roll >= fumbleFloor) return 'fumble';
  if (roll <= Math.ceil(rate / 5)) return 'critical_success';
  if (roll <= rate) return 'success';
  return 'failure';
}

export function resolveTurn(
  state: GameState,
  action: string,
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

  const outcome: Outcome = judgment.metaCheat
    ? 'meta'
    : judgment.confidence < confidenceThresholds.ambiguous
      ? 'ambiguous'
      : rollOutcome(state, judgment, rng);

  const succeeded = outcome === 'critical_success' || outcome === 'success';

  // 手がかり入手。同じ場所の再調査では増えない（AS 2-2）
  const alreadySearched = state.investigatedLocationIds.includes(state.currentLocationId);
  const location = state.locations.find((l) => l.id === state.currentLocationId);
  const acquiredClueId =
    succeeded && judgment.actionType === 'investigate' && !alreadySearched
      ? (location?.clueIds.find((id) => !state.acquiredClueIds.includes(id)) ?? null)
      : null;

  const hpDelta = -hpLoss(outcome, judgment.actionType);
  const sanityDelta = -sanityLoss(outcome, judgment.horrorExposure);
  const hp = clamp(state.investigator.hp + hpDelta, 0, 10);
  const sanity = clamp(state.investigator.sanity + sanityDelta, 0, 10);

  const narration = narrateOutcome(state, judgment.actionType, outcome, rng, {
    clueText: acquiredClueId ? state.clues[acquiredClueId].text : undefined,
    exhausted: judgment.actionType === 'investigate' && succeeded && alreadySearched,
  });

  // escape に成功すると隣の場所へ移る。
  // ponytail: 場所は環状に並べるだけで、接続グラフは持たない。行き先を選ばせたくなったら入れる。
  const index = state.locations.findIndex((l) => l.id === state.currentLocationId);
  const moved =
    succeeded && judgment.actionType === 'escape'
      ? state.locations[(index + 1) % state.locations.length].id
      : state.currentLocationId;

  let next: GameState = {
    ...state,
    currentLocationId: moved,
    investigator: { ...state.investigator, hp, sanity },
    turn: state.turn + 1,
    acquiredClueIds: acquiredClueId
      ? [...state.acquiredClueIds, acquiredClueId]
      : state.acquiredClueIds,
    investigatedLocationIds:
      judgment.actionType === 'investigate' && succeeded && !alreadySearched
        ? [...state.investigatedLocationIds, state.currentLocationId]
        : state.investigatedLocationIds,
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
    action,
    outcome,
    narration,
    delta: { hp: hp - state.investigator.hp, sanity: sanity - state.investigator.sanity, clueId: acquiredClueId },
  };
  next = { ...next, log: [...state.log, entry] };

  return { state: next, outcome, narration, delta: entry.delta };
}
