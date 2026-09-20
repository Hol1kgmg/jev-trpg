// 怪異の現在の様子。段階（EntityStage）ごとに持つ。プレースホルダーは {item} / {epithet} / {clue}。

import type { EntityStage } from '@/lib/game/types';

export const sceneTemplates: Record<EntityStage, string[]> = {
  appearance: [
    '{epithet}は、まだ輪郭の半分を空気に預けている。動いてはいない。こちらを見ているかどうかも分からない。',
    '空気が一段だけ冷たい。{epithet}の立つあたりだけ、埃が落ちていかない。',
  ],
  agitation: [
    '{epithet}の縁がはっきりしてきた。瞬きをするたび、さっきより近い位置にいる。',
    '音が遅れて届く。{epithet}が動いた気配のあとに、動いた音が来る。',
  ],
  frenzy: [
    '{epithet}はもう薄くない。輪郭の内側に、見てはいけない深さがある。',
    '視界のどこを向いても{epithet}が端にいる。逃げる方向が、どちらも同じ方向に見える。',
  ],
};
