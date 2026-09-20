// GameState → JevState。渡すのは判定に必要な最小限だけ（contracts/jev-questions.md）。
// プレイヤーの入力文字列は action.detail に値として渡すだけで、instructions へ連結しない。

import { narrateScene } from '@/lib/game/narrate';
import type { Direction, GameState, JevState } from '@/lib/game/types';

export function jevState(state: GameState, direction: Direction, detail: string): JevState {
  return {
    scene: narrateScene(state, Math.random),
    investigator: {
      occupation: state.investigator.occupation,
      skills: state.investigator.skills,
      items: state.investigator.items,
      hp: state.investigator.hp,
      sanity: state.investigator.sanity,
    },
    acquiredClues: state.acquiredClueIds.map((id) => state.clues[id].text),
    action: { direction, detail },
  };
}
