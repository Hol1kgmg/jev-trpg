// Jev 呼び出しの唯一の境界。ここより先はすべて Judgment を引数に取る純関数（Constitution I / IV）。

import { experimental_evaluate as evaluate, type Experimental_EvaluationModel } from 'ai';
import { confidenceThresholds, jevTimeoutMs } from '@/lib/game/tuning';
import { SKILL_IDS, type Judgment, type JevState, type SkillId } from '@/lib/game/types';
import { questions } from './questions';
import { judgeStub } from './stub';

/** 呼び出し失敗時の Judgment。confidence 0 により必ず ambiguous に落ちる（contracts/http-api.md） */
export const fallbackJudgment: Judgment = {
  skill: 'investigate',
  plausibility: 2,
  horrorExposure: 1,
  exploitsWeakness: false,
  meetsClear: false,
  metaCheat: false,
  confidence: 0,
  source: 'fallback',
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

/** contracts/jev-questions.md の写像表 */
export function normalizeJudgment(result: {
  answers: Record<string, RawAnswer | undefined>;
  providerMetadata?: unknown;
}): Judgment {
  const answers = result.answers;
  const skill = answers?.skill?.choice;
  if (typeof skill !== 'string' || !SKILL_IDS.includes(skill as SkillId)) {
    throw new Error('jev: unknown skill');
  }

  const confidence = (
    result.providerMetadata as { typesafe?: { confidence?: Record<string, unknown> } } | undefined
  )?.typesafe?.confidence?.skill;

  return {
    skill: skill as SkillId,
    plausibility: clamp(num(answers.plausibility?.score), 0, 4),
    horrorExposure: clamp(num(answers.horror_exposure?.score), 0, 3),
    exploitsWeakness:
      num(answers.exploits_weakness?.probability) >= confidenceThresholds.exploitsWeakness,
    meetsClear: num(answers.meets_clear?.probability) >= confidenceThresholds.meetsClear,
    metaCheat: num(answers.meta_cheat?.probability) >= confidenceThresholds.metaCheat,
    confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0,
    source: 'jev',
  };
}

/**
 * 1 ターンにつき 1 回だけ呼ぶ（Constitution II）。失敗しても再試行せずフォールバックで完結させる。
 * clearConditionDescription は meets_clear の instructions にだけ使い、state には載せない（FR-003）。
 * model はテストで Experimental_EvaluationMockModelV4 に差し替えるためだけの引数。
 */
export async function judge(
  state: JevState,
  clearConditionDescription: string,
  model: Experimental_EvaluationModel = 'typesafe-ai/jev',
): Promise<Judgment> {
  if (process.env.JEV_STUB === '1') return judgeStub(state);

  try {
    const result = await evaluate({
      model,
      state,
      questions: questions(clearConditionDescription),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(jevTimeoutMs),
    });
    return normalizeJudgment(result);
  } catch {
    return fallbackJudgment;
  }
}
