// Jev 呼び出しの唯一の境界。ここより先はすべて Judgment を引数に取る純関数（Constitution I / IV）。

import type { Judgment, JevState } from '@/lib/game/types';
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

/**
 * 1 ターンにつき 1 回だけ呼ぶ（Constitution II）。失敗しても再試行せずフォールバックで完結させる。
 * clearConditionDescription は meets_clear の instructions にだけ使い、state には載せない（FR-003）。
 */
export async function judge(
  state: JevState,
  _clearConditionDescription: string,
): Promise<Judgment> {
  if (process.env.JEV_STUB === '1') return judgeStub(state);

  // M1（T014）で experimental_evaluate による実接続を入れる。
  // それまでは安全側のフォールバックに落とし、ターンは必ず完結させる。
  return fallbackJudgment;
}
