import { describe, expect, it } from 'vitest';
import { checkEnding, readyRoutes, retire } from './ending';
import { fixedGameState } from './fixture';
import { maxTurn } from './tuning';
import type { GameState, Judgment } from './types';

const judgment: Judgment = {
  plausibility: 4,
  horrorExposure: 2,
  meetsClear: true,
  metaCheat: false,
  confidence: 0.9,
  source: 'jev',
};

/** attack ルートの前提を揃えた状態 */
function clearable(overrides: Partial<GameState['investigator']> = {}): GameState {
  const base = fixedGameState();
  return {
    ...base,
    investigator: { ...base.investigator, ...overrides },
    acquiredClueIds: ['c-02', 'c-05'],
  };
}

describe('readyRoutes', () => {
  it('前提が揃ったルートだけを返す', () => {
    expect(readyRoutes(fixedGameState())).toEqual([]);
    expect(readyRoutes(clearable())).toEqual(['attack']);
    expect(readyRoutes({ ...clearable(), acquiredClueIds: ['c-01', 'c-06'] })).toEqual(['withdraw']);
    expect(
      readyRoutes({ ...clearable(), acquiredClueIds: ['c-01', 'c-02', 'c-03', 'c-04', 'c-05', 'c-06'] }),
    ).toEqual(['attack', 'engage', 'withdraw']);
  });
});

describe('checkEnding', () => {
  it('揃ったルートの方針で条件を満たし成功系なら clear', () => {
    expect(checkEnding(clearable(), 'attack', judgment, 'success')).toBe('clear');
    expect(checkEnding(clearable(), 'attack', judgment, 'critical_success')).toBe('clear');
  });

  it('揃っていないルートの方針では clear にならない', () => {
    expect(checkEnding(clearable(), 'engage', judgment, 'success')).toBeNull();
    expect(checkEnding(clearable(), 'withdraw', judgment, 'success')).toBeNull();
  });

  it('observe では meetsClear でも clear にならない', () => {
    expect(checkEnding(clearable(), 'observe', judgment, 'success')).toBeNull();
  });

  it('クリアと同時に hp が 0 になっても clear が優先される', () => {
    expect(checkEnding(clearable({ hp: 0 }), 'attack', judgment, 'success')).toBe('clear');
  });

  it('クリアと同時に正気度が 0 になっても clear が優先される', () => {
    expect(checkEnding(clearable({ sanity: 0 }), 'attack', judgment, 'success')).toBe('clear');
  });

  it('meetsClear でも成功系でなければ clear にならない', () => {
    expect(checkEnding(clearable(), 'attack', judgment, 'failure')).toBeNull();
  });

  it('手がかりが揃っていなければ clear にならない', () => {
    const state: GameState = { ...clearable(), acquiredClueIds: ['c-02'] };
    expect(checkEnding(state, 'attack', judgment, 'success')).toBeNull();
  });

  it('hp <= 0 は death', () => {
    const base = fixedGameState();
    const state: GameState = { ...base, investigator: { ...base.investigator, hp: 0 } };
    expect(checkEnding(state, 'attack', judgment, 'fumble')).toBe('death');
  });

  it('death は madness より優先される', () => {
    const base = fixedGameState();
    const state: GameState = { ...base, investigator: { ...base.investigator, hp: 0, sanity: 0 } };
    expect(checkEnding(state, 'attack', judgment, 'fumble')).toBe('death');
  });

  it('sanity <= 0 は madness', () => {
    const base = fixedGameState();
    const state: GameState = { ...base, investigator: { ...base.investigator, sanity: 0 } };
    expect(checkEnding(state, 'attack', judgment, 'failure')).toBe('madness');
  });

  it('turn > maxTurn（8）は timeout', () => {
    expect(checkEnding({ ...fixedGameState(), turn: maxTurn }, 'attack', judgment, 'failure')).toBeNull();
    expect(
      checkEnding({ ...fixedGameState(), turn: maxTurn + 1 }, 'attack', judgment, 'failure'),
    ).toBe('timeout');
  });

  it('madness は timeout より優先される', () => {
    const base = fixedGameState();
    const state: GameState = {
      ...base,
      turn: maxTurn + 1,
      investigator: { ...base.investigator, sanity: 0 },
    };
    expect(checkEnding(state, 'attack', judgment, 'failure')).toBe('madness');
  });

  it('どれにも当たらなければ null', () => {
    expect(checkEnding(fixedGameState(), 'attack', judgment, 'failure')).toBeNull();
  });
});

describe('retire', () => {
  it('ログを増やさず retire で決着し、正体を開示する', () => {
    const base = fixedGameState();
    const next = retire(base, () => 0);
    expect(next.ending?.reason).toBe('retire');
    expect(next.ending?.reveal.nature).toBe(base.entity.nature);
    expect(next.log).toEqual(base.log);
    expect(next.turn).toBe(base.turn);
  });

  it('決着後は何も変えない', () => {
    const ended = retire(fixedGameState(), () => 0);
    expect(retire(ended, () => 0.5)).toBe(ended);
  });
});
