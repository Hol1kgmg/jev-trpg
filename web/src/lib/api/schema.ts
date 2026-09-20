// リクエスト境界の検証（contracts/http-api.md）。

import { z } from 'zod';
import { DIRECTIONS } from '@/lib/game/types';

export const newGameRequest = z.object({}).loose();

export const turnRequest = z.object({
  sealed: z.string().min(1),
  turn: z.number().int(),
  direction: z.enum(DIRECTIONS),
  /** 空文字は正常系（FR-029） */
  detail: z.string().max(200),
});

export type TurnRequest = z.infer<typeof turnRequest>;
