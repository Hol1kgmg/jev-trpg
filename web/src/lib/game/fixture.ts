// M0 の固定シナリオ。M1 以降もテストの共通データとして残す。
// 世界観・用語はすべて独自定義で、既存TRPG作品の二次創作物ではない（FR-022）。

import { STATE_VERSION } from '../seal';
import type { Clue, GameState } from './types';

const clues: Clue[] = [
  {
    id: 'c-01',
    text: '像の縁が、見つめている間だけ濃くなる。目を逸らすと、逸らした先に薄い残りが移る。',
    hints: ['nature'],
  },
  {
    id: 'c-02',
    text: '足元の影が、頭上の灯りに対して四十分ぶん遅れた角度で落ちている。',
    hints: ['weakness', 'nature'],
  },
  {
    id: 'c-03',
    text: 'それが立つ床の目盛りは、観測に使うには細かすぎる刻みで円周に彫られている。',
    hints: ['purpose'],
  },
  {
    id: 'c-04',
    text: '接眼部に残る指の脂。人のものにしては、押しつけられた時間が長すぎる。',
    hints: ['purpose'],
  },
  {
    id: 'c-05',
    text: '配電盤の手書き注意書きが読める。「主灯は落とすな。落とすときは全部いっぺんに」。',
    hints: ['weakness'],
  },
  {
    id: 'c-06',
    text: 'こちらが瞬きをするたび、像の位置がわずかに近い。近づく瞬間だけが記録から抜けている。',
    hints: ['nature', 'purpose'],
  },
];

/**
 * 固定の GameState を 1 つ返す。data-model.md の制約を満たす:
 * 手がかり 6 個、ルート 3 本（前提はすべて clues の id に含まれる）、
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
      },
      items: ['携帯用の照度計', '油の切れかけた懐中電灯', '前任者の鍵束'],
      secret: '三年前、同じ観測所から姿を消した技師は、あなたの兄だった。',
      hp: 10,
      sanity: 10,
    },
    entity: {
      epithet: '遅れて届く光',
      appearance:
        '観測ドームの接眼部の手前に、人ほどの高さの薄い像が立っている。輪郭は見るたびに確かになる。',
      nature: '観測されることでのみ輪郭を得る、時間のずれた像。',
      purpose: '自らを記録し続ける目を確保し、観測所の時刻をすべて自分の側へ引き寄せること。',
      weakness: '観測所のすべての灯りを同時に落とし、記録の途切れを作ること',
      manifestation: '記録が連続して取られた夜が三日続くと、ドームの接眼部に現れる。',
    },
    routes: {
      attack: {
        description:
          '配電盤の手順どおりに観測所の灯りをすべて同時に落とし、記録を意図的に途切れさせる',
        requiredClueIds: ['c-02', 'c-05'],
      },
      engage: {
        description:
          '接眼部に自分の目を当て、観測日誌の今夜のぶんを自分の手で最後まで書き、記録の続きを引き受けると告げる',
        requiredClueIds: ['c-03', 'c-04'],
      },
      withdraw: {
        description: '像から目を逸らしたまま、一度も振り返らずに観測ドームを出て、観測を打ち切る',
        requiredClueIds: ['c-01', 'c-06'],
      },
    },
    clues: Object.fromEntries(clues.map((c) => [c.id, c])),
    turn: 1,
    acquiredClueIds: [],
    log: [],
    ending: null,
  };
}
