// Jev の日本語解釈精度を実 API で測る（research.md R-005 / SC-005 目標 80%）。
// Vitest のスイートには含めず、CI からも外す（Constitution IV。vitest.config.ts の exclude）。
//
//   just eval-jev
//
// AI_GATEWAY_API_KEY が要る。JEV_STUB は明示的に無効化する（スタブを測っても意味がない）。
// 技能は方針で確定するようになったので、測るのは plausibility だけ。

import { fixedGameState } from '../../game/fixture';
import { narrateScene } from '../../game/narrate';
import type { Direction, JevState } from '../../game/types';
import { judge, routeDescription } from '../client';
import cases from './cases.ja.json' with { type: 'json' };

type Case = { direction: Direction; detail: string; plausibility: number };

const state = fixedGameState();
const scene = narrateScene(state, Math.random);

function jevState(c: Case): JevState {
  return {
    scene,
    investigator: {
      occupation: state.investigator.occupation,
      skills: state.investigator.skills,
      items: state.investigator.items,
      hp: state.investigator.hp,
      sanity: state.investigator.sanity,
    },
    acquiredClues: [],
    action: { direction: c.direction, detail: c.detail },
  };
}

async function main(): Promise<void> {
  delete process.env.JEV_STUB;

  let plausibilityHits = 0;
  let degraded = 0;

  for (const [i, c] of (cases as Case[]).entries()) {
    const judgment = await judge(jevState(c), routeDescription(state, c.direction));
    if (judgment.source === 'fallback') degraded++;

    // plausibility は連続値なので、丸めて ±1 レベルまでを一致とみなす
    const plausibilityOk = Math.abs(Math.round(judgment.plausibility) - c.plausibility) <= 1;
    if (plausibilityOk) plausibilityHits++;

    const label = c.detail === '' ? '(詳細なし)' : c.detail;
    console.log(
      `${String(i + 1).padStart(2)} ${plausibilityOk ? '○' : '×'} ${c.direction} ${label}\n` +
        `      期待 plausibility=${c.plausibility} / ` +
        `実際 plausibility=${judgment.plausibility.toFixed(2)} ` +
        `confidence=${judgment.confidence.toFixed(2)}`,
    );
  }

  const total = cases.length;
  const rate = (hits: number) => `${((hits / total) * 100).toFixed(1)}%`;
  console.log(`\n件数: ${total}　呼び出し失敗: ${degraded}`);
  console.log(`plausibility 一致率（±1 レベル）: ${rate(plausibilityHits)}（${plausibilityHits}/${total}）`);
  console.log('SC-005 の目標は 80%。届かなければ questions.ts の criteria 文言を調整する。');

  // 全件フォールバックなら測っているのは Jev ではなく fallbackJudgment の固定値。
  // 一致率がそれらしい数字に見えてしまうので、測定として無効だと明示して落とす。
  if (degraded === total) {
    console.error('\n全件が呼び出し失敗。上の一致率は Jev ではなくフォールバック値の一致率で、SC-005 の測定として無効。');
    process.exitCode = 1;
  }
}

await main();
