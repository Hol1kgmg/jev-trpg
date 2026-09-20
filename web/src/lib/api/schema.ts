// リクエスト境界の検証（contracts/http-api.md）。

import { z } from 'zod';

export const newGameRequest = z.object({}).loose();

export const turnRequest = z.object({
  sealed: z.string().min(1),
  turn: z.number().int(),
  action: z
    .string()
    .min(1)
    .max(200)
    .refine((s) => s.trim().length > 0, { message: 'action must not be blank' }),
});

export type TurnRequest = z.infer<typeof turnRequest>;
