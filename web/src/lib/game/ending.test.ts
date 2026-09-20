import { describe, expect, it } from 'vitest';
import { checkEnding } from './ending';
import { fixedGameState } from './fixture';
import type { GameState, Judgment } from './types';

const judgment: Judgment = {
  actionType: 'ritual',
  skill: 'occult',
  plausibility: 4,
  horrorExposure: 2,
  exploitsWeakness: true,
  meetsClear: true,
  metaCheat: false,
  confidence: 0.9,
  source: 'jev',
};

/** クリア条件を満たした直後の状態（必要な手がかりを揃え、条件の場所にいる） */
function clearable(overrides: Partial<GameState['investigator']> = {}): GameState {
  const base = fixedGameState();
  return {
    ...base,
    investigator: { ...base.investigator, ...overrides },
    currentLocationId: base.clearCondition.locationId!,
    acquiredClueIds: ['c-02', 'c-05'],
  };
}

describe('checkEnding', () => {
  it('条件を満たし成功系なら clear', () => {
    expect(checkEnding(clearable(), judgment, 'success')).toBe('clear');
    expect(checkEnding(clearable(), judgment, 'critical_success')).toBe('clear');
  });

  it('クリアと同時に hp が 0 になっても clear が優先される', () => {
    expect(checkEnding(clearable({ hp: 0 }), judgment, 'success')).toBe('clear');
  });

  it('クリアと同時に正気度が 0 になっても clear が優先される', () => {
    expect(checkEnding(clearable({ sanity: 0 }), judgment, 'success')).toBe('clear');
  });

  it('meetsClear でも成功系でなければ clear にならない', () => {
    expect(checkEnding(clearable(), judgment, 'failure')).toBeNull();
  });

  it('手がかりが揃っていなければ clear にならない', () => {
    const state: GameState = { ...clearable(), acquiredClueIds: ['c-02'] };
    expect(checkEnding(state, judgment, 'success')).toBeNull();
  });

  it('条件の場所にいなければ clear にならない', () => {
    const state: GameState = { ...clearable(), currentLocationId: 'l-entrance' };
    expect(checkEnding(state, judgment, 'success')).toBeNull();
  });

  it('hp <= 0 は death', () => {
    const base = fixedGameState();
    const state: GameState = { ...base, investigator: { ...base.investigator, hp: 0 } };
    expect(checkEnding(state, judgment, 'fumble')).toBe('death');
  });

  it('death は madness より優先される', () => {
    const base = fixedGameState();
    const state: GameState = { ...base, investigator: { ...base.investigator, hp: 0, sanity: 0 } };
    expect(checkEnding(state, judgment, 'fumble')).toBe('death');
  });

  it('sanity <= 0 は madness', () => {
    const base = fixedGameState();
    const state: GameState = { ...base, investigator: { ...base.investigator, sanity: 0 } };
    expect(checkEnding(state, judgment, 'failure')).toBe('madness');
  });

  it('turn > 12 は timeout', () => {
    expect(checkEnding({ ...fixedGameState(), turn: 13 }, judgment, 'failure')).toBe('timeout');
  });

  it('madness は timeout より優先される', () => {
    const base = fixedGameState();
    const state: GameState = {
      ...base,
      turn: 13,
      investigator: { ...base.investigator, sanity: 0 },
    };
    expect(checkEnding(state, judgment, 'failure')).toBe('madness');
  });

  it('どれにも当たらなければ null', () => {
    expect(checkEnding(fixedGameState(), judgment, 'failure')).toBeNull();
  });
});
