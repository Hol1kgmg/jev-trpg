// 100 シードで「解ける保証」と生成の制約を確認する（SC-003 / Constitution III）。

import { describe, expect, it } from 'vitest';
import { STATE_VERSION } from '../seal';
import { generateGameState } from './generate';
import { ROUTE_ASPECT, ROUTE_DIRECTIONS, SKILL_IDS } from './types';

/** 決定的な rng。テストを再現可能にするためだけに置く */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seeds = Array.from({ length: 100 }, (_, i) => i + 1);

describe('generateGameState', () => {
  it('どのシードでも 3 ルートの前提手がかりが盤面に存在し、対応する枠の hint を持つ', () => {
    for (const seed of seeds) {
      const state = generateGameState(mulberry32(seed));

      for (const dir of ROUTE_DIRECTIONS) {
        const { requiredClueIds } = state.routes[dir];
        expect(requiredClueIds.length).toBeGreaterThanOrEqual(1);
        expect(requiredClueIds.length).toBeLessThanOrEqual(3);
        for (const id of requiredClueIds) {
          const clue = state.clues[id];
          expect(clue, `seed ${seed}: ${dir} の ${id} が clues にない`).toBeDefined();
          // 調書の枠が埋まる＝ルートが開く、を成り立たせる条件
          expect(clue.hints, `seed ${seed}: ${dir} の ${id} に ${ROUTE_ASPECT[dir]} の hint がない`).toContain(
            ROUTE_ASPECT[dir],
          );
        }
      }
    }
  });

  it('観察で手に入る順で、どのルートも 4 回以内に開く', () => {
    for (const seed of seeds) {
      const state = generateGameState(mulberry32(seed));
      const order = Object.keys(state.clues);
      const positions = ROUTE_DIRECTIONS.map((dir) =>
        Math.max(...state.routes[dir].requiredClueIds.map((id) => order.indexOf(id) + 1)),
      );
      // 最初に開くルートは 3 回以内、すべて開くのは 7 回以内
      expect(Math.min(...positions), `seed ${seed}`).toBeLessThanOrEqual(3);
      expect(Math.max(...positions), `seed ${seed}`).toBeLessThanOrEqual(7);
    }
  });

  it('探索者の技能が全 SkillId を 5〜80 で網羅する', () => {
    for (const seed of seeds) {
      const { skills } = generateGameState(mulberry32(seed)).investigator;
      expect(Object.keys(skills).sort()).toEqual([...SKILL_IDS].sort());
      for (const id of SKILL_IDS) {
        expect(skills[id]).toBeGreaterThanOrEqual(5);
        expect(skills[id]).toBeLessThanOrEqual(80);
      }
    }
  });

  it('所持品は 1〜3 個で重複しない', () => {
    for (const seed of seeds) {
      const { items } = generateGameState(mulberry32(seed)).investigator;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(3);
      expect(new Set(items).size).toBe(items.length);
    }
  });

  it('手がかりは 7 個で、本文が重複しない', () => {
    for (const seed of seeds) {
      const { clues } = generateGameState(mulberry32(seed));
      const texts = Object.values(clues).map((c) => c.text);
      expect(texts).toHaveLength(7);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  // 一部にだけ付けると、どれがルートの前提かが見た目で漏れる（FR-003）
  it('すべての手がかりが本文に含まれる keyword を持つ', () => {
    for (const seed of seeds) {
      for (const clue of Object.values(generateGameState(mulberry32(seed)).clues)) {
        expect(clue.keyword, `seed ${seed}: ${clue.id}`).toBeTruthy();
        expect(clue.text).toContain(clue.keyword);
      }
    }
  });

  it('初期状態はターン 1・未決着・現行スキーマ版', () => {
    const state = generateGameState(mulberry32(42));
    expect(state.version).toBe(STATE_VERSION);
    expect(state.turn).toBe(1);
    expect(state.acquiredClueIds).toEqual([]);
    expect(state.log).toEqual([]);
    expect(state.ending).toBeNull();
  });

  it('シードが違えばシナリオも変わる', () => {
    const epithets = new Set(seeds.map((s) => generateGameState(mulberry32(s)).entity.epithet));
    expect(epithets.size).toBeGreaterThan(1);
  });
});
