// GameState → VisibleState。ここで落とすものが FR-003 の防衛線になる。
// 落とす: 怪異の nature / purpose / weakness / manifestation、routes の条件文と前提 id、
//         未入手 Clue の本文、探索者の secret。
// 開示する: どのルートが開いたか（方針名だけ）。条件文は含まない（FR-017a）。

import { readyRoutes } from './ending';
import { narrateScene, type Rng } from './narrate';
import { MAX_TURN, type GameState, type VisibleState } from './types';

export function toVisible(state: GameState, rng: Rng = Math.random): VisibleState {
  return {
    occupation: state.investigator.occupation,
    skills: { ...state.investigator.skills },
    items: [...state.investigator.items],
    hp: state.investigator.hp,
    sanity: state.investigator.sanity,
    turn: state.turn,
    maxTurn: MAX_TURN,
    scene: narrateScene(state, rng),
    entityEpithet: state.entity.epithet,
    entityAppearance: state.entity.appearance,
    acquiredClues: state.acquiredClueIds.map((id) => ({
      id,
      text: state.clues[id].text,
      hints: [...state.clues[id].hints],
    })),
    readyDirections: readyRoutes(state),
    log: state.log,
    ending: state.ending,
  };
}
