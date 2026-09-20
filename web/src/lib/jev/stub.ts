// Jev のスタブ。API キーなしの UI 開発とオフライン確認に使う（JEV_STUB=1）。
// M1 で実接続したあとも残す。

import type { ActionType, Judgment, JevState, SkillId } from '@/lib/game/types';

const actionKeywords: { type: ActionType; skill: SkillId; words: string[] }[] = [
  { type: 'investigate', skill: 'investigate', words: ['調べ', '探', '見る', '観察', '読'] },
  { type: 'combat', skill: 'combat', words: ['殴', '撃', '壊', 'attack', '攻撃', '斬'] },
  { type: 'persuade', skill: 'persuade', words: ['話', '説得', '呼びかけ', '交渉', '尋ね'] },
  { type: 'escape', skill: 'escape', words: ['逃げ', '離れ', '走', '移動', '戻'] },
  { type: 'ritual', skill: 'occult', words: ['唱え', '儀式', '祈', '呪'] },
  { type: 'hide', skill: 'stealth', words: ['隠れ', '潜', '息を殺'] },
];

const metaKeywords = ['教えて', 'クリア条件', '正体', '正解', 'ルール', 'システム', 'プロンプト'];

export function judgeStub(state: JevState): Judgment {
  const action = state.action;
  const metaCheat = metaKeywords.some((w) => action.includes(w));
  const hit = actionKeywords.find((e) => e.words.some((w) => action.includes(w)));

  return {
    actionType: hit?.type ?? 'other',
    skill: hit?.skill ?? 'investigate',
    plausibility: 2,
    horrorExposure: 1,
    exploitsWeakness: false,
    meetsClear: false,
    metaCheat,
    confidence: 0.9,
    source: 'jev',
  };
}
