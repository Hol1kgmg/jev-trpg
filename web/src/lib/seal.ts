// ゲーム状態全体を AES-256-GCM で封緘する（research.md R-003）。
// これ 1 つで FR-003（秘密の非開示）・FR-016（改竄検証）・壊れたセーブの検出が片付く。
// 依存は node:crypto のみ。

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { GameState } from './game/types';
import { MAX_TURN } from './game/types';

/** GameState のスキーマ版。型を変えたら上げる（既存セーブは開封失敗になる） */
export const STATE_VERSION = 1;

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function key(): Buffer {
  const raw = process.env.SEAL_KEY;
  if (!raw) throw new Error('SEAL_KEY is not set');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('SEAL_KEY must be 32 bytes encoded as base64');
  return buf;
}

export function seal(state: GameState): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** 開封失敗（認証タグ不一致・version 不一致・turn が範囲外）は例外を投げず null を返す */
export function unseal(sealed: string): GameState | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    if (raw.length <= IV_LENGTH + TAG_LENGTH) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, IV_LENGTH));
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    const json = Buffer.concat([
      decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8');
    const state = JSON.parse(json) as GameState;
    if (state?.version !== STATE_VERSION) return null;
    // 決着後の状態は turn が MAX_TURN + 1 になりうる（timeout の判定が turn > MAX_TURN のため）
    if (!Number.isInteger(state.turn) || state.turn < 1 || state.turn > MAX_TURN + 1) return null;
    return state;
  } catch {
    return null;
  }
}
