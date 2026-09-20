// Route Handler の異常系（FR-016 / contracts/http-api.md）。
// 状態は封緘文字列の中にしかないので、「更新しない」＝新しい封緘を返さないこと。

import { beforeAll, describe, expect, it } from 'vitest';
import { fixedGameState } from '@/lib/game/fixture';
import type { GameState } from '@/lib/game/types';

// 実 API を呼ばずにターンを完結させる（Constitution IV）
process.env.JEV_STUB = '1';
process.env.SEAL_KEY ??= Buffer.alloc(32, 7).toString('base64');

let POST: (request: Request) => Promise<Response>;
let seal: (state: GameState) => string;
let unseal: (sealed: string) => GameState | null;

beforeAll(async () => {
  ({ POST } = await import('./route'));
  ({ seal, unseal } = await import('@/lib/seal'));
});

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/turn', () => {
  it('正常系はターンを 1 つ進めた封緘を返す', async () => {
    const state = fixedGameState();
    const res = await post({ sealed: seal(state), turn: 1, direction: 'observe', detail: '見る' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(unseal(body.sealed)?.turn).toBe(2);
    expect(body.degraded).toBe(false);
  });

  it('詳細が 200 文字を超えると invalid_action で、状態は進まない', async () => {
    const state = fixedGameState();
    const res = await post({
      sealed: seal(state),
      turn: 1,
      direction: 'observe',
      detail: 'あ'.repeat(201),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'invalid_action' });
    expect(body.sealed).toBeUndefined();
  });

  it('ちょうど 200 文字は通る', async () => {
    const state = fixedGameState();
    const res = await post({
      sealed: seal(state),
      turn: 1,
      direction: 'observe',
      detail: 'あ'.repeat(200),
    });

    expect(res.status).toBe(200);
  });

  it('空文字の詳細は正常系（FR-029）', async () => {
    const state = fixedGameState();
    const res = await post({ sealed: seal(state), turn: 1, direction: 'withdraw', detail: '' });

    expect(res.status).toBe(200);
  });

  it('4 値以外の direction は invalid_action', async () => {
    const state = fixedGameState();
    const res = await post({ sealed: seal(state), turn: 1, direction: 'dance', detail: '' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_action' });
  });

  it('改竄された封緘文字列は invalid_state で、状態は進まない', async () => {
    const sealed = seal(fixedGameState());
    // 末尾の 1 文字を別の文字に差し替える（認証タグが一致しなくなる）
    const tampered = sealed.slice(0, -1) + (sealed.endsWith('A') ? 'B' : 'A');
    const res = await post({ sealed: tampered, turn: 1, direction: 'observe', detail: '' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'invalid_state' });
    expect(body.sealed).toBeUndefined();
  });

  it('turn が一致しなければ turn_mismatch で、状態は進まない', async () => {
    const state = fixedGameState();
    const res = await post({ sealed: seal(state), turn: 3, direction: 'observe', detail: '' });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({ error: 'turn_mismatch' });
    expect(body.sealed).toBeUndefined();
  });

  it('決着後は状態を変えず 200 で現在の投影を返す', async () => {
    const state = fixedGameState();
    const ended: GameState = {
      ...state,
      ending: {
        reason: 'timeout',
        text: '夜が明けた。',
        reveal: { nature: 'n', purpose: 'p', weakness: 'w', secret: 's' },
      },
    };
    const sealed = seal(ended);
    const res = await post({ sealed, turn: 1, direction: 'attack', detail: '殴る' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sealed).toBe(sealed);
    expect(body.delta).toEqual({ hp: 0, sanity: 0, clueId: null });
    expect(unseal(body.sealed)?.turn).toBe(state.turn);
  });

  it('JSON として壊れたボディは invalid_action', async () => {
    const res = await POST(
      new Request('http://localhost/api/turn', { method: 'POST', body: 'not json' }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_action' });
  });
});
