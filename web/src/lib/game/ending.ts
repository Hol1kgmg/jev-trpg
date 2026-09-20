// 終了判定。判定順は固定する（data-model.md）。
// clear を最優先にすることで、決着の一撃と引き換えに HP が 0 になったケースが死亡に倒れない。

import { narrateEnding, type Rng } from './narrate';
import { maxTurn } from './tuning';
import {
  ROUTE_DIRECTIONS,
  type Direction,
  type Ending,
  type GameState,
  type Judgment,
  type Outcome,
  type RouteDirection,
} from './types';

const successOutcomes: Outcome[] = ['critical_success', 'success'];

/** 必要な手がかりが揃い、決着を狙えるルート */
export function readyRoutes(state: GameState): RouteDirection[] {
  const acquired = new Set(state.acquiredClueIds);
  return ROUTE_DIRECTIONS.filter((dir) =>
    state.routes[dir].requiredClueIds.every((id) => acquired.has(id)),
  );
}

/** 状態更新後の GameState を渡す。決着していなければ null */
export function checkEnding(
  state: GameState,
  direction: Direction,
  judgment: Judgment,
  outcome: Outcome,
): Ending['reason'] | null {
  const ready = direction !== 'observe' && readyRoutes(state).includes(direction);
  if (ready && judgment.meetsClear && successOutcomes.includes(outcome)) {
    return 'clear';
  }
  if (state.investigator.hp <= 0) return 'death';
  if (state.investigator.sanity <= 0) return 'madness';
  if (state.turn > maxTurn) return 'timeout';
  return null;
}

/** プレイヤーが途中で降りる。ログは増えず、決着だけが付く。決着後は何も変えない */
export function retire(state: GameState, rng: Rng): GameState {
  if (state.ending !== null) return state;
  const reason = 'retire';
  return {
    ...state,
    preview: null,
    ending: { reason, text: narrateEnding(state, reason, rng), reveal: reveal(state) },
  };
}

export function reveal(state: GameState): Ending['reveal'] {
  return {
    nature: state.entity.nature,
    purpose: state.entity.purpose,
    weakness: state.entity.weakness,
    secret: state.investigator.secret,
  };
}
