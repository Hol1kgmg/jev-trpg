// 手がかりを得たときの導入文と、これ以上読み取れないときの描写。
// 手がかりの本文そのものは GameState.clues が持つ（{clue} に差し込まれる）。

export const clueIntroTemplates: string[] = [
  'これは覚えておいたほうがいい。',
  '手が止まった。',
  '見なかったことにはできない。',
];

export const exhaustedTemplates: string[] = [
  'ここはもう一度見た。新しく出てくるものはない。',
  '同じところを同じ目つきで追っている自分に気づく。これ以上は出ない。',
  '見落としがないか確かめた。ない。',
];
