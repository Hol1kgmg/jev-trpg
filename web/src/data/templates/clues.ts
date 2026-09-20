// 手がかりを得たときの導入文と、調べ尽くした場所を再調査したときの描写。
// 手がかりの本文そのものは GameState.clues が持つ（{clue} に差し込まれる）。

export const clueIntroTemplates: string[] = [
  'これは覚えておいたほうがいい。',
  '手が止まった。',
  '見なかったことにはできない。',
];

export const exhaustedTemplates: string[] = [
  'ここはもう一度見た。新しく出てくるものはない。',
  '同じ場所を同じ手つきで調べている自分に気づく。{location}からは、これ以上は出ない。',
  '見落としがないか確かめた。ない。',
];
