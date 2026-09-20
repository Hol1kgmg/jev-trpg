// 描写はすべてテンプレートから選ぶ。LLM に文章を生成させない（Constitution I）。
// rng は引数で受けて決定化できるようにする。

import { clueIntroTemplates, exhaustedTemplates } from '@/data/templates/clues';
import { clearTemplates, endingTemplates } from '@/data/templates/endings';
import { hallucinationTemplates } from '@/data/templates/hallucinations';
import { metaTemplates } from '@/data/templates/meta';
import { ambiguousTemplates, byDirection, byStage } from '@/data/templates/outcomes';
import { sceneTemplates } from '@/data/templates/scenes';
import { entityStage } from './tuning';
import type { Direction, Ending, EntityStage, GameState, Outcome } from './types';

export type Rng = () => number;

export type Vars = {
  item?: string;
  epithet?: string;
  clue?: string;
};

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** {item} / {epithet} / {clue} を差し込む。未指定のキーは空文字に落とす */
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(item|epithet|clue)\}/g, (_, key: keyof Vars) => vars[key] ?? '');
}

function varsFor(state: GameState, rng: Rng, clue?: string): Vars {
  return {
    item: pick(state.investigator.items, rng),
    epithet: state.entity.epithet,
    clue,
  };
}

/** 怪異の現在の様子 */
export function narrateScene(state: GameState, rng: Rng): string {
  return fill(pick(sceneTemplates[entityStage(state.turn)], rng), varsFor(state, rng));
}

function outcomeTemplatesFor(stage: EntityStage, direction: Direction, outcome: Outcome): string[] {
  const scoped = byStage[stage]?.[direction]?.[outcome];
  if (scoped?.length) return scoped;
  const generic = byDirection[direction]?.[outcome];
  if (generic?.length) return generic;
  return byDirection.observe?.[outcome] ?? ['何かが起きた。'];
}

/**
 * 結果描写。clueText を渡すと手がかりの本文を差し込む。
 * exhausted が真なら「これ以上は読み取れない」系に分岐する（AS 2-2）。
 * 正気度が低いターンは幻覚描写を 1 文混ぜる。
 */
export function narrateOutcome(
  state: GameState,
  direction: Direction,
  outcome: Outcome,
  rng: Rng,
  options: { clueText?: string; exhausted?: boolean } = {},
): string {
  const vars = varsFor(state, rng, options.clueText);

  let base: string;
  if (outcome === 'meta') {
    base = fill(pick(metaTemplates, rng), vars);
  } else if (outcome === 'ambiguous') {
    base = fill(pick(ambiguousTemplates, rng), vars);
  } else if (options.exhausted) {
    base = fill(pick(exhaustedTemplates, rng), vars);
  } else {
    base = fill(pick(outcomeTemplatesFor(entityStage(state.turn), direction, outcome), rng), vars);
    if (options.clueText && !base.includes(options.clueText)) {
      base = `${base} ${fill(pick(clueIntroTemplates, rng), vars)} ${options.clueText}`;
    }
  }

  if (state.investigator.sanity <= 3) {
    return `${base} ${fill(pick(hallucinationTemplates, rng), vars)}`;
  }
  return base;
}

/** clear は決着した方針ごとに文面が違う（討伐・取引・離脱）。clear 以外は direction を見ない */
export function narrateEnding(
  state: GameState,
  reason: Ending['reason'],
  rng: Rng,
  direction: Direction = 'observe',
): string {
  const templates =
    reason === 'clear'
      ? clearTemplates[direction === 'observe' ? 'attack' : direction]
      : endingTemplates[reason];
  return fill(pick(templates, rng), varsFor(state, rng));
}
