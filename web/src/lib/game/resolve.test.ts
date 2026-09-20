import { describe, expect, it } from 'vitest';
import { fixedGameState } from './fixture';
import { previewBreakdown, rateBreakdown, resolveTurn, successRate } from './resolve';
import { plausibilityMod, rateMax, rateMin, routeBonus } from './tuning';
import type { GameState, Judgment } from './types';

const baseJudgment: Judgment = {
  plausibility: 2,
  horrorExposure: 1,
  meetsClear: false,
  metaCheat: false,
  confidence: 0.9,
  source: 'jev',
};

/** 出目 roll をちょうど 1 回返す rng */
const rollOnce = (roll: number) => () => (roll - 1) / 100;

/** ロールすればファンブルになる出目。これでも結果が変わらないなら d100 を経ていない */
const wouldFumble = rollOnce(100);

/** attack ルートの前提を揃えた状態 */
const attackReady = (): GameState => ({ ...fixedGameState(), acquiredClueIds: ['c-02', 'c-05'] });

describe('successRate', () => {
  it('技能は方針で確定し、plausibility 0〜4 で tuning.ts の表どおりに動く', () => {
    const state = fixedGameState();
    const skill = state.investigator.skills.investigate; // 65
    for (const p of [0, 1, 2, 3, 4]) {
      const rate = successRate(state, 'observe', { ...baseJudgment, plausibility: p });
      expect(rate).toBe(Math.min(rateMax, Math.max(rateMin, skill + plausibilityMod[p])));
    }
    expect(successRate(state, 'attack', baseJudgment)).toBe(25);
    expect(successRate(state, 'engage', baseJudgment)).toBe(40);
    expect(successRate(state, 'withdraw', baseJudgment)).toBe(50);
  });

  it('rate が下限にクランプされる', () => {
    const state = fixedGameState();
    // combat 25 + plausibilityMod[0] (-40) = -15
    expect(successRate(state, 'attack', { ...baseJudgment, plausibility: 0 })).toBe(rateMin);
  });

  it('rate が上限にクランプされる', () => {
    // investigate 65 + 30 = 95、さらに withdraw 50 + 30 + routeBonus 20 = 100 → 95
    expect(successRate(fixedGameState(), 'observe', { ...baseJudgment, plausibility: 4 })).toBe(rateMax);
    const state: GameState = { ...fixedGameState(), acquiredClueIds: ['c-01', 'c-06'] };
    expect(
      successRate(state, 'withdraw', { ...baseJudgment, plausibility: 4, meetsClear: true }),
    ).toBe(rateMax);
  });

  it('routeBonus は前提が揃ったルートの方針で meetsClear のときだけ乗る', () => {
    const judgment = { ...baseJudgment, meetsClear: true };
    expect(successRate(attackReady(), 'attack', judgment) - successRate(fixedGameState(), 'attack', judgment)).toBe(
      routeBonus,
    );
    // 揃っていないルート、条件を満たさない行動、observe には乗らない
    expect(successRate(attackReady(), 'engage', judgment)).toBe(40);
    expect(successRate(attackReady(), 'attack', baseJudgment)).toBe(25);
    expect(successRate(attackReady(), 'observe', judgment)).toBe(65);
  });
});

describe('rateBreakdown / previewBreakdown（ADR 0004）', () => {
  it('内訳の和が rate と一致する', () => {
    const b = rateBreakdown(attackReady(), 'attack', {
      ...baseJudgment,
      plausibility: 3,
      meetsClear: true,
    });
    expect(b).toEqual({ skill: 'combat', base: 25, plausibility: 15, route: 20, rate: 60 });
    expect(b.base + b.plausibility + b.route).toBe(b.rate);
  });

  it('ロールしない判定では null（見せる補正がない）', () => {
    const state = fixedGameState();
    expect(previewBreakdown(state, 'observe', { ...baseJudgment, confidence: 0.4 })).toBeNull();
    expect(previewBreakdown(state, 'observe', { ...baseJudgment, metaCheat: true })).toBeNull();
    expect(previewBreakdown(state, 'observe', baseJudgment)?.rate).toBe(65);
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

  it('ロールしたターンは技能・目標値の内訳・出目をログに残す', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '', baseJudgment, rollOnce(42));
    expect(result.state.log[0].check).toEqual({
      skill: 'investigate',
      base: 65,
      plausibility: 0,
      route: 0,
      rate: 65,
      roll: 42,
    });
  });

  it('ターンが進むと事前判定は消える（ADR 0004）', () => {
    const state: GameState = {
      ...fixedGameState(),
      previews: 3,
      preview: { direction: 'observe', detail: '', judgment: baseJudgment },
    };
    const result = resolveTurn(state, 'observe', '', baseJudgment, rollOnce(42));
    expect(result.state.previews).toBe(0);
    expect(result.state.preview).toBeNull();
  });

  it('ロールしないターンには check が付かない', () => {
    const state = fixedGameState();
    const ambiguous = resolveTurn(state, 'engage', '', { ...baseJudgment, confidence: 0.4 }, wouldFumble);
    const meta = resolveTurn(state, 'engage', '', { ...baseJudgment, metaCheat: true }, wouldFumble);
    expect(ambiguous.state.log[0].check).toBeUndefined();
    expect(meta.state.log[0].check).toBeUndefined();
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

  it('決着の幕切れは方針ごとに違う文面になる', () => {
    const judgment = { ...baseJudgment, meetsClear: true };
    const attack = resolveTurn(attackReady(), 'attack', '灯りを落とす', judgment, rollOnce(10));
    const withdraw = resolveTurn(
      { ...fixedGameState(), acquiredClueIds: ['c-01', 'c-06'] },
      'withdraw',
      '振り返らずに出る',
      judgment,
      rollOnce(10),
    );
    expect(attack.state.ending?.reason).toBe('clear');
    expect(withdraw.state.ending?.reason).toBe('clear');
    expect(attack.state.ending?.text).not.toBe(withdraw.state.ending?.text);
  });
});

describe('手がかりの入手（AS 2-1 / AS 2-2）', () => {
  it('observe の成功で 1 件増え、正気度は減らない', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '', baseJudgment, rollOnce(20));
    expect(result.state.acquiredClueIds).toHaveLength(1);
    expect(result.delta.clueId).toBe('c-01');
    expect(result.delta.sanity).toBe(0);
  });

  it('observe の失敗でも 1 件増えるが、正気度で払う', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '', baseJudgment, rollOnce(90));
    expect(result.state.acquiredClueIds).toEqual(['c-01']);
    expect(result.delta.sanity).toBeLessThan(0);
    expect(result.state.log[0].narration).toContain(fixedGameState().clues['c-01'].text);
  });

  it('observe の致命的失敗では増えない', () => {
    const result = resolveTurn(fixedGameState(), 'observe', '', baseJudgment, rollOnce(100));
    expect(result.state.acquiredClueIds).toEqual([]);
  });

  it('observe 以外では成功しても増えない', () => {
    for (const direction of ['attack', 'engage', 'withdraw'] as const) {
      const result = resolveTurn(fixedGameState(), direction, '', baseJudgment, rollOnce(20));
      expect(result.state.acquiredClueIds).toEqual([]);
    }
  });

  it('出し尽くしたあとの observe では増えない（AS 2-2）', () => {
    const base = fixedGameState();
    const all = Object.keys(base.clues);
    const state: GameState = { ...base, acquiredClueIds: all };
    const result = resolveTurn(state, 'observe', '', baseJudgment, rollOnce(20));
    expect(result.state.acquiredClueIds).toEqual(all);
    expect(result.delta.clueId).toBeNull();
  });
});
