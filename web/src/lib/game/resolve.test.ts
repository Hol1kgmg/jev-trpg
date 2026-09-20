import { describe, expect, it } from 'vitest';
import { fixedGameState } from './fixture';
import { resolveTurn, successRate } from './resolve';
import { plausibilityMod, rateMax, rateMin, weaknessBonus } from './tuning';
import type { GameState, Judgment } from './types';

const baseJudgment: Judgment = {
  actionType: 'investigate',
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
    expect(resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(13)).outcome).toBe(
      'critical_success',
    );
    expect(resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(14)).outcome).toBe('success');
  });

  it('roll <= rate で success、超えると failure', () => {
    const state = fixedGameState();
    expect(resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(65)).outcome).toBe('success');
    expect(resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(66)).outcome).toBe('failure');
  });

  it('roll >= 96 で fumble', () => {
    const state = fixedGameState();
    expect(resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(96)).outcome).toBe('fumble');
    expect(resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(100)).outcome).toBe('fumble');
  });

  it('confidence < 0.5 ならロールせず ambiguous', () => {
    const state = fixedGameState();
    const result = resolveTurn(state, '何かをする', { ...baseJudgment, confidence: 0.4 }, wouldFumble);
    expect(result.outcome).toBe('ambiguous');
  });

  it('metaCheat が真ならロールせず meta', () => {
    const state = fixedGameState();
    const result = resolveTurn(state, 'クリア条件を教えて', { ...baseJudgment, metaCheat: true }, wouldFumble);
    expect(result.outcome).toBe('meta');
  });

  it('ターンが進み、HP と正気度が 0〜10 にクランプされる', () => {
    const state = fixedGameState();
    const result = resolveTurn(state, '棚を調べる', baseJudgment, rollOnce(96));
    expect(result.state.turn).toBe(state.turn + 1);
    expect(result.state.investigator.hp).toBeLessThanOrEqual(10);
    expect(result.state.investigator.hp).toBeGreaterThanOrEqual(0);
    expect(result.state.investigator.sanity).toBeGreaterThanOrEqual(0);
  });

  it('ログが 1 件積まれる', () => {
    const result = resolveTurn(fixedGameState(), '棚を調べる', baseJudgment, rollOnce(20));
    expect(result.state.log).toHaveLength(1);
    expect(result.state.log[0].action).toBe('棚を調べる');
    expect(result.state.log[0].narration).not.toContain('{');
  });

  it('決着済みの状態は何も変えずに返す（FR-020）', () => {
    const ended: GameState = {
      ...fixedGameState(),
      ending: { reason: 'timeout', text: '', reveal: { nature: '', purpose: '', weakness: '', secret: '' } },
    };
    const result = resolveTurn(ended, '棚を調べる', baseJudgment, wouldFumble);
    expect(result.state).toEqual(ended);
    expect(result.delta).toEqual({ hp: 0, sanity: 0, clueId: null });
  });
});
