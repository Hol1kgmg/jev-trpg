// judge() の正規化とフォールバック（SC-006）。実 API は叩かない（Constitution IV）。

import { Experimental_EvaluationMockModelV4 as MockEvaluationModel } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { confidenceThresholds } from '@/lib/game/tuning';
import type { JevState } from '@/lib/game/types';
import { judge, normalizeJudgment } from './client';

const state: JevState = {
  scene: '薄い像が接眼部の手前に立っている。',
  investigator: {
    occupation: '気象観測技師',
    skills: { investigate: 65, combat: 25, persuade: 40, escape: 50, occult: 15, stealth: 35 },
    items: ['携帯用の照度計'],
    hp: 10,
    sanity: 10,
  },
  acquiredClues: [],
  action: { direction: 'observe', detail: '像の縁を目で追う' },
};

type Answers = Record<string, { type: string; choice?: string; score?: number; probability?: number }>;

const fullAnswers = (over: Partial<Answers> = {}): Answers => ({
  skill: { type: 'choice', choice: 'occult' },
  plausibility: { type: 'score', score: 3.4 },
  horror_exposure: { type: 'score', score: 2.2 },
  exploits_weakness: { type: 'boolean', probability: 0.8 },
  meets_clear: { type: 'boolean', probability: 0.2 },
  meta_cheat: { type: 'boolean', probability: 0.1 },
  ...over,
});

/** doEvaluate を差し替えたモデルと、呼び出しを数えるスパイを返す */
function mock(doEvaluate: (options: { abortSignal?: AbortSignal; providerOptions?: unknown }) => unknown) {
  const spy = vi.fn(doEvaluate);
  const model = new MockEvaluationModel({
    provider: 'typesafe-ai',
    modelId: 'jev',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
    // 戻り値の形は evaluate 側が検証する。ここでは意図的に崩した応答も渡す
    doEvaluate: spy as never,
  });
  return { model, spy };
}

describe('judge の正規化', () => {
  it('contracts/jev-questions.md の写像表どおりに Judgment へ変換する', async () => {
    const { model, spy } = mock(() => ({
      answers: fullAnswers(),
      warnings: [],
      providerMetadata: { typesafe: { confidence: { skill: 0.82, plausibility: 0.6 } } },
    }));

    const judgment = await judge(state, 'すべての灯りを同時に落とす', model);

    expect(judgment).toEqual({
      skill: 'occult',
      plausibility: 3.4,
      horrorExposure: 2.2,
      exploitsWeakness: true, // 0.8 >= 0.7
      meetsClear: false, // 0.2 < 0.7
      metaCheat: false, // 0.1 < 0.6
      confidence: 0.82,
      source: 'jev',
    });
    // Constitution II: 1 ターンにつきちょうど 1 回
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('しきい値の境界では真に倒す', async () => {
    const { model } = mock(() => ({
      answers: fullAnswers({
        exploits_weakness: { type: 'boolean', probability: confidenceThresholds.exploitsWeakness },
        meets_clear: { type: 'boolean', probability: confidenceThresholds.meetsClear },
        meta_cheat: { type: 'boolean', probability: confidenceThresholds.metaCheat },
      }),
      warnings: [],
      providerMetadata: { typesafe: { confidence: { skill: 0.9 } } },
    }));

    const judgment = await judge(state, 'cc', model);

    expect(judgment.exploitsWeakness).toBe(true);
    expect(judgment.meetsClear).toBe(true);
    expect(judgment.metaCheat).toBe(true);
  });

  // 範囲外の score は evaluate 側でも弾かれるが、正規化にも同じ防衛線を置く
  it('score は 0〜4 / 0〜3 にクランプする', () => {
    const judgment = normalizeJudgment({
      answers: fullAnswers({
        plausibility: { type: 'score', score: 9 },
        horror_exposure: { type: 'score', score: -1 },
      }),
      providerMetadata: { typesafe: { confidence: { skill: 0.9 } } },
    });

    expect(judgment.plausibility).toBe(4);
    expect(judgment.horrorExposure).toBe(0);
  });

  it('providerMetadata が欠損すると confidence は 0 になる', async () => {
    const { model } = mock(() => ({ answers: fullAnswers(), warnings: [] }));

    const judgment = await judge(state, 'cc', model);

    expect(judgment.confidence).toBe(0);
    expect(judgment.source).toBe('jev'); // 応答自体は成立しているのでフォールバックではない
  });

  it('zeroDataRetention と中断シグナルを付けて呼ぶ', async () => {
    const { model, spy } = mock(() => ({
      answers: fullAnswers(),
      warnings: [],
      providerMetadata: { typesafe: { confidence: { skill: 0.9 } } },
    }));

    await judge(state, 'cc', model);

    const options = spy.mock.calls[0][0];
    expect(options.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('judge のフォールバック', () => {
  const fallback = {
    skill: 'investigate',
    plausibility: 2,
    horrorExposure: 1,
    exploitsWeakness: false,
    meetsClear: false,
    metaCheat: false,
    confidence: 0,
    source: 'fallback',
  };

  it('例外で fallback に落ち、再試行しない', async () => {
    const { model, spy } = mock(() => {
      throw new Error('boom');
    });

    expect(await judge(state, 'cc', model)).toEqual(fallback);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('タイムアウト（中断）で fallback に落ちる', async () => {
    const { model } = mock(() => {
      throw new DOMException('timed out', 'TimeoutError');
    });

    expect(await judge(state, 'cc', model)).toEqual(fallback);
  });

  it('未知の技能キーで fallback に落ちる', async () => {
    const { model } = mock(() => ({
      answers: fullAnswers({ skill: { type: 'choice', choice: 'telepathy' } }),
      warnings: [],
      providerMetadata: { typesafe: { confidence: { skill: 0.9 } } },
    }));

    expect(await judge(state, 'cc', model)).toEqual(fallback);
  });

  it('フィールドが欠損した応答で fallback に落ちる', async () => {
    const { model } = mock(() => ({
      answers: { skill: { type: 'choice', choice: 'combat' } },
      warnings: [],
    }));

    expect(await judge(state, 'cc', model)).toEqual(fallback);
  });
});
