# Research: Jev判定型コズミックホラーTRPG（MVP）

**Branch**: `001-jev-cosmic-horror-trpg` | **Date**: 2026-09-20

Technical Context に残っていた NEEDS CLARIFICATION を解消する。

---

## R-001: Jev の呼び出し経路と形状（Vercel AI Gateway 経由）

**Decision**: AI SDK (`ai`) の `experimental_evaluate` にモデル ID を文字列
`'typesafe-ai/jev'` で渡し、Route Handler から呼ぶ。依存は `ai` 1 つだけで、
`@ai-sdk/gateway` のプロバイダインスタンスは使わない（モデル ID を文字列で渡すと
AI SDK が自動的に Gateway 経由にルーティングする）。

```ts
import { experimental_evaluate as evaluate } from 'ai';

const result = await evaluate({
  model: 'typesafe-ai/jev',
  state,
  questions,
  providerOptions: { gateway: { zeroDataRetention: true } },
});
```

質問はヘルパ関数ではなくプレーンオブジェクトで宣言する。

| 型 | 宣言 | 回答フィールド | 付随情報 |
|---|---|---|---|
| `choice` | `{ type: 'choice', instructions, criteria: { キー: 説明, ... } }` | `choice: '<キー>'` | `probabilities` |
| `score` | `{ type: 'score', instructions, criteria: [レベル0, レベル1, ...] }` | `score: number`（確率加重平均。小数） | `probabilities` |
| `boolean` | `{ type: 'boolean', instructions, criteria: { true, false } }` | `probability: number`（true の確率 0〜1） | — |

confidence は回答オブジェクトではなく、レスポンス直下の
`providerMetadata.typesafe.confidence`（質問名をキーとする `Record<string, number>`）に入る。

**認証**:

| 環境 | 変数 | 取得方法 |
|---|---|---|
| Vercel 本番・プレビュー | `VERCEL_OIDC_TOKEN` | Vercel が自動注入。設定不要 |
| ローカル開発 | `AI_GATEWAY_API_KEY` | Vercel ダッシュボードで発行し `.env.local` に置く |

**Rationale**: TypeSafe のアカウントを開設できないため、直接アクセス
（`@typesafe-ai/sdk` + `TYPESAFE_API_KEY`）は選べない。Gateway 経由なら既に使っている
Vercel のアカウントと請求だけで Jev に到達でき、本番ではキーの管理自体が不要になる。
モデル・価格（$0.042 / 1M input tokens）は直接アクセスと同一。

**Alternatives considered**:

- 公式 SDK `@typesafe-ai/sdk` の直接アクセス: API が `experimental_` でなく安定している
  利点があるが、TypeSafe のアカウントが必要で今回は開設できない。
- `@ai-sdk/gateway` の `gateway.evaluationModel('typesafe-ai/jev')` を明示的に使う:
  モデル ID の文字列指定で同じ結果になるため、依存を 1 つ増やす分だけ損。
- 生の HTTP 呼び出し: 型が落ちるだけで得がない。

**リスクと対処**: `experimental_evaluate` は名前のとおり実験的 API で、`ai` のマイナー更新で
破壊的変更が入りうる。Constitution の技術制約に従い `ai` はマイナー版まで固定し、
更新は R-005 の評価スクリプトを流して動作確認してから行う。呼び出しは
`src/lib/jev/client.ts` の `judge()` 1 箇所に閉じているので、破壊的変更の影響範囲は
このファイルに限られる。

---

## R-002: 確信度（confidence）の取得と「手応えがない」へのマッピング

**Decision**: `providerMetadata.typesafe.confidence`（質問名 → 0〜1 の `Record`）から
`action_type` の値を取る。これが **0.5 未満**なら、成否判定を行わず結果段階
`ambiguous`（手応えがない）に固定する。`boolean` 型の質問には confidence が付かないため、
真偽の不確かさは `probability` そのもので扱い、`exploits_weakness` / `meets_clear` は
**0.7 以上**を真、`meta_cheat` は **0.6 以上**を真とする（誤検出より取りこぼしを嫌う側に倒す）。

`providerMetadata` は型上 optional なので、欠損時は confidence を `0` として扱う
（= `ambiguous` に落ちる）。安全側に倒れるため、これ自体が追加のフォールバックになる。

```ts
const confidence = result.providerMetadata?.typesafe?.confidence as
  | Record<string, number>
  | undefined;
const actionTypeConfidence = confidence?.action_type ?? 0;
```

**Rationale**: Constitution II が「確信度の低い判定は失敗扱いにせず曖昧な結果にマップ」を
要求している。しきい値は暫定値で、テストプレイと R-005 の検証セットで調整する。

**Alternatives considered**:

- `probabilities` の最大値を確信度の代わりに使う: 選択肢数に依存して基準が動くのでやめた。
- 確信度が低いときに Jev を再呼び出し: Constitution II（1ターン1回）に反する。

---

## R-003: クリア条件を伏せたままの状態保持（FR-003 と FR-016 の同時達成）

**Decision**: ゲーム状態全体を **AES-256-GCM で封緘した不透明な文字列**として
localStorage に保存する。封緘・開封は Node 標準 `node:crypto` のみで行い、鍵は
サーバー側の環境変数 `SEAL_KEY`（32 バイト）。クライアントは封緘文字列に加えて、
描画用の可視状態（HP・正気度・ターン数・入手済み手がかり・ログ）だけを平文で持つ。
各ターンのリクエストで封緘文字列を送り返し、サーバーが開封して処理し、再封緘して返す。

**Rationale**: 1 つの仕組みで 3 つの要求が同時に片付く。

- FR-003（クリア条件・怪異の正体を開示しない）: 暗号化されているので DevTools でも読めない
- FR-016（クライアント state を信頼しない）: GCM の認証タグが改竄を検出する
- 「保存データが壊れている」エッジケース: 開封失敗 = 新規プレイを提案、で一本化できる

サーバー永続化は行わないので Constitution V にも抵触しない。

**Alternatives considered**:

- 平文 JSON を localStorage に置く: 実装は最小だが、クリア条件が丸見えで FR-003 を
  満たさず、改竄検証も別途必要になる。結果として検証コードのほうが封緘より長くなる。
- HMAC 署名のみ（暗号化なし）: 改竄は防げるが秘密が読めてしまう。暗号化と同じ
  API 面積で得られる保証が少ない。
- シード値だけ保存して毎ターン再生成: 生成が決定的である限り成立するが、進行中の
  状態（手がかり・ログ）は別途持つ必要があり、結局二重管理になる。

**ponytail**: 鍵のローテーションで既存セーブは全滅する。MVP では「開封失敗 → 新規プレイ」
で受け入れる。複数鍵の世代管理は、運用で必要になってから入れる。

---

## R-004: LLM なしのテスト戦略

**Decision**: `src/lib/jev/client.ts` に `judge(state): Promise<Judgment>` という 1 関数の
境界を置き、テストでは Vitest の `vi.mock` でこのモジュールごと差し替える。
ゲームロジック（生成・成功率算出・状態更新・終了判定）は `Judgment` の値を引数に取る
純関数として実装し、ネットワークに触れない。

**Rationale**: Constitution IV。モックする対象が 1 関数だけなので、AI SDK 側のモック機構
（`ai/test` の `Experimental_EvaluationMockModelV4`）を持ち込む必要がない。乱数（d100）は
呼び出し側から `rng: () => number` を渡す形にして決定的にテストする。

**Alternatives considered**:

- `ai/test` の `Experimental_EvaluationMockModelV4` を使う: Gateway 構成なら利用可能だが、
  モックの粒度が「AI SDK の応答形状」になるため、テストが `experimental_evaluate` の
  レスポンス構造に依存してしまう。`judge()` を差し替えれば `Judgment` という自前の型だけで
  済み、R-001 の破壊的変更リスクがテストに波及しない。ただし `judge()` 自身の正規化
  （応答 → `Judgment`）のテストにはこのモックが適しているので、そこだけは使う。
- 依存性注入用のインターフェースを切る: 実装が 1 つしかないので Constitution V に反する。

---

## R-005: Jev の日本語精度検証（app-spec.md 開発ステップ 1）

**Decision**: `src/lib/jev/__eval__/cases.ja.json` に日本語の行動入力 30 件と期待値
（`action_type` / `skill`）を置き、`just eval-jev` で実 API を叩いて一致率を出す。
このスクリプトは Vitest のテストスイートには含めず、CI からも除外する。

**Rationale**: Constitution IV が「Jev の判定精度の検証はゲームロジックのテストと分離」を
明示している。SC-005（一致率 80% 以上）の測定手段でもある。

**Alternatives considered**:

- 通常のテストに混ぜる: CI が非決定的かつ遅くなる。Constitution IV に反する。

---

## R-006: 成功率の算出式（コード側・暫定値）

**Decision**:

```text
rate = clamp(skill + plausibilityMod + weaknessBonus, 5, 95)

plausibilityMod: score を四捨五入して 0..4 に丸めた値で引く
  0 → -40, 1 → -20, 2 → 0, 3 → +15, 4 → +30
weaknessBonus: exploits_weakness かつ前提手がかりを所持 → +20、それ以外 → 0

roll = d100(rng)
  roll <= ceil(rate / 5) → critical_success
  roll <= rate           → success
  roll >= 96             → fumble
  それ以外               → failure
```

例外経路: `action_type` の confidence < 0.5 → `ambiguous`（ロールなし）。
`meta_cheat` が真 → ロールなしで `failure` 相当、かつ専用のメタ描写テンプレートを使う。

**Rationale**: Constitution I が「成功率の計算と d100 のロールはコード側の純粋ロジック」を
要求している。式を平坦な加算に保つと、テストプレイでの調整が 1 つの定数表の書き換えで済む。

**Alternatives considered**:

- Jev の `probabilities` をそのまま成功率にする: Constitution I が明確に禁じている。
- 乗算・非線形なカーブ: 調整時に因果が追えなくなる。暫定値の段階では加算で足りる。

**ponytail**: 数値はすべて `src/lib/game/tuning.ts` の 1 ファイルに集約する。テストプレイの
調整はこのファイルだけを触る。

---

## R-007: 「解ける保証」の検証方法

**Decision**: 生成直後に、クリア条件が要求する手がかり ID の集合が、マップ上のいずれかの
場所の `clues` に**すべて含まれること**を集合演算で検証する。満たさなければ破棄して再生成
（上限 50 回、超過したら例外）。テストでは 100 シードを回して全件成功を確認する（SC-003）。

**Rationale**: Constitution III。マップは場所 4〜5 箇所・手がかり 5〜7 個という規模なので、
到達可能性のグラフ探索は不要で、集合の包含判定で十分。

**Alternatives considered**:

- 生成後の検証ではなく、クリア条件から逆算して手がかりを配置する: 検証が不要になり
  より堅いが、生成の自由度が落ちる。まず素朴な生成 + 検証で通し、再生成回数が実測で
  問題になったら逆算に切り替える。

---

## R-008: ターン API の粒度

**Decision**: Route Handler は 2 本だけにする。

- `POST /api/new-game` — 生成 + 解ける保証 + 初期封緘状態を返す
- `POST /api/turn` — 封緘状態 + 行動文字列を受け、Jev を 1 回呼び、結果描写と次の封緘状態を返す

**Rationale**: 開封できるのはサーバーだけなので、生成もターン処理もサーバーに置く以外に
選択肢がない。分割の粒度はこれ以上細かくしても呼び出しが増えるだけ。

**Alternatives considered**:

- 生成をクライアント側で行う: 秘密がクライアントに露出し R-003 の前提が崩れる。
- 単一エンドポイントに `action: 'new' | 'turn'` を持たせる: 分岐が増えるだけで得がない。

---

## R-009: 権利面の立ち位置と素材の扱い

**Decision**: 本作は**独自設定の一次創作**として位置づけ、既存TRPG作品の二次創作物としては
名乗らない。アークライト「TRPG二次創作活動ガイドライン」
（<https://www.arclight.co.jp/trpg-rights/二次創作活動のガイドライン/>、2026.6.30 改訂版を確認）
は**適用対象外**だが、その禁止行為を「越えてはならない線」として spec に固定する（FR-021〜FR-023）。
画像素材は第三者のフリー素材・CC ライセンス素材のみとし、素材マニフェストで管理する（FR-024 / FR-025）。

**Rationale**: ガイドラインが適用されるのは「二次創作管理製品名リスト」掲載の対象著作物を
使った作品に限られる。ルール・固有名詞・世界観をすべて独自にする限り、権利表示の義務も
SPLL の申請も発生しない。それでも制約を spec に書くのは、実装中に「参考にした」が
「転載した」に滑る経路を塞ぐため。特に本作は Web ゲームであり、ガイドラインが最も強く
禁じる形態（ルール・データ・表をウェブに掲載して**対象著作物がなくても遊べる**状態にすること）に
構造的に近い。独自ルールであることをテストとレビューで担保する価値がある。

ガイドラインから写した禁止ラインと、対応する FR:

| ガイドラインの禁止行為 | 本作での扱い | FR |
|---|---|---|
| 対象著作物のルール・データ・表をウェブに掲載し、著作物なしで遊べるようにする | 判定システム・技能・用語はすべて独自定義 | FR-022 |
| ルールブック・公式サイト・公式配布物の内容を引用の範囲を超えて複製 | そもそも参照しない | FR-022 |
| 「公式」「公認」表記、作品ロゴの二次使用、正規品と誤認する装丁 | 使用しない | FR-023 |
| イラスト・マップ・見出し枠など図版類の転用・転載 | 出版社由来の図版を一切使わない。素材は第三者フリー素材のみ | FR-024 |
| 営利目的の二次創作活動（頒布・販売時は SPLL 申請） | 無償公開・収益化機能なし | FR-021 |

**Alternatives considered**:

- **二次創作物として名乗り、神話的存在の固有名詞を使う**: 世界観の土台が既製品になる分、
  シナリオ執筆は楽になる。だが権利表示（タイトル画面への Chaosium / KADOKAWA / アークライトの
  英文著作権表記を含むブロック）が必須になり、「どこまでが独自ルールか」の線引きを
  常に説明できる状態に保つ必要が生じる。MVP の主題は Jev の判定精度であって世界観ではないため、
  制約の少ない独自設定を採る。
- **ルールも既存作品に準拠する**: ガイドラインの明示的な禁止行為に最も近く、
  事前照会なしには選べない。Constitution I（判定はコード）とも噛み合わない。

**素材マニフェストの形**: `src/data/assets.ts` に `AssetEntry[]` を 1 配列で持ち、
画像の参照はこの配列のエントリ経由に限定する。テストで「`public/` 配下の画像ファイル集合 ==
マニフェストのパス集合」を突き合わせる（SC-010）。クレジット画面は
マニフェストから `requiresCredit: true` のエントリを描画する（FR-025 / SC-011）。

**Alternatives considered**（マニフェストの形）:

- **JSON + スキーマ検証**: 型が落ちるので Zod を通すことになる。TypeScript の配列なら
  型チェックがそのまま検証になり、追加の仕組みが要らない。
- **素材ごとに `LICENSE.txt` を隣に置く**: 表示側が読み取れず、クレジット画面を
  別管理する羽目になる。

**ponytail**: ライセンス互換性の自動判定（SPDX 式の解釈）は入れない。エントリは人が書き、
テストが見るのは「登録漏れがないか」だけ。素材が数十件を超えて手作業が破綻してから考える。
