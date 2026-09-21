// Jev 呼び出しの唯一の境界。ここより先はすべて Judgment を引数に取る純関数（Constitution I / IV）。

import { experimental_evaluate as evaluate, type Experimental_EvaluationModel } from 'ai';
import { confidenceThresholds, jevTimeoutMs } from '@/lib/game/tuning';
import type { GameState, Judgment, JevState } from '@/lib/game/types';
import { questions } from './questions';
import { judgeStub } from './stub';

/** 呼び出し失敗時の Judgment。confidence 0 により必ず ambiguous に落ちる（contracts/http-api.md） */
export const fallbackJudgment: Judgment = {
  plausibility: 2,
  horrorExposure: 1,
  meetsClear: false,
  metaCheat: false,
  confidence: 0,
  source: 'fallback',
};

/** 空欄の行動。Jev は呼ばず、妥当性は中立（補正 0）で確定する。決着は付かない */
export const emptyJudgment: Judgment = {
  plausibility: 2,
  horrorExposure: 1,
  meetsClear: false,
  metaCheat: false,
  confidence: 1,
  source: 'jev',
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

type RawAnswer = { choice?: unknown; score?: unknown; probability?: unknown };

/** 期待する形に一致しない応答は投げる。呼び出し側が fallbackJudgment に落とす */
function num(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('jev: unexpected answer shape');
  }
  return value;
}

/** contracts/jev-questions.md の写像表。meets_clear は observe では訊かないので欠けてよい */
export function normalizeJudgment(result: {
  answers: Record<string, RawAnswer | undefined>;
  providerMetadata?: unknown;
}): Judgment {
  const answers = result.answers;

  const confidence = (
    result.providerMetadata as { typesafe?: { confidence?: Record<string, unknown> } } | undefined
  )?.typesafe?.confidence?.plausibility;

  return {
    plausibility: clamp(num(answers.plausibility?.score), 0, 4),
    horrorExposure: clamp(num(answers.horror_exposure?.score), 0, 3),
    meetsClear:
      answers.meets_clear !== undefined &&
      num(answers.meets_clear.probability) >= confidenceThresholds.meetsClear,
    metaCheat: num(answers.meta_cheat?.probability) >= confidenceThresholds.metaCheat,
    confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0,
    source: 'jev',
  };
}

/** 選ばれた方針のルート条件文。observe にはルートがない */
export const routeDescription = (state: GameState, direction: JevState['action']['direction']) =>
  direction === 'observe' ? null : state.routes[direction].description;

/**
 * 1 ターンにつき 1 回だけ呼ぶ（Constitution II）。失敗しても再試行せずフォールバックで完結させる。
 * routeDescription は meets_clear の instructions にだけ使い、state には載せない（FR-003）。
 * model はテストで Experimental_EvaluationMockModelV4 に差し替えるためだけの引数。
 */
export async function judge(
  state: JevState,
  routeDescription: string | null,
  model: Experimental_EvaluationModel = 'typesafe-ai/jev',
): Promise<Judgment> {
  if (state.action.detail.trim() === '') return emptyJudgment;
  if (process.env.JEV_STUB === '1') return judgeStub(state);

  try {
    const result = await evaluate({
      model,
      state,
      questions: questions(routeDescription),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(jevTimeoutMs),
    });
    return normalizeJudgment(result);
  } catch (error) {
    // 握り潰すとフォールバックか実結果か区別がつかない。ゲームは止めないが原因は残す。
    // error 全体は requestBodyValues 経由でルート条件（FR-003 の秘匿対象）を含むため、
    // メッセージだけをログに出す。
    console.error('jev: falling back', error instanceof Error ? error.message : error);
    return fallbackJudgment;
  }
}
