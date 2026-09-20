// GameState → VisibleState。ここで落とすものが FR-003 の防衛線になる。
// 落とす: 怪異の nature / purpose / weakness / manifestation、clearCondition 全フィールド、
//         未入手 Clue の本文、各 Location.clueIds、探索者の secret。

import { narrateScene, type Rng } from './narrate';
import { MAX_TURN, type GameState, type VisibleState } from './types';

export function toVisible(state: GameState, rng: Rng = Math.random): VisibleState {
  const location = state.locations.find((l) => l.id === state.currentLocationId);
  return {
    occupation: state.investigator.occupation,
    skills: { ...state.investigator.skills },
    items: [...state.investigator.items],
    hp: state.investigator.hp,
    sanity: state.investigator.sanity,
    turn: state.turn,
    maxTurn: MAX_TURN,
    locationName: location?.name ?? '',
    scene: narrateScene(state, rng),
    entityEpithet: state.entity.epithet,
    acquiredClues: state.acquiredClueIds.map((id) => ({ id, text: state.clues[id].text })),
    log: state.log,
    ending: state.ending,
  };
}
