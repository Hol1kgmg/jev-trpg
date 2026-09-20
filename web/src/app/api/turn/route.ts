// 検証 → unseal → judge() → resolveTurn → checkEnding → 再封緘（contracts/http-api.md）。
// 事前判定（/api/preview）が同じ方針・詳細で残っていればそれを使い、Jev は呼ばない（ADR 0004）。

import { turnRequest } from '@/lib/api/schema';
import { resolveTurn } from '@/lib/game/resolve';
import { toVisible } from '@/lib/game/visible';
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

  // 決着後は状態を変えず、現在の visible を 200 で返す
  if (state.ending !== null) {
    return Response.json({
      sealed,
      visible: toVisible(state),
      outcome: state.log.at(-1)?.outcome ?? 'ambiguous',
      narration: state.ending.text,
      delta: { hp: 0, sanity: 0, clueId: null },
      degraded: false,
    });
  }

  if (turn !== state.turn) {
    return Response.json({ error: 'turn_mismatch' }, { status: 409 });
  }

  const preview = state.preview;
  const reused = preview?.direction === direction && preview.detail === detail;
  const judgment = reused
    ? preview.judgment
    : await judge(jevState(state, direction, detail), routeDescription(state, direction));
  const result = resolveTurn(state, direction, detail, judgment, Math.random);

  return Response.json({
    sealed: seal(result.state),
    visible: toVisible(result.state),
    outcome: result.outcome,
    narration: result.narration,
    delta: result.delta,
    degraded: judgment.source === 'fallback',
  });
}
