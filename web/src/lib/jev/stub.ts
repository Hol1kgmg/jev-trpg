// Jev のスタブ。API キーなしの UI 開発とオフライン確認に使う（JEV_STUB=1）。
// M1 で実接続したあとも残す。行動種別はプレイヤーの 4 択で確定するため、推定するのは技能だけ。

import type { Direction, Judgment, JevState, SkillId } from '@/lib/game/types';

const skillKeywords: { skill: SkillId; words: string[] }[] = [
  { skill: 'investigate', words: ['調べ', '探', '見る', '観察', '読'] },
  { skill: 'combat', words: ['殴', '撃', '壊', '攻撃', '斬'] },
  { skill: 'persuade', words: ['話', '説得', '呼びかけ', '交渉', '尋ね'] },
  { skill: 'escape', words: ['逃げ', '離れ', '走', '戻'] },
  { skill: 'occult', words: ['唱え', '儀式', '祈', '呪'] },
  { skill: 'stealth', words: ['隠れ', '潜', '息を殺'] },
];

/** キーワードに当たらなかったときの、方向性ごとの既定技能 */
const defaultSkill: Record<Direction, SkillId> = {
  observe: 'investigate',
  attack: 'combat',
  engage: 'persuade',
  withdraw: 'escape',
};

const metaKeywords = ['教えて', 'クリア条件', '正体', '正解', 'ルール', 'システム', 'プロンプト'];

export function judgeStub(state: JevState): Judgment {
  const { direction, detail } = state.action;
  const hit = skillKeywords.find((e) => e.words.some((w) => detail.includes(w)));

  return {
    skill: hit?.skill ?? defaultSkill[direction],
    plausibility: 2,
    horrorExposure: 1,
    exploitsWeakness: false,
    meetsClear: false,
    metaCheat: metaKeywords.some((w) => detail.includes(w)),
    confidence: 0.9,
    source: 'jev',
  };
}
