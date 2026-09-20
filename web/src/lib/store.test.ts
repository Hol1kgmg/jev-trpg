// 保存と復元（AS 3-2 / AS 3-3）。localStorage は最小限のスタブで代用する。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VisibleState } from './game/types';
import { clearSave, loadSave, SAVE_VERSION, useGame, writeSave } from './store';

const STORAGE_KEY = 'jev-trpg/save';

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  });
  return map;
}

const visible = {
  occupation: '気象観測技師',
  skills: { investigate: 65, combat: 25, persuade: 40, escape: 50, occult: 15, stealth: 35 },
  items: ['携帯用の照度計'],
  hp: 10,
  sanity: 10,
  turn: 1,
  maxTurn: 8,
  scene: '薄い像が立っている。',
  entityEpithet: '遅れて届く光',
  entityAppearance: '接眼部の手前に薄い像がある。',
  acquiredClues: [],
  log: [],
  ending: null,
} as unknown as VisibleState;

describe('保存値の復元', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = stubStorage();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('待機画面のまま保存・復元できる（AS 3-2）', () => {
    writeSave({ sealed: 'sealed-1', visible, phase: 'briefing' });
    expect(loadSave()).toEqual({ sealed: 'sealed-1', visible, phase: 'briefing' });
  });

  it('プレイ中の状態も保存・復元できる', () => {
    writeSave({ sealed: 'sealed-2', visible, phase: 'playing' });
    expect(loadSave()?.phase).toBe('playing');
  });

  it('保存するのは封緘文字列・VisibleState・phase だけ', () => {
    writeSave({ sealed: 'sealed-3', visible, phase: 'briefing' });
    const raw = JSON.parse(store.get(STORAGE_KEY) as string);
    expect(Object.keys(raw).sort()).toEqual(['phase', 'sealed', 'version', 'visible']);
  });

  it('壊れた保存値では例外を投げず null になる', () => {
    store.set(STORAGE_KEY, '{ これは JSON ではない');
    expect(loadSave()).toBeNull();
  });

  it('version が不一致なら null になる', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({ version: SAVE_VERSION + 1, sealed: 's', visible, phase: 'briefing' }),
    );
    expect(loadSave()).toBeNull();
  });

  it('必須フィールドが欠けていれば null になる', () => {
    store.set(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, phase: 'briefing' }));
    expect(loadSave()).toBeNull();

    store.set(
      STORAGE_KEY,
      JSON.stringify({ version: SAVE_VERSION, sealed: 's', visible, phase: 'ending' }),
    );
    expect(loadSave()).toBeNull();
  });

  it('保存値がなければ null になる', () => {
    expect(loadSave()).toBeNull();
  });

  it('clearSave のあとは復元されない', () => {
    writeSave({ sealed: 'sealed-4', visible, phase: 'playing' });
    clearSave();
    expect(loadSave()).toBeNull();
  });

  it('localStorage が使えない環境でも例外を投げない', () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(loadSave()).toBeNull();
    expect(() => writeSave({ sealed: 's', visible, phase: 'briefing' })).not.toThrow();
    expect(() => clearSave()).not.toThrow();
  });

  it('restore は保存値があれば通信せずに復元する', async () => {
    writeSave({ sealed: 'sealed-5', visible, phase: 'playing' });
    await useGame.getState().restore();

    const state = useGame.getState();
    expect(state.sealed).toBe('sealed-5');
    expect(state.phase).toBe('playing');
    expect(state.error).toBeNull();
  });

  it('壊れた保存値なら restore は新規プレイへ落ちる（AS 3-2）', async () => {
    store.set(STORAGE_KEY, 'broken');
    useGame.setState({ sealed: null, visible: null, phase: 'briefing', error: null });

    // fetch は差し替えていないので新規プレイの取得自体は失敗するが、
    // 例外にはならず「新規プレイを提案する」状態（visible === null）に落ちる
    await useGame.getState().restore();

    const state = useGame.getState();
    expect(state.visible).toBeNull();
    expect(state.error).toBe('failed');
  });
});
