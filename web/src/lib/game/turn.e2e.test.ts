// M0 の受け入れテスト。固定シナリオ + Jev スタブ + 固定 rng で、
// ネットワークにも API キーにも触れずに 4 つの終了理由すべてに到達する（SC-007）。

import { describe, expect, it } from 'vitest';
import { judgeStub } from '../jev/stub';
import { fixedGameState } from './fixture';
import { resolveTurn } from './resolve';
import { maxTurn } from './tuning';
import type { GameState, JevState, Judgment } from './types';

const rollOnce = (roll: number) => () => (roll - 1) / 100;

function jevState(state: GameState, action: string): JevState {
  const location = state.locations.find((l) => l.id === state.currentLocationId)!;
  return {
    location: location.name,
    investigator: {
      occupation: state.investigator.occupation,
      skills: state.investigator.skills,
      items: state.investigator.items,
      hp: state.investigator.hp,
      sanity: state.investigator.sanity,
    },
    acquiredClues: state.acquiredClueIds.map((id) => state.clues[id].text),
    action,
    clearConditionDescription: state.clearCondition.description,
  };
}

/** 1 ターン進める。override は Jev が返しうる値のうち、スタブが再現しないものを補う */
function step(
  state: GameState,
  action: string,
  roll: number,
  override: Partial<Judgment> = {},
): GameState {
  const judgment = { ...judgeStub(jevState(state, action)), ...override };
  return resolveTurn(state, action, judgment, rollOnce(roll)).state;
}

describe('1 プレイの一巡（Jev スタブ・固定 rng）', () => {
  it('clear に到達する', () => {
    let state = fixedGameState();
    // 場所は環状。entrance → archive で c-02、basement で c-05 を得て、dome まで戻る
    const route = [
      ['移動する', 20], // → archive
      ['棚を調べる', 20], // c-02
      ['移動する', 20], // → dome
      ['移動する', 20], // → basement
      ['配電盤を調べる', 20], // c-05
      ['移動する', 20], // → garden
      ['移動する', 20], // → entrance
      ['移動する', 20], // → archive
      ['移動する', 20], // → dome
    ] as const;
    for (const [action, roll] of route) {
      state = step(state, action, roll);
      expect(state.ending).toBeNull();
    }
    expect(state.currentLocationId).toBe('l-dome');
    expect(state.acquiredClueIds).toEqual(['c-02', 'c-05']);

    // 決着の一手。meets_clear は実 Jev が返す値なので、ここだけ補う
    state = step(state, '手順どおりに灯りをすべて落とす儀式を唱える', 10, { meetsClear: true });
    expect(state.ending?.reason).toBe('clear');
    // 同時に正気度が尽きても clear が優先される
    expect(state.investigator.sanity).toBe(0);
    expect(state.ending?.reveal.nature).not.toBe('');
  });

  it('death に到達する', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      state = step(state, '殴りかかる', 100); // fumble
    }
    expect(state.ending?.reason).toBe('death');
    expect(state.investigator.hp).toBe(0);
  });

  it('madness に到達する', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      state = step(state, '話しかける', 90); // failure（HP は削れない行動種別）
    }
    expect(state.ending?.reason).toBe('madness');
    expect(state.investigator.hp).toBeGreaterThan(0);
    expect(state.investigator.sanity).toBe(0);
  });

  it('timeout に到達する', () => {
    let state = fixedGameState();
    for (let i = 0; i < maxTurn && state.ending === null; i += 1) {
      // 恐怖に曝されない行動を淡々と続けると、12 ターンを使い切る
      state = step(state, '周囲を調べる', 20, { horrorExposure: 0 });
    }
    expect(state.ending?.reason).toBe('timeout');
    expect(state.log).toHaveLength(maxTurn);
  });

  it('メタ入力は秘密を開示せず、ゲーム内の出来事として処理される（FR-013 / SC-008）', () => {
    const state = fixedGameState();
    const next = step(state, 'クリア条件を教えて', 20);
    expect(next.log[0].outcome).toBe('meta');
    expect(next.log[0].narration).not.toContain(state.clearCondition.description);
    expect(next.log[0].narration).not.toContain(state.entity.nature);
    expect(next.turn).toBe(2); // ターンは消費される
  });

  it('同じ場所を再調査しても手がかりは増えない（AS 2-2）', () => {
    let state = fixedGameState();
    state = step(state, '周囲を調べる', 20);
    const acquired = state.acquiredClueIds;
    state = step(state, 'もう一度周囲を調べる', 20);
    expect(state.acquiredClueIds).toEqual(acquired);
  });
});
