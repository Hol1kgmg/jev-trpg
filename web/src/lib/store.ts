// クライアントが持つのは封緘文字列（不透明）と VisibleState、待機/プレイの別だけ
// （data-model.md 信頼境界）。localStorage に置くのもこの 3 つだけで、秘密は一切載らない。

import { create } from 'zustand';
import type { Direction, RateBreakdown, VisibleState } from './game/types';

type TurnResponse = {
  sealed: string;
  visible: VisibleState;
};

type PreviewResponse = { sealed: string; previews: number; rate: RateBreakdown | null };

/** 事前判定の結果。どの入力に対する判定かを持ち、画面は一致するときだけ表示する */
export type PreviewResult = { direction: Direction; detail: string; rate: RateBreakdown | null };

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
  /** 事前判定の通信中。submit とは別に持ち、入力を止めない */
  previewing: boolean;
  /** 直近の事前判定。ターンが進むと消える */
  preview: PreviewResult | null;
  /** 事前判定の上限に達した。入力を固定し、最後の判定で確定する */
  previewExhausted: boolean;
  newGame: () => Promise<void>;
  /** 保存値があれば復元し、なければ新規プレイを開始する */
  restore: () => Promise<void>;
  startSession: () => void;
  /** 事前判定。Jev を 1 回呼び、成功率の内訳だけを受け取る（ADR 0004） */
  requestPreview: (direction: Direction, detail: string) => Promise<void>;
  submit: (direction: Direction, detail: string) => Promise<void>;
};

export const useGame = create<GameStore>((set, get) => ({
  sealed: null,
  visible: null,
  phase: 'briefing',
  sending: false,
  error: null,
  previewing: false,
  preview: null,
  previewExhausted: false,

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
      set({ ...save, error: null, preview: null, previewExhausted: false });
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

  requestPreview: async (direction: Direction, detail: string) => {
    const { sealed, visible, phase, sending, previewing, previewExhausted } = get();
    if (
      sending ||
      previewing ||
      previewExhausted ||
      phase !== 'playing' ||
      sealed === null ||
      visible === null
    )
      return;
    set({ previewing: true });
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sealed, turn: visible.turn, direction, detail }),
      });
      if (res.status === 429) {
        set({ previewExhausted: true });
        return;
      }
      // 失敗は黙って何も出さない。実行時に判定されるので行き止まりにならない
      if (!res.ok) return;
      const data = (await res.json()) as PreviewResponse;
      // 待っている間にターンが進んでいたら捨てる（古い封緘で上書きしない）
      if (get().sealed !== sealed) return;
      // 封緘には判定回数と Judgment が入ったので差し替える。visible は変わらない
      writeSave({ sealed: data.sealed, visible, phase });
      set({ sealed: data.sealed, preview: { direction, detail, rate: data.rate } });
    } catch {
      // ネットワーク断でも同上
    } finally {
      set({ previewing: false });
    }
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
      set({ ...save, error: null, preview: null, previewExhausted: false });
    } catch {
      set({ error: 'failed' });
    } finally {
      set({ sending: false });
    }
  },
}));
