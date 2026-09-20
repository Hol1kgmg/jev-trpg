// クライアントが持つのは封緘文字列（不透明）と VisibleState だけ（data-model.md 信頼境界）。

import { create } from 'zustand';
import type { VisibleState } from './game/types';

type TurnResponse = {
  sealed: string;
  visible: VisibleState;
  narration: string;
};

type GameStore = {
  sealed: string | null;
  visible: VisibleState | null;
  /** 同一ターンの二重送信を抑止する */
  sending: boolean;
  error: 'invalid_state' | 'invalid_action' | 'failed' | null;
  newGame: () => Promise<void>;
  submit: (action: string) => Promise<void>;
};

export const useGame = create<GameStore>((set, get) => ({
  sealed: null,
  visible: null,
  sending: false,
  error: null,

  newGame: async () => {
    if (get().sending) return;
    set({ sending: true, error: null });
    try {
      const res = await fetch('/api/new-game', { method: 'POST' });
      if (!res.ok) throw new Error('new-game failed');
      const data = (await res.json()) as TurnResponse;
      set({ sealed: data.sealed, visible: data.visible, error: null });
    } catch {
      set({ error: 'failed' });
    } finally {
      set({ sending: false });
    }
  },

  submit: async (action: string) => {
    const { sealed, visible, sending } = get();
    if (sending || sealed === null || visible === null) return;
    set({ sending: true, error: null });
    try {
      const res = await fetch('/api/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealed, turn: visible.turn, action }),
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
