// クライアントが持つのは封緘文字列（不透明）と VisibleState、待機/プレイの別だけ
// （data-model.md 信頼境界）。localStorage に置くのもこの 3 つだけで、秘密は一切載らない。

import { create } from 'zustand';
import type { Direction, VisibleState } from './game/types';

type TurnResponse = {
  sealed: string;
  visible: VisibleState;
};

/** 待機画面とセッション中の別。サーバーには持たせない（FR-028） */
type Phase = 'briefing' | 'playing';

export type Save = { sealed: string; visible: VisibleState; phase: Phase };

const STORAGE_KEY = 'jev-trpg/save';

/** 保存形式の版。形を変えたら上げる（既存の保存値は復元されず新規プレイに落ちる） */
export const SAVE_VERSION = 1;

/** 壊れた保存値・版違い・localStorage が使えない環境では null。例外は投げない（AS 3-2） */
export function loadSave(): Save | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as Partial<Save> & { version?: unknown };
    if (save?.version !== SAVE_VERSION) return null;
    if (typeof save.sealed !== 'string' || save.sealed === '') return null;
    if (save.visible === null || typeof save.visible !== 'object') return null;
    if (save.phase !== 'briefing' && save.phase !== 'playing') return null;
    return { sealed: save.sealed, visible: save.visible as VisibleState, phase: save.phase };
  } catch {
    return null;
  }
}

export function writeSave(save: Save): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, ...save }));
  } catch {
    // 保存できなくてもプレイは続けられる（容量超過・プライベートモード）
  }
}

export function clearSave(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても次の保存で上書きされる
  }
}

type GameStore = {
  sealed: string | null;
  visible: VisibleState | null;
  phase: Phase;
  /** 同一ターンの二重送信を抑止する */
  sending: boolean;
  error: 'invalid_state' | 'invalid_action' | 'failed' | null;
  newGame: () => Promise<void>;
  /** 保存値があれば復元し、なければ新規プレイを開始する */
  restore: () => Promise<void>;
  startSession: () => void;
  submit: (direction: Direction, detail: string) => Promise<void>;
};

export const useGame = create<GameStore>((set, get) => ({
  sealed: null,
  visible: null,
  phase: 'briefing',
  sending: false,
  error: null,

  newGame: async () => {
    if (get().sending) return;
    set({ sending: true, error: null });
    clearSave();
    try {
      const res = await fetch('/api/new-game', { method: 'POST' });
      if (!res.ok) throw new Error('new-game failed');
      const data = (await res.json()) as TurnResponse;
      const save: Save = { sealed: data.sealed, visible: data.visible, phase: 'briefing' };
      writeSave(save);
      set({ ...save, error: null });
    } catch {
      set({ error: 'failed' });
    } finally {
      set({ sending: false });
    }
  },

  restore: async () => {
    const save = loadSave();
    if (save === null) return get().newGame();
    set({ ...save, error: null });
  },

  // 一方向の遷移だけ。通信は発生しない（FR-028）
  startSession: () => {
    const { sealed, visible } = get();
    if (sealed === null || visible === null) return;
    writeSave({ sealed, visible, phase: 'playing' });
    set({ phase: 'playing' });
  },

  submit: async (direction: Direction, detail: string) => {
    const { sealed, visible, phase, sending } = get();
    if (sending || sealed === null || visible === null) return;
    set({ sending: true, error: null });
    try {
      const res = await fetch('/api/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealed, turn: visible.turn, direction, detail }),
      });
      if (res.status === 409) return; // 二重送信。直前の状態を保持したまま何もしない
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === 'invalid_state') {
          // 読めない保存値を残さない。画面は新規プレイを提案する（AS 3-3）
          clearSave();
          set({ error: 'invalid_state' });
        } else {
          set({ error: 'invalid_action' });
        }
        return;
      }
      const data = (await res.json()) as TurnResponse;
      const save: Save = { sealed: data.sealed, visible: data.visible, phase };
      writeSave(save);
      set({ ...save, error: null });
    } catch {
      set({ error: 'failed' });
    } finally {
      set({ sending: false });
    }
  },
}));
