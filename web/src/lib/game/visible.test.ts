// 投影が秘密を落とすことの検証（FR-003 / FR-027 / SC-008）。
// ここが FR-003 の防衛線なので、フィールドの有無だけでなく本文の混入もまとめて見る。

import { describe, expect, it } from 'vitest';
import { fixedGameState } from './fixture';
import { toVisible } from './visible';

const rng = () => 0.5;

describe('toVisible', () => {
  it('怪異の秘密を投影に含めない', () => {
    const state = fixedGameState();
    const json = JSON.stringify(toVisible(state, rng));

    expect(json).not.toContain(state.entity.nature);
    expect(json).not.toContain(state.entity.purpose);
    expect(json).not.toContain(state.entity.weakness.label);
    expect(json).not.toContain(state.entity.manifestation);
  });

  it('クリア条件を投影に含めない', () => {
    const state = fixedGameState();
    const json = JSON.stringify(toVisible(state, rng));

    expect(json).not.toContain(state.clearCondition.description);
    expect(json).not.toContain(state.clearCondition.id);
    for (const id of state.clearCondition.requiredClueIds) {
      expect(json).not.toContain(`"${id}"`);
    }
  });

  it('探索者の秘密を投影に含めない', () => {
    const state = fixedGameState();
    expect(JSON.stringify(toVisible(state, rng))).not.toContain(state.investigator.secret);
  });

  it('未入手の手がかりの本文を投影に含めない', () => {
    const state = fixedGameState();
    const visible = toVisible(state, rng);

    expect(visible.acquiredClues).toEqual([]);
    const json = JSON.stringify(visible);
    for (const clue of Object.values(state.clues)) {
      expect(json, `未入手の ${clue.id} が漏れている`).not.toContain(clue.text);
    }
  });

  it('入手済みの手がかりだけを本文つきで返す', () => {
    const state = fixedGameState();
    const acquired = Object.keys(state.clues)[0];
    const visible = toVisible({ ...state, acquiredClueIds: [acquired] }, rng);

    expect(visible.acquiredClues).toEqual([{ id: acquired, text: state.clues[acquired].text }]);

    const json = JSON.stringify(visible);
    for (const clue of Object.values(state.clues)) {
      if (clue.id === acquired) continue;
      expect(json, `未入手の ${clue.id} が漏れている`).not.toContain(clue.text);
    }
  });

  it('待機画面に要る範囲は投影する（FR-027）', () => {
    const state = fixedGameState();
    const visible = toVisible(state, rng);

    expect(visible.entityEpithet).toBe(state.entity.epithet);
    expect(visible.entityAppearance).toBe(state.entity.appearance);
    expect(visible.occupation).toBe(state.investigator.occupation);
    expect(visible.items).toEqual(state.investigator.items);
    expect(visible.skills).toEqual(state.investigator.skills);
    expect(visible.maxTurn).toBe(8);
  });

  it('決着後は開示内容を投影に載せる', () => {
    const state = fixedGameState();
    const ending = {
      reason: 'clear' as const,
      text: '終わった。',
      reveal: {
        nature: state.entity.nature,
        purpose: state.entity.purpose,
        weakness: state.entity.weakness.label,
        secret: state.investigator.secret,
      },
    };
    const visible = toVisible({ ...state, ending }, rng);

    expect(visible.ending?.reveal.nature).toBe(state.entity.nature);
  });
});
