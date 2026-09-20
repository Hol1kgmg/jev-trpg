// 検証 → unseal → judge() を 1 回 → resolveTurn → checkEnding → 再封緘（contracts/http-api.md）。
// プレイヤーの入力文字列は state.action に値として渡すだけで、instructions へ連結しない。

import { turnRequest } from '@/lib/api/schema';
import { resolveTurn } from '@/lib/game/resolve';
import type { GameState, JevState } from '@/lib/game/types';
import { toVisible } from '@/lib/game/visible';
import { judge } from '@/lib/jev/client';
import { seal, unseal } from '@/lib/seal';

function jevState(state: GameState, action: string): JevState {
  const location = state.locations.find((l) => l.id === state.currentLocationId);
  return {
    location: location?.name ?? '',
    investigator: {
      occupation: state.investigator.occupation,
      skills: state.investigator.skills,
      items: state.investigator.items,
      hp: state.investigator.hp,
      sanity: state.investigator.sanity,
    },
    acquiredClues: state.acquiredClueIds.map((id) => state.clues[id].text),
    action,
    clearConditionDescription: state.clearCondition.description,
  };
}

export async function POST(request: Request) {
  const parsed = turnRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }
  const { sealed, turn, action } = parsed.data;

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

  const judgment = await judge(jevState(state, action));
  const result = resolveTurn(state, action, judgment, Math.random);

  return Response.json({
    sealed: seal(result.state),
    visible: toVisible(result.state),
    outcome: result.outcome,
    narration: result.narration,
    delta: result.delta,
    degraded: judgment.source === 'fallback',
  });
}
