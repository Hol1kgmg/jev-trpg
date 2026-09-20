// シナリオの生成と「解ける保証」（research.md R-007 / Constitution III）。
// 素朴に生成してから集合の包含を検証し、満たさなければ破棄して再生成する。
// 手がかりの id は素材側の添字から決まるので、クリア条件が要求する id は生成前から確定している。

import { entityMotifs, itemPool, occupations, secrets } from '@/data/scenarios';
import { STATE_VERSION } from '../seal';
import { pick, type Rng } from './narrate';
import { generationRetryLimit, maxHp, maxSanity } from './tuning';
import { SKILL_IDS, type Clue, type GameState, type SkillId } from './types';

const clueId = (index: number) => `c-${String(index + 1).padStart(2, '0')}`;

/** Fisher-Yates で並べ替えて先頭 count 個を返す */
function sample<T>(items: readonly T[], count: number, rng: Rng): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** min 以上 max 以下の整数 */
const intBetween = (min: number, max: number, rng: Rng) =>
  min + Math.floor(rng() * (max - min + 1));

function attempt(rng: Rng): GameState | null {
  const motif = pick(entityMotifs, rng);

  const indexes = sample(
    motif.cluePool.map((_, i) => i),
    intBetween(5, 7, rng),
    rng,
  ).sort((a, b) => a - b);

  const clearClueIds = motif.clearClueIndexes.map(clueId);
  const weaknessClueIds = motif.weaknessClueIndexes.map(clueId);

  // 解ける保証。前提の手がかりが盤面に出ていなければ、この試行ごと破棄する
  const present = new Set(indexes.map(clueId));
  if (![...clearClueIds, ...weaknessClueIds].every((id) => present.has(id))) return null;

  const clues: Record<string, Clue> = {};
  for (const i of indexes) {
    clues[clueId(i)] = { id: clueId(i), ...motif.cluePool[i] };
  }

  const skills = Object.fromEntries(
    SKILL_IDS.map((id) => [id, intBetween(5, 80, rng)]),
  ) as Record<SkillId, number>;

  return {
    version: STATE_VERSION,
    investigator: {
      occupation: pick(occupations, rng),
      skills,
      items: sample(itemPool, intBetween(1, 3, rng), rng),
      secret: pick(secrets, rng),
      hp: maxHp,
      sanity: maxSanity,
    },
    entity: {
      epithet: pick(motif.epithets, rng),
      appearance: motif.appearance,
      nature: motif.nature,
      purpose: motif.purpose,
      weakness: {
        id: 'w-01',
        label: motif.weaknessLabel,
        requiredClueIds: weaknessClueIds,
      },
      manifestation: motif.manifestation,
    },
    clearCondition: {
      id: 'cc-01',
      description: motif.clearCondition,
      requiredClueIds: clearClueIds,
    },
    clues,
    turn: 1,
    acquiredClueIds: [],
    log: [],
    ending: null,
  };
}

/** 上限まで再生成しても解ける保証を満たせなければ例外（/api/new-game が 500 に変換する） */
export function generateGameState(rng: Rng = Math.random): GameState {
  for (let i = 0; i < generationRetryLimit; i++) {
    const state = attempt(rng);
    if (state !== null) return state;
  }
  throw new Error('generation failed: clear condition is unreachable');
}
