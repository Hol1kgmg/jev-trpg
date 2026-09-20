// 描写はすべてテンプレートから選ぶ。LLM に文章を生成させない（Constitution I）。
// rng は引数で受けて決定化できるようにする。

import { clueIntroTemplates, exhaustedTemplates } from '@/data/templates/clues';
import { endingTemplates } from '@/data/templates/endings';
import { hallucinationTemplates } from '@/data/templates/hallucinations';
import { metaTemplates } from '@/data/templates/meta';
import { ambiguousTemplates, byActionType, bySceneKey } from '@/data/templates/outcomes';
import { sceneTemplates } from '@/data/templates/scenes';
import type { ActionType, Ending, GameState, Outcome } from './types';

export type Rng = () => number;

export type Vars = {
  item?: string;
  epithet?: string;
  location?: string;
  clue?: string;
};

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** {item} / {epithet} / {location} / {clue} を差し込む。未指定のキーは空文字に落とす */
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(item|epithet|location|clue)\}/g, (_, key: keyof Vars) => vars[key] ?? '');
}

function varsFor(state: GameState, rng: Rng, clue?: string): Vars {
  const location = state.locations.find((l) => l.id === state.currentLocationId);
  return {
    item: pick(state.investigator.items, rng),
    epithet: state.entity.epithet,
    location: location?.name ?? '',
    clue,
  };
}

/** 現在地の場面描写 */
export function narrateScene(state: GameState, rng: Rng): string {
  const location = state.locations.find((l) => l.id === state.currentLocationId);
  const templates = sceneTemplates[location?.sceneKey ?? ''] ?? ['あたりは静まり返っている。'];
  return fill(pick(templates, rng), varsFor(state, rng));
}

function outcomeTemplatesFor(sceneKey: string, actionType: ActionType, outcome: Outcome): string[] {
  const scoped = bySceneKey[sceneKey]?.[actionType]?.[outcome];
  if (scoped?.length) return scoped;
  const generic = byActionType[actionType]?.[outcome];
  if (generic?.length) return generic;
  return byActionType.other?.[outcome] ?? ['何かが起きた。'];
}

/**
 * 結果描写。clueText を渡すと手がかりの本文を差し込む。
 * exhausted が真なら「調べ尽くした」系に分岐する（AS 2-2）。
 * 正気度が低いターンは幻覚描写を 1 文混ぜる。
 */
export function narrateOutcome(
  state: GameState,
  actionType: ActionType,
  outcome: Outcome,
  rng: Rng,
  options: { clueText?: string; exhausted?: boolean } = {},
): string {
  const location = state.locations.find((l) => l.id === state.currentLocationId);
  const vars = varsFor(state, rng, options.clueText);

  let base: string;
  if (outcome === 'meta') {
    base = fill(pick(metaTemplates, rng), vars);
  } else if (outcome === 'ambiguous') {
    base = fill(pick(ambiguousTemplates, rng), vars);
  } else if (options.exhausted) {
    base = fill(pick(exhaustedTemplates, rng), vars);
  } else {
    base = fill(pick(outcomeTemplatesFor(location?.sceneKey ?? '', actionType, outcome), rng), vars);
    if (options.clueText && !base.includes(options.clueText)) {
      base = `${base} ${fill(pick(clueIntroTemplates, rng), vars)} ${options.clueText}`;
    }
  }

  if (state.investigator.sanity <= 3) {
    return `${base} ${fill(pick(hallucinationTemplates, rng), vars)}`;
  }
  return base;
}

export function narrateEnding(state: GameState, reason: Ending['reason'], rng: Rng): string {
  return fill(pick(endingTemplates[reason], rng), varsFor(state, rng));
}
