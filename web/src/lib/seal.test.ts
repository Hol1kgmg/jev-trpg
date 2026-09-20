import { beforeAll, describe, expect, it } from 'vitest';
import { fixedGameState } from './game/fixture';
import { seal, unseal } from './seal';

beforeAll(() => {
  process.env.SEAL_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('seal / unseal', () => {
  it('往復して同じ状態が戻る', () => {
    const state = fixedGameState();
    expect(unseal(seal(state))).toEqual(state);
  });

  it('1 文字書き換えた封緘文字列は null を返す', () => {
    const sealed = seal(fixedGameState());
    // 末尾（本文側）の 1 文字を別の base64url 文字に置き換える
    const last = sealed.at(-1)!;
    const tampered = sealed.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    expect(unseal(tampered)).toBeNull();
  });

  it('version が不一致なら null を返す', () => {
    const sealed = seal({ ...fixedGameState(), version: 999 });
    expect(unseal(sealed)).toBeNull();
  });

  it('封緘文字列でない入力でも例外を投げずに null を返す', () => {
    expect(unseal('')).toBeNull();
    expect(unseal('not-a-sealed-state')).toBeNull();
  });
});
