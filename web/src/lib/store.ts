// クライアントが持つのは封緘文字列（不透明）と VisibleState、待機/プレイの別だけ
// （data-model.md 信頼境界）。

import { create } from 'zustand';
import type { Direction, VisibleState } from './game/types';

type TurnResponse = {
  sealed: string;
  visible: VisibleState;
};

/** 待機画面とセッション中の別。サーバーには持たせない（FR-028） */
type Phase = 'briefing' | 'playing';

type GameStore = {
  sealed: string | null;
  visible: VisibleState | null;
  phase: Phase;
  /** 同一ターンの二重送信を抑止する */
  sending: boolean;
  error: 'invalid_state' | 'invalid_action' | 'failed' | null;
  newGame: () => Promise<void>;
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
    try {
      const res = await fetch('/api/new-game', { method: 'POST' });
      if (!res.ok) throw new Error('new-game failed');
      const data = (await res.json()) as TurnResponse;
      set({ sealed: data.sealed, visible: data.visible, phase: 'briefing', error: null });
    } catch {
      set({ error: 'failed' });
    } finally {
      set({ sending: false });
    }
  },

  // 一方向の遷移だけ。通信は発生しない（FR-028）
  startSession: () => {
    if (get().visible !== null) set({ phase: 'playing' });
  },

  submit: async (direction: Direction, detail: string) => {
    const { sealed, visible, sending } = get();
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
        set({ error: body.error === 'invalid_state' ? 'invalid_state' : 'invalid_action' });
        return;
      }
      const data = (await res.json()) as TurnResponse;
      set({ sealed: data.sealed, visible: data.visible, error: null });
    } catch {
      set({ error: 'failed' });
    } finally {
      set({ sending: false });
    }
  },
}));
