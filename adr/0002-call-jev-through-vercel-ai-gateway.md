---
status: 'accepted'
date: 2026-09-20
decision-makers: 'Hol1kgmg'
---

# Jev を Vercel AI Gateway 経由で呼ぶ

## Context and Problem Statement

このゲームは、プレイヤーが日本語で書いた行動の詳細を解釈する部分だけを Jev（TypeSafe の評価モデル）に任せる。判定に使うのは構造化された回答（技能・妥当性・恐怖曝露・弱点への作用・クリア条件の充足・メタ入力の検出）だけで、文章の生成はさせない。

Jev への到達経路は 2 つある。TypeSafe の公式 SDK（`@typesafe-ai/sdk` + `TYPESAFE_API_KEY`）で直接叩く経路と、Vercel AI Gateway をプロバイダとして AI SDK の `experimental_evaluate` から呼ぶ経路である。

ここで制約がひとつある。**TypeSafe のアカウントを開設できない。** 直接アクセスは選択肢として成立しない。

残る論点は、Gateway 経由で呼ぶときにプロバイダインスタンス（`@ai-sdk/gateway` の `gateway.evaluationModel(...)`）を明示するか、モデル ID を文字列で渡して AI SDK のルーティングに任せるかである。

## Decision

AI SDK (`ai`) の `experimental_evaluate` に、モデル ID を文字列 `'typesafe-ai/jev'` で渡す。依存は `ai` 1 つに閉じ、`@ai-sdk/gateway` は入れない。

```ts
await evaluate({
  model: 'typesafe-ai/jev',
  state,
  questions,
  maxRetries: 0,
  abortSignal: AbortSignal.timeout(5000),
});
```

- 呼び出しは `web/src/lib/jev/client.ts` の `judge()` 1 箇所だけ。1 ターンにつきちょうど 1 回
- `maxRetries: 0`。AI SDK の既定は 2 回だが、Constitution II の「1ターン1回」を満たすために明示的に切る
- 失敗（例外・5 秒のタイムアウト・スキーマ不一致）は再試行せず、`confidence: 0` のフォールバック `Judgment` に落とす。結果は必ず `ambiguous`（手応えがない）になり、ターンは消費されるがプレイは行き止まりにならない
- 認証は本番・プレビューでは Vercel が自動注入する `VERCEL_OIDC_TOKEN`、ローカル開発では `AI_GATEWAY_API_KEY`
- プレイヤーの入力文字列は `state.action.detail` に値として渡すだけで、`instructions` や `criteria` に連結しない

**Non-goals**

- 確信度が低いときに問い直さない。追加の呼び出しは Constitution II に反する
- Jev に文章を書かせない。描写はすべてテンプレート選択で作る（別 ADR）

## Consequences

- Good, because 既に使っている Vercel のアカウントと請求だけで Jev に到達できる。TypeSafe のアカウントが要らない
- Good, because 本番でキーの管理が要らない（OIDC トークンが自動注入される）
- Good, because 依存が `ai` 1 つで済む。プロバイダインスタンスを明示しても結果は同じなので、依存を増やす分だけ損になる
- Bad, because `experimental_evaluate` は名前のとおり実験的で、`ai` のマイナー更新で壊れうる。`ai` はマイナー版まで固定し、更新は `just eval-jev` を流してから行う
- Bad, because Gateway の障害がそのままゲームの劣化（全ターンが `ambiguous`）に直結する。ただし停止はしない
- Neutral, because 破壊的変更の影響範囲は `client.ts` 1 ファイルに閉じている

## Implementation Plan

- **Affected paths**: `web/src/lib/jev/client.ts`、`web/src/lib/jev/questions.ts`、`web/src/app/api/turn/route.ts`
- **Dependencies**: `ai`（マイナー版固定）、`AI_GATEWAY_API_KEY`（ローカルのみ）
- **Patterns to follow**:
  - Jev を呼ぶのは `judge()` だけ。ここより先はすべて `Judgment` を引数に取る純関数にする
  - 応答の正規化は `normalizeJudgment()` に置き、期待と違う形は例外にしてフォールバックへ落とす
  - `JEV_STUB=1` のスタブ経路を残す。API キーなし・ネットワークなしで遊べる状態を壊さない
- **Patterns to avoid**:
  - `judge()` の中で再試行する
  - プレイヤーの入力を `instructions` / `criteria` に文字列連結する
  - `NEXT_PUBLIC_` 接頭辞をキーに付ける

### Verification

- [x] `judge()` が応答を写像表どおりに `Judgment` へ変換する（`client.test.ts`）
- [x] 例外・中断・スキーマ不一致で `source: 'fallback'` / `confidence: 0` になり、呼び出しは 1 回のまま（`client.test.ts`）
- [x] `providerMetadata` 欠損時に `confidence` が `0` になる（`client.test.ts`）
- [ ] `just eval-jev` の skill 一致率が 80% 以上（SC-005）

## Alternatives Considered

- **公式 SDK で直接アクセスする**: API が安定版という利点があるが、TypeSafe のアカウントが開設できないため選べない
- **`@ai-sdk/gateway` のプロバイダインスタンスを明示する**: モデル ID の文字列指定と結果が同じで、依存が 1 つ増えるだけ
- **生の HTTP で叩く**: 型が落ちるだけで得がない
- **確信度が低ければ再問い合わせ**: Constitution II（1ターン1回）に反する。低確信度は `ambiguous` というゲーム内の結果に写す
- **`zeroDataRetention` を付ける**: 当初は Gateway 経由の利点として数えていたが、採用理由から外した。このゲームはプレイヤーに個人情報の入力を求めず、行動の詳細を書かせるだけで、プレイヤー向けのデータ保持の表明もしていない。守る対象がないフラグだった。加えて Vercel の Hobby プランでは ZDR に対応しておらず、現在の契約では指定しても効かない。有料プランに移り、かつ保持されて困る入力を扱うようになったら、そのときに入れ直す

## More Information

- 根拠: `specs/001-jev-cosmic-horror-trpg/research.md` R-001 / R-002 / R-005
- 契約: `specs/001-jev-cosmic-horror-trpg/contracts/jev-questions.md`
- 再検討条件: TypeSafe のアカウントを開設できるようになったら、直接アクセスとの比較をやり直す。`experimental_evaluate` が安定版になったら固定方針を緩める
