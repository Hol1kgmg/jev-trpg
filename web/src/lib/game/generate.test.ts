// 100 シードで「解ける保証」と生成の制約を確認する（SC-003 / Constitution III）。

import { describe, expect, it } from 'vitest';
import { STATE_VERSION } from '../seal';
import { generateGameState } from './generate';
import { SKILL_IDS } from './types';

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
  it('どのシードでもクリア条件の前提手がかりが盤面に存在する', () => {
    for (const seed of seeds) {
      const state = generateGameState(mulberry32(seed));
      const ids = new Set(Object.keys(state.clues));

      expect(state.clearCondition.requiredClueIds.length).toBeGreaterThanOrEqual(1);
      expect(state.clearCondition.requiredClueIds.length).toBeLessThanOrEqual(3);
      for (const id of state.clearCondition.requiredClueIds) {
        expect(ids.has(id), `seed ${seed}: ${id} が clues にない`).toBe(true);
      }
      // 弱点ボーナスが到達不能にならないこと
      for (const id of state.entity.weakness.requiredClueIds) {
        expect(ids.has(id), `seed ${seed}: 弱点の ${id} が clues にない`).toBe(true);
      }
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

  it('手がかりは 5〜7 個で、本文が重複しない', () => {
    for (const seed of seeds) {
      const { clues } = generateGameState(mulberry32(seed));
      const texts = Object.values(clues).map((c) => c.text);
      expect(texts.length).toBeGreaterThanOrEqual(5);
      expect(texts.length).toBeLessThanOrEqual(7);
      expect(new Set(texts).size).toBe(texts.length);
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
