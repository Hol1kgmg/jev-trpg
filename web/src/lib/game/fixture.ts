// M0 の固定シナリオ。M1 以降もテストの共通データとして残す。
// 世界観・用語はすべて独自定義で、既存TRPG作品の二次創作物ではない（FR-022）。

import { STATE_VERSION } from '../seal';
import type { Clue, GameState } from './types';

const clues: Clue[] = [
  {
    id: 'c-01',
    text: '玄関の記帳簿。最後の三日分だけ、同じ筆跡が違う時刻を繰り返し書いている。',
    hints: ['purpose'],
  },
  {
    id: 'c-02',
    text: '観測記録の綴り。特定の波長の光を記録した夜に限り、翌朝の記録が欠けている。',
    hints: ['weakness', 'nature'],
  },
  {
    id: 'c-03',
    text: '職員の私信。「あれは見られると濃くなる」とだけ書かれ、以降の便箋は白紙。',
    hints: ['nature'],
  },
  {
    id: 'c-04',
    text: 'ドームの接眼部に残る指の脂。人のものにしては、押しつけられた時間が長すぎる。',
    hints: ['purpose'],
  },
  {
    id: 'c-05',
    text: '配電盤の手書き注意書き。「主灯は落とすな。落とすときは全部いっぺんに」。',
    hints: ['weakness'],
  },
  {
    id: 'c-06',
    text: '中庭の日時計。影が指す位置が、いまの時刻より常に四十分ほど先を示している。',
    hints: ['nature', 'purpose'],
  },
];

/**
 * 固定の GameState を 1 つ返す。data-model.md の制約を満たす:
 * 場所 5 箇所、手がかり 6 個、requiredClueIds 2 個（すべてどこかの Location.clueIds に配置済み）、
 * skills は全 SkillId を 5〜80 で網羅、items 3 個、hp / sanity は 10。
 */
export function fixedGameState(): GameState {
  return {
    version: STATE_VERSION,
    investigator: {
      occupation: '気象観測技師',
      skills: {
        investigate: 65,
        combat: 25,
        persuade: 40,
        escape: 50,
        occult: 15,
        stealth: 35,
      },
      items: ['携帯用の照度計', '油の切れかけた懐中電灯', '前任者の鍵束'],
      secret: '三年前、同じ観測所から姿を消した技師は、あなたの兄だった。',
      hp: 10,
      sanity: 10,
    },
    entity: {
      epithet: '遅れて届く光',
      nature: '観測されることでのみ輪郭を得る、時間のずれた像。',
      purpose: '自らを記録し続ける目を確保し、観測所の時刻をすべて自分の側へ引き寄せること。',
      weakness: {
        id: 'w-01',
        label: '観測所のすべての灯りを同時に落とし、記録の途切れを作ること',
        requiredClueIds: ['c-02'],
      },
      manifestation: '記録が連続して取られた夜が三日続くと、ドームの接眼部に現れる。',
      },
    clearCondition: {
      id: 'cc-01',
      description:
        '観測ドームで、配電盤の手順どおりに観測所の灯りをすべて同時に落とし、記録を意図的に途切れさせる',
      requiredClueIds: ['c-02', 'c-05'],
      locationId: 'l-dome',
    },
    locations: [
      { id: 'l-entrance', name: '旧観測所の玄関', sceneKey: 'entrance', clueIds: ['c-01'] },
      { id: 'l-archive', name: '記録室', sceneKey: 'archive', clueIds: ['c-02', 'c-03'] },
      { id: 'l-dome', name: '観測ドーム', sceneKey: 'dome', clueIds: ['c-04'] },
      { id: 'l-basement', name: '地下配電室', sceneKey: 'basement', clueIds: ['c-05'] },
      { id: 'l-garden', name: '枯れた中庭', sceneKey: 'garden', clueIds: ['c-06'] },
    ],
    clues: Object.fromEntries(clues.map((c) => [c.id, c])),
    currentLocationId: 'l-entrance',
    turn: 1,
    acquiredClueIds: [],
    investigatedLocationIds: [],
    log: [],
    ending: null,
  };
}
