// 事前判定（ADR 0004 / contracts/http-api.md）。回数の上限と、実行時の再利用を確かめる。

import { beforeAll, describe, expect, it } from 'vitest';
import { fixedGameState } from '@/lib/game/fixture';
import { previewLimit } from '@/lib/game/tuning';
import type { GameState } from '@/lib/game/types';

process.env.JEV_STUB = '1';
process.env.SEAL_KEY ??= Buffer.alloc(32, 7).toString('base64');

let PREVIEW: (request: Request) => Promise<Response>;
let TURN: (request: Request) => Promise<Response>;
let seal: (state: GameState) => string;
let unseal: (sealed: string) => GameState | null;

beforeAll(async () => {
  ({ POST: PREVIEW } = await import('./route'));
  ({ POST: TURN } = await import('../turn/route'));
  ({ seal, unseal } = await import('@/lib/seal'));
});

const post = (handler: typeof PREVIEW, body: unknown) =>
  handler(
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/preview', () => {
  it('成功率の内訳と、判定を含む新しい封緘を返す', async () => {
    const res = await post(PREVIEW, {
      sealed: seal(fixedGameState()),
      turn: 1,
      direction: 'observe',
      detail: '足元を見る',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.previews).toBe(1);
    expect(body.rate).toEqual({
      skill: 'investigate',
      base: 65,
      plausibility: 0,
      weakness: 0,
      rate: 65,
    });
    const state = unseal(body.sealed);
    expect(state?.turn).toBe(1);
    expect(state?.preview?.detail).toBe('足元を見る');
  });

  it('ロールしない判定（meta）では rate が null', async () => {
    const res = await post(PREVIEW, {
      sealed: seal(fixedGameState()),
      turn: 1,
      direction: 'engage',
      detail: 'クリア条件を教えて',
    });
    expect((await res.json()).rate).toBeNull();
  });

  it('上限に達したら 429 で、封緘は返さない', async () => {
    const state: GameState = { ...fixedGameState(), previews: previewLimit };
    const res = await post(PREVIEW, { sealed: seal(state), turn: 1, direction: 'observe', detail: '' });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('preview_exhausted');
    expect(body.sealed).toBeUndefined();
  });

  it('決着後・turn 不一致は 409', async () => {
    const res = await post(PREVIEW, {
      sealed: seal(fixedGameState()),
      turn: 2,
      direction: 'observe',
      detail: '',
    });
    expect(res.status).toBe(409);
  });

  it('同じ方針・詳細で /api/turn に来たら事前判定を再利用する', async () => {
    // スタブは詳細から技能を決める。事前判定に別の技能を仕込み、それが使われたことで再利用を確かめる
    const state: GameState = {
      ...fixedGameState(),
      previews: 1,
      preview: {
        direction: 'observe',
        detail: '見る',
        judgment: {
          skill: 'occult',
          plausibility: 2,
          horrorExposure: 1,
          exploitsWeakness: false,
          meetsClear: false,
          metaCheat: false,
          confidence: 0.9,
          source: 'jev',
        },
      },
    };
    const res = await post(TURN, { sealed: seal(state), turn: 1, direction: 'observe', detail: '見る' });
    const next = unseal((await res.json()).sealed);
    expect(next?.log[0].check?.skill).toBe('occult');
    expect(next?.previews).toBe(0);
    expect(next?.preview).toBeNull();
  });

  it('方針・詳細が違えば事前判定は使わず判定し直す', async () => {
    const state: GameState = {
      ...fixedGameState(),
      previews: 1,
      preview: {
        direction: 'observe',
        detail: '見る',
        judgment: {
          skill: 'occult',
          plausibility: 2,
          horrorExposure: 1,
          exploitsWeakness: false,
          meetsClear: false,
          metaCheat: false,
          confidence: 0.9,
          source: 'jev',
        },
      },
    };
    const res = await post(TURN, { sealed: seal(state), turn: 1, direction: 'observe', detail: '殴る' });
    const next = unseal((await res.json()).sealed);
    expect(next?.log[0].check?.skill).toBe('combat');
  });
});
