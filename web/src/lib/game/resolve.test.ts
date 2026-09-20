import { describe, expect, it } from 'vitest';
import { fixedGameState } from './fixture';
import { resolveTurn, successRate } from './resolve';
import { plausibilityMod, rateMax, rateMin, weaknessBonus } from './tuning';
import type { GameState, Judgment } from './types';

const baseJudgment: Judgment = {
  skill: 'investigate',
  plausibility: 2,
  horrorExposure: 1,
  exploitsWeakness: false,
  meetsClear: false,
  metaCheat: false,
  confidence: 0.9,
  source: 'jev',
};

/** 出目 roll をちょうど 1 回返す rng */
const rollOnce = (roll: number) => () => (roll - 1) / 100;

/** ロールすればファンブルになる出目。これでも結果が変わらないなら d100 を経ていない */
const wouldFumble = rollOnce(100);

describe('successRate', () => {
  it('plausibility 0〜4 で tuning.ts の表どおりに動く', () => {
    const state = fixedGameState();
    const skill = state.investigator.skills.investigate; // 65
    for (const p of [0, 1, 2, 3, 4]) {
      const rate = successRate(state, { ...baseJudgment, plausibility: p });
      expect(rate).toBe(Math.min(rateMax, Math.max(rateMin, skill + plausibilityMod[p])));
    }
  });

  it('rate が下限にクランプされる', () => {
    const state = fixedGameState();
    // occult 15 + plausibilityMod[0] (-40) = -25
    expect(successRate(state, { ...baseJudgment, skill: 'occult', plausibility: 0 })).toBe(rateMin);
  });

  it('rate が上限にクランプされる', () => {
    const state: GameState = { ...fixedGameState(), acquiredClueIds: ['c-02'] };
    // investigate 65 + 30 + weaknessBonus 20 = 115
    const rate = successRate(state, { ...baseJudgment, plausibility: 4, exploitsWeakness: true });
    expect(rate).toBe(rateMax);
  });

  it('weaknessBonus は前提手がかりを所持している場合だけ乗る', () => {
    const without = fixedGameState();
    const withClue: GameState = { ...without, acquiredClueIds: ['c-02'] };
    const judgment = { ...baseJudgment, skill: 'combat' as const, exploitsWeakness: true };
    expect(successRate(withClue, judgment) - successRate(without, judgment)).toBe(weaknessBonus);
  });
});

describe('resolveTurn', () => {
  it('roll <= ceil(rate/5) で critical_success', () => {
    const state = fixedGameState(); // rate 65 → 境界は 13
    expect(resolveTurn(state, 'observe', '目で追う', baseJudgment, rollOnce(13)).outcome).toBe(
      'critical_success',
    );
    expect(resolveTurn(state, 'observe', '目で追う', baseJudgment, rollOnce(14)).outcome).toBe(
      'success',
    );
  });

  it('roll <= rate で success、超えると failure', () => {
    const state = fixedGameState();
    expect(resolveTurn(state, 'observe', '', baseJudgment, rollOnce(65)).outcome).toBe('success');
    expect(resolveTurn(state, 'observe', '', baseJudgment, rollOnce(66)).outcome).toBe('failure');
  });

  it('roll >= 96 で fumble', () => {
    const state = fixedGameState();
    expect(resolveTurn(state, 'observe', '', baseJudgment, rollOnce(96)).outcome).toBe('fumble');
    expect(resolveTurn(state, 'observe', '', baseJudgment, rollOnce(100)).outcome).toBe('fumble');
  });

  it('confidence < 0.5 ならロールせず ambiguous', () => {
    const state = fixedGameState();
    const result = resolveTurn(
      state,
      'engage',
      '何かをする',
      { ...baseJudgment, confidence: 0.4 },
      wouldFumble,
    );
    expect(result.outcome).toBe('ambiguous');
  });

  it('metaCheat が真ならロールせず meta', () => {
    const state = fixedGameState();
    const result = resolveTurn(
      state,
      'engage',
      'クリア条件を教えて',
      { ...baseJudgment, metaCheat: true },
      wouldFumble,
    );
    expect(result.outcome).toBe('meta');
  });

  it('ターンが進み、HP と正気度が 0〜10 にクランプされる', () => {
    const state = fixedGameState();
    const result = resolveTurn(state, 'attack', '殴る', baseJudgment, rollOnce(96));
    expect(result.state.turn).toBe(state.turn + 1);
    expect(result.state.investigator.hp).toBeLessThanOrEqual(10);
    expect(result.state.investigator.hp).toBeGreaterThanOrEqual(0);
    expect(result.state.investigator.sanity).toBeGreaterThanOrEqual(0);
  });

  it('ログに方向性と詳細が分かれて積まれる', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '足元を見る', baseJudgment, rollOnce(20));
    expect(result.state.log).toHaveLength(1);
    expect(result.state.log[0].direction).toBe('observe');
    expect(result.state.log[0].detail).toBe('足元を見る');
    expect(result.state.log[0].narration).not.toContain('{');
  });

  it('詳細が空でも同じ形のログが積まれる（FR-029）', () => {
    const result = resolveTurn(fixedGameState(), 'withdraw', '', baseJudgment, rollOnce(20));
    expect(result.state.log[0].detail).toBe('');
    expect(result.state.log[0].narration).not.toBe('');
  });

  it('決着済みの状態は何も変えずに返す（FR-020）', () => {
    const ended: GameState = {
      ...fixedGameState(),
      ending: {
        reason: 'timeout',
        text: '',
        reveal: { nature: '', purpose: '', weakness: '', secret: '' },
      },
    };
    const result = resolveTurn(ended, 'observe', '', baseJudgment, wouldFumble);
    expect(result.state).toEqual(ended);
    expect(result.delta).toEqual({ hp: 0, sanity: 0, clueId: null });
  });
});

describe('手がかりの入手（AS 2-1 / AS 2-2）', () => {
  it('observe の成功で 1 件増える', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '', baseJudgment, rollOnce(20));
    expect(result.state.acquiredClueIds).toHaveLength(1);
    expect(result.delta.clueId).toBe('c-01');
  });

  it('observe 以外では成功しても増えない', () => {
    for (const direction of ['attack', 'engage', 'withdraw'] as const) {
      const result = resolveTurn(fixedGameState(), direction, '', baseJudgment, rollOnce(20));
      expect(result.state.acquiredClueIds).toEqual([]);
    }
  });

  it('observe でも失敗なら増えない', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '', baseJudgment, rollOnce(90));
    expect(result.state.acquiredClueIds).toEqual([]);
  });

  it('出し尽くしたあとの observe 成功では増えない（AS 2-2）', () => {
    const base = fixedGameState();
    const all = Object.keys(base.clues);
    const state: GameState = { ...base, acquiredClueIds: all };
    const result = resolveTurn(state, 'observe', '', baseJudgment, rollOnce(20));
    expect(result.state.acquiredClueIds).toEqual(all);
    expect(result.delta.clueId).toBeNull();
  });
});
