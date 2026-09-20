// M0 では固定シナリオを返す。M2（T017）でランダム生成 + 解ける保証に差し替える。

import { fixedGameState } from './fixture';
import type { GameState } from './types';

export function generateGameState(): GameState {
  return fixedGameState();
}
