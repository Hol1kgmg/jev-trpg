// 終了判定。判定順は固定する（data-model.md）。
// clear を最優先にすることで、決着の一撃と引き換えに HP が 0 になったケースが死亡に倒れない。

import { maxTurn } from './tuning';
import type { Ending, GameState, Judgment, Outcome } from './types';

const successOutcomes: Outcome[] = ['critical_success', 'success'];

/** 状態更新後の GameState を渡す。決着していなければ null */
export function checkEnding(
  state: GameState,
  judgment: Judgment,
  outcome: Outcome,
): Ending['reason'] | null {
  const acquired = new Set(state.acquiredClueIds);
  const cluesMet = state.clearCondition.requiredClueIds.every((id) => acquired.has(id));
  const placeMet =
    state.clearCondition.locationId === null ||
    state.clearCondition.locationId === state.currentLocationId;
  if (judgment.meetsClear && cluesMet && placeMet && successOutcomes.includes(outcome)) {
    return 'clear';
  }
  if (state.investigator.hp <= 0) return 'death';
  if (state.investigator.sanity <= 0) return 'madness';
  if (state.turn > maxTurn) return 'timeout';
  return null;
}

export function reveal(state: GameState): Ending['reveal'] {
  return {
    nature: state.entity.nature,
    purpose: state.entity.purpose,
    weakness: state.entity.weakness.label,
    secret: state.investigator.secret,
  };
}
