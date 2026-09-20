// シナリオの生成と「解ける保証」（Constitution III）。
// 手がかりは主題の 7 個をすべて盤面に出すので、ルートの前提が欠けることはない。
// 保証の中身は「順序」に移した: 観察で手に入る順を、ルート単位でまとめて前に置き、
// どのルートも観察 2〜3 回で開くようにする。どのルートが先に開くかは毎回変わる。

import { entityMotifs, itemPool, occupations, secrets } from '@/data/scenarios';
import { STATE_VERSION } from '../seal';
import { pick, type Rng } from './narrate';
import { maxHp, maxSanity } from './tuning';
import {
  ROUTE_DIRECTIONS,
  SKILL_IDS,
  type Clue,
  type GameState,
  type Route,
  type RouteDirection,
  type SkillId,
} from './types';

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

export function generateGameState(rng: Rng = Math.random): GameState {
  const motif = pick(entityMotifs, rng);

  // ルートの前提を先に、残りを後に。前提が盤面にない主題はデータの誤りなので生成時に落とす
  const order: number[] = [];
  for (const dir of sample(ROUTE_DIRECTIONS, ROUTE_DIRECTIONS.length, rng)) {
    for (const i of motif.routes[dir].clueIndexes) {
      if (motif.cluePool[i] === undefined) throw new Error(`generation failed: clue ${i} missing`);
      if (!order.includes(i)) order.push(i);
    }
  }
  const rest = motif.cluePool.map((_, i) => i).filter((i) => !order.includes(i));
  order.push(...sample(rest, rest.length, rng));

  const clues: Record<string, Clue> = {};
  for (const i of order) {
    clues[clueId(i)] = { id: clueId(i), ...motif.cluePool[i] };
  }

  const routes = Object.fromEntries(
    ROUTE_DIRECTIONS.map((dir) => [
      dir,
      {
        description: motif.routes[dir].description,
        requiredClueIds: motif.routes[dir].clueIndexes.map(clueId),
      },
    ]),
  ) as Record<RouteDirection, Route>;

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
      weakness: motif.weaknessLabel,
      manifestation: motif.manifestation,
    },
    routes,
    clues,
    turn: 1,
    acquiredClueIds: [],
    log: [],
    ending: null,
  };
}
