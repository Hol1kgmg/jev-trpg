// 途中で降りる。unseal → retire → 再封緘。Jev は呼ばない。
// 応答は /api/turn と同じ形なので、クライアントは同じ経路で受け取れる。

import { retireRequest } from '@/lib/api/schema';
import { retire } from '@/lib/game/ending';
import { toVisible } from '@/lib/game/visible';
import { seal, unseal } from '@/lib/seal';

export async function POST(request: Request) {
  const parsed = retireRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }
  const state = unseal(parsed.data.sealed);
  if (state === null) {
    return Response.json({ error: 'invalid_state' }, { status: 400 });
  }
  const next = retire(state, Math.random);
  return Response.json({ sealed: seal(next), visible: toVisible(next) });
}
