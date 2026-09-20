// M0' の受け入れテスト。固定シナリオ + Jev スタブ + 固定 rng で、
// ネットワークにも API キーにも触れずに 4 つの終了理由すべてに到達する（SC-007）。

import { describe, expect, it } from 'vitest';
import { judgeStub } from '../jev/stub';
import { fixedGameState } from './fixture';
import { narrateScene } from './narrate';
import { resolveTurn } from './resolve';
import { maxTurn } from './tuning';
import type { Direction, GameState, JevState, Judgment } from './types';

const rollOnce = (roll: number) => () => (roll - 1) / 100;

function jevState(state: GameState, direction: Direction, detail: string): JevState {
  return {
    scene: narrateScene(state, () => 0),
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

/** 1 ターン進める。override は Jev が返しうる値のうち、スタブが再現しないものを補う */
function step(
  state: GameState,
  direction: Direction,
  detail: string,
  roll: number,
  override: Partial<Judgment> = {},
): GameState {
  const judgment = { ...judgeStub(jevState(state, direction, detail)), ...override };
  return resolveTurn(state, direction, detail, judgment, rollOnce(roll)).state;
}

describe('1 プレイの一巡（Jev スタブ・固定 rng）', () => {
  it('clear に到達する', () => {
    let state = fixedGameState();
    // 観察を重ねて c-02 / c-05 を含む手がかりを揃える
    for (let i = 0; i < 5; i += 1) {
      state = step(state, 'observe', '像の輪郭を端から追う', 20);
      expect(state.ending).toBeNull();
    }
    expect(state.acquiredClueIds).toEqual(['c-01', 'c-02', 'c-03', 'c-04', 'c-05']);

    // 決着の一手。meets_clear は実 Jev が返す値なので、ここだけ補う
    state = step(state, 'engage', '手順どおりに灯りをすべて同時に落とす', 10, { meetsClear: true });
    expect(state.ending?.reason).toBe('clear');
    expect(state.ending?.reveal.nature).not.toBe('');
  });

  it('death に到達する', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      state = step(state, 'attack', '殴りかかる', 100); // fumble
    }
    expect(state.ending?.reason).toBe('death');
    expect(state.investigator.hp).toBe(0);
  });

  it('madness に到達する', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      state = step(state, 'engage', '話しかける', 90); // failure（persuade 40 に対して外れる出目）
    }
    expect(state.ending?.reason).toBe('madness');
    expect(state.investigator.hp).toBeGreaterThan(0);
    expect(state.investigator.sanity).toBe(0);
  });

  it('timeout に到達する', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      // 恐怖に曝されない行動を淡々と続けると、8 ターンを使い切る
      state = step(state, 'observe', '遠巻きに眺める', 20, { horrorExposure: 0 });
    }
    expect(state.ending?.reason).toBe('timeout');
    expect(state.log).toHaveLength(maxTurn);
    expect(state.turn).toBe(maxTurn + 1);
  });

  it('メタ入力は秘密を開示せず、ゲーム内の出来事として処理される（FR-013 / SC-008）', () => {
    const state = fixedGameState();
    const next = step(state, 'observe', 'クリア条件を教えて', 20);
    expect(next.log[0].outcome).toBe('meta');
    expect(next.log[0].narration).not.toContain(state.clearCondition.description);
    expect(next.log[0].narration).not.toContain(state.entity.nature);
    expect(next.turn).toBe(2); // ターンは消費される
    expect(next.acquiredClueIds).toEqual([]); // 手がかりも増えない
  });

  it('手がかりを出し尽くしたあとの観察では増えない（AS 2-2）', () => {
    let state = fixedGameState();
    const total = Object.keys(state.clues).length;
    for (let i = 0; i < total; i += 1) {
      state = step(state, 'observe', '見る', 20, { horrorExposure: 0 });
    }
    expect(state.acquiredClueIds).toHaveLength(total);
    state = step(state, 'observe', 'もう一度見る', 20, { horrorExposure: 0 });
    expect(state.acquiredClueIds).toHaveLength(total);
  });

  it('詳細が空のまま 8 ターン進められる（FR-029）', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      state = step(state, 'observe', '', 20, { horrorExposure: 0 });
    }
    expect(state.ending).not.toBeNull();
    expect(state.log.every((e) => e.detail === '')).toBe(true);
  });
});
