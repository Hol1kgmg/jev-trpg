// 生成 → 解ける保証 → 初期封緘（contracts/http-api.md）。

import { generateGameState } from '@/lib/game/generate';
import { toVisible } from '@/lib/game/visible';
import { seal } from '@/lib/seal';

export async function POST() {
  let state;
  try {
    state = generateGameState();
  } catch {
    // 再試行上限の超過。通常は起きない（Constitution III のテストで担保）
    return Response.json({ error: 'generation_failed' }, { status: 500 });
  }
  return Response.json({ sealed: seal(state), visible: toVisible(state) });
}
