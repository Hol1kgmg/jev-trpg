# Implementation Plan: Jev判定型コズミックホラーTRPG（MVP）

**Branch**: `001-jev-cosmic-horror-trpg` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-jev-cosmic-horror-trpg/spec.md`

## Summary

ブラウザで遊ぶ1人用コズミックホラーTRPG。探索者・怪異・クリア条件をランダム生成し、
プレイヤーの自由入力を Jev（TypeSafe AI の System One モデル）が構造化値に解釈し、
成否の算出と状態更新はコード側の純関数が行う。最大12ターン、1プレイ15〜20分。

技術的な骨子は 3 つ。

1. **Jev は解釈のみ**。Vercel AI Gateway 経由で `experimental_evaluate` を 1 ターン 1 回だけ
   呼び、7 つの質問（choice 2 / score 2 / boolean 3）をまとめて投げる。成功率の算出・d100・状態更新は
   `Judgment` を引数に取る純関数で、Jev をモックせずとも値を渡すだけでテストできる。
2. **秘密はサーバー側の鍵で封緘する**。ゲーム状態全体を AES-256-GCM で封緘した
   不透明文字列として localStorage に保存し、クライアントは描画用の可視状態だけを
   平文で持つ。これ 1 つでクリア条件の非開示（FR-003）、クライアント state の
   改竄検証（FR-016）、壊れたセーブの検出が同時に片付く。
3. **描写はテンプレート**。`(場面, 行動種別, 結果段階)` をキーに複数バリエーションを持ち、
   所持品名・怪異の異名を差し込む。LLM に文章を生成させない。

権利面では、本作を**独自設定の一次創作**として位置づけ、アークライト「TRPG二次創作活動
ガイドライン」の禁止行為を越えてはならない線として spec に固定した（FR-021〜FR-025、
research.md R-009）。実装側の負担は、画像素材を `src/data/assets.ts` の
`AssetEntry[]` 1 配列で管理し、登録漏れをテストで検出することに集約する。

設計判断の根拠は [research.md](./research.md)、型と状態遷移は
[data-model.md](./data-model.md)、インターフェースは [contracts/](./contracts/)、
検証手順は [quickstart.md](./quickstart.md) に分けて記述した。

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS

**Primary Dependencies**: Next.js（App Router）, `ai`（AI SDK。Vercel AI Gateway 経由で
モデル `typesafe-ai/jev` を呼ぶ。`experimental_` API に依存するためマイナー版まで固定）,
Zustand, Tailwind CSS, Zod

**Storage**: localStorage のみ（封緘済み `GameState` + 平文 `VisibleState`）。サーバー永続化なし

**Testing**: Vitest。`src/lib/jev/client.ts` を `vi.mock` で差し替え、d100 は `rng` 注入で決定化。
Jev の精度検証は `just eval-jev` として本体テストから分離（CI 対象外）

**Target Platform**: モダンブラウザ（PC / スマートフォン縦画面）、デプロイ先は Vercel

**Project Type**: Web application（Next.js 単一プロジェクト。フロントと Route Handler を同居）

**Performance Goals**: 行動送信から結果描写まで、90% のターンで 3 秒以内（SC-004）。
Jev のタイムアウトは 5 秒で、超えたらフォールバックでターンを完結させる

**Constraints**: Jev の呼び出しは 1 ターン 1 回（Constitution II）。コンテキストは 32,000 トークン上限だが、
渡すのは現在地・探索者要約・入手済み手がかり・今回の行動に限るため実質的な制約にならない。
秘匿値（`AI_GATEWAY_API_KEY` / `SEAL_KEY`）はサーバー側のみ。Vercel 本番では Gateway の認証が
`VERCEL_OIDC_TOKEN` の自動注入で済むため、設定が必要なのは `SEAL_KEY` だけ

**Scale/Scope**: シナリオ 1 本、場所 4〜5 箇所、手がかり 5〜7 個、最大 12 ターン、画面 4 つ
（プレイ画面・エンディング・新規開始・クレジット）。同時接続やマルチプレイは範囲外

**Content & Licensing**: 世界観・ルール・用語はすべて独自定義で、既存TRPG作品の二次創作物
ではない（research.md R-009）。無償公開・収益化機能なし。画像素材は第三者のフリー素材・
CC ライセンス素材のみで、`src/data/assets.ts` の `AssetEntry[]` に登録したものだけを参照する

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 本計画での担保 | 判定（設計前 / 設計後） |
|---|---|---|
| I. 判定はコード、解釈だけが LLM | Jev の応答は `Judgment` に正規化されるだけで状態を変えない。成功率の式・d100・HP/正気度/手がかり/ターンの更新は `src/lib/game/` の純関数（research.md R-006）。描写は `src/data/templates/` から選択 | PASS / PASS |
| II. 1ターン1回の Jev 呼び出し | `POST /api/turn` のハンドラ内で `judge()` を 1 回だけ呼ぶ。7 問を 1 リクエストにまとめる。`state` は判定に必要な最小限（contracts/jev-questions.md）。`providerMetadata.typesafe.confidence.action_type` が 0.5 未満（欠損含む）なら `ambiguous`。呼び出し失敗は再試行せずフォールバックで完結 | PASS / PASS |
| III. 生成物は解けることを保証する | 生成直後に `clearCondition.requiredClueIds ⊆ 全 Location.clueIds` を集合演算で検証し、失敗なら破棄して再生成（上限 50 回）。100 シードのテストで担保（research.md R-007 / SC-003） | PASS / PASS |
| IV. LLM なしでテストできる | モックする境界は `judge()` の 1 関数のみ。ゲームロジックは `Judgment` を引数に取る純関数。`just test` は API キー未設定で完走する。精度検証は `just eval-jev` に分離 | PASS / PASS |
| V. MVP 優先・YAGNI | エンドポイント 2 本、ライブラリの新規抽象ゼロ。封緘は Node 標準 `node:crypto` のみで依存を増やさない。Gateway 呼び出しはモデル ID の文字列指定で済ませ、`@ai-sdk/gateway` のプロバイダインスタンスは追加しない。単一実装のインターフェースを作らない。調整用の数値は `tuning.ts` 1 ファイルに集約（設定機構は作らない）。素材マニフェストは TypeScript の配列 1 つで、ライセンス互換性の自動判定機構は作らない（research.md R-009） | PASS / PASS |

**技術制約とセキュリティ境界の確認**（Constitution v1.1.0）:

- スタックは Constitution の指定どおり。追加依存は `ai` と Zod（リクエスト境界の検証用）
- Jev は AI Gateway 経由で Route Handler からのみ呼ぶ。自前のゲートウェイ層や
  プロバイダ抽象は追加せず、参照するモデルは Jev のみ（research.md R-001）
- `ai` はマイナー版まで固定する（`experimental_evaluate` への依存のため）
- `AI_GATEWAY_API_KEY` / `SEAL_KEY` はサーバー側のみ。`NEXT_PUBLIC_` を付けない
- Jev 呼び出しに `providerOptions: { gateway: { zeroDataRetention: true } }` を付ける
- クライアントから来た封緘状態は GCM の認証タグで検証してから処理する
- `meta_cheat` は判定結果として扱い、入力文字列を `instructions` に連結しない

**コンテンツと権利の境界の確認**（spec.md FR-021〜FR-025 / research.md R-009）:

- 判定システム・技能名・神話的存在の名称はすべて独自定義。既存TRPG作品のルール・表・
  データ・固有名詞をコードにもテンプレートにも含めない（FR-022）
- 「公式」「公認」の表記、既存作品のロゴ・装丁を模した意匠を使わない（FR-023）
- 収益化機能（課金・広告・投げ銭）を実装しない（FR-021）
- 画像素材は `src/data/assets.ts` の `AssetEntry[]` に登録したもののみ参照する。
  出版社・発売元由来の図版は一切使わない（FR-024）
- `requiresCredit: true` の素材はクレジット画面に表示する（FR-025）

**違反なし**。Complexity Tracking は空のまま。

## Project Structure

### Documentation (this feature)

```text
specs/001-jev-cosmic-horror-trpg/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── http-api.md
│   └── jev-questions.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks で作成。本コマンドでは作らない)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # プレイ画面（ログ・入力欄・ステータス・エンディング）
│   ├── credits/page.tsx         # 素材クレジット（assets.ts から生成。FR-025）
│   ├── globals.css
│   └── api/
│       ├── new-game/route.ts    # 生成 + 解ける保証 + 初期封緘
│       └── turn/route.ts        # 検証 → judge() 1回 → resolveTurn → 再封緘
├── lib/
│   ├── game/
│   │   ├── types.ts             # 全型定義（data-model.md）
│   │   ├── tuning.ts            # 成功率の係数・しきい値・HP/正気度の減少量（暫定値の集約点）
│   │   ├── generate.ts          # 探索者・怪異・クリア条件・マップの生成と解ける保証
│   │   ├── resolve.ts           # 成功率算出 → d100 → 状態更新（純関数、rng 注入）
│   │   ├── ending.ts            # 終了判定（clear > death > madness > timeout）
│   │   ├── narrate.ts           # テンプレート選択とプレースホルダー展開
│   │   └── visible.ts           # GameState → VisibleState の投影（秘密を落とす）
│   ├── jev/
│   │   ├── questions.ts         # 7問の定義（contracts/jev-questions.md）
│   │   ├── client.ts            # judge(): evaluate 1回 + 正規化 + フォールバック
│   │   └── __eval__/
│   │       ├── cases.ja.json    # 日本語検証セット 30件
│   │       └── run.ts           # just eval-jev の実体（CI 対象外）
│   ├── seal.ts                  # AES-256-GCM の seal/unseal（node:crypto のみ）
│   └── store.ts                 # Zustand + localStorage 永続化
└── data/
    ├── assets.ts                 # AssetEntry[]（素材の出典・ライセンス。data-model.md）
    └── templates/
        ├── scenes.ts            # 場面描写
        ├── outcomes.ts          # (sceneKey, actionType, outcome) → 文字列配列
        ├── clues.ts             # 手がかり文
        ├── hallucinations.ts    # 正気度低下時の幻覚描写
        ├── meta.ts              # メタ入力専用の描写
        └── endings.ts           # 4つのエンディング文
```

テストは実装ファイルと同じ階層に `*.test.ts` として置く（`resolve.test.ts` など）。
別ディレクトリに切らないのは、テスト対象が単一パッケージ内の純関数に限られるため。

**Structure Decision**: Next.js の単一プロジェクト構成を採る。フロントとバックエンドを
分離しないのは、サーバー側の責務が Route Handler 2 本（生成とターン処理）だけで、
`src/lib/game/` の純関数を両者が直接 import できるほうが型の往復が減るため。
Constitution V の「抽象化は 2 つ目の実装が現れてから」に従い、パッケージ分割は行わない。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Constitution Check に違反なし。記載事項なし。
