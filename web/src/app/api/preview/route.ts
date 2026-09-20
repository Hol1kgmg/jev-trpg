// 事前判定。Jev を 1 回呼び、成功率の内訳だけを返す（ADR 0004）。
// Judgment は封緘に入れて往復させ、同じ方針・詳細で /api/turn に来たときだけ再利用する。
// 見せるのはダイス補正だけ。恐怖の負荷・クリアへの手応えは返さない（FR-003）。

import { turnRequest } from '@/lib/api/schema';
import { previewBreakdown } from '@/lib/game/resolve';
import { previewLimit } from '@/lib/game/tuning';
import { judge, routeDescription } from '@/lib/jev/client';
import { jevState } from '@/lib/jev/state';
import { seal, unseal } from '@/lib/seal';

export async function POST(request: Request) {
  const parsed = turnRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }
  const { sealed, turn, direction, detail } = parsed.data;

  const state = unseal(sealed);
  if (state === null) {
    return Response.json({ error: 'invalid_state' }, { status: 400 });
  }
  if (state.ending !== null || turn !== state.turn) {
    return Response.json({ error: 'turn_mismatch' }, { status: 409 });
  }

  const previews = state.previews ?? 0;
  if (previews >= previewLimit) {
    return Response.json({ error: 'preview_exhausted', previews }, { status: 429 });
  }

  const judgment = await judge(jevState(state, direction, detail), routeDescription(state, direction));
  // 失敗した判定は残さない。実行時にあらためて判定する
  const preview = judgment.source === 'fallback' ? null : { direction, detail, judgment };
  const next = { ...state, previews: previews + 1, preview };

  return Response.json({
    sealed: seal(next),
    previews: next.previews,
    rate: preview ? previewBreakdown(next, direction, judgment) : null,
  });
}
