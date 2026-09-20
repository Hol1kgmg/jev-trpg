# Contract: HTTP API（Route Handler）

**Branch**: `001-jev-cosmic-horror-trpg`

エンドポイントは 2 本。どちらも `POST`、`Content-Type: application/json`。
秘密の開封鍵はサーバーにしかないため、生成もターン処理もサーバー側で行う（research.md R-008）。

型の定義は [data-model.md](../data-model.md) を参照する。ここでは重複させない。

---

## `POST /api/new-game`

新しいプレイを生成する。リクエストボディは不要（`{}`）。

**200 Response**

```json
{
  "sealed": "<opaque string>",
  "visible": { "...": "VisibleState" }
}
```

- `sealed`: AES-256-GCM で封緘した `GameState`。クライアントは中身を解釈せず、
  そのまま localStorage に保存して次のリクエストで送り返す
- `visible`: 描画に必要な平文の投影。秘密（クリア条件・怪異の正体・未入手の手がかり）を含まない

**500 Response**: `{ "error": "generation_failed" }`
生成の再試行が上限（50 回）に達した場合。通常は起きない（Constitution III のテストで担保）。

---

## `POST /api/turn`

1 ターンを処理する。Jev の呼び出しはこのハンドラ内で**ちょうど 1 回**（Constitution II）。

**Request**

```json
{
  "sealed": "<opaque string>",
  "turn": 3,
  "action": "机の引き出しを調べる"
}
```

| フィールド | 検証 |
|---|---|
| `sealed` | 開封でき、`version` が現行スキーマ版と一致すること |
| `turn` | 開封した `GameState.turn` と一致すること（重複送信の防止） |
| `action` | 1〜200 文字、空白のみでないこと |

**200 Response**

```json
{
  "sealed": "<opaque string>",
  "visible": { "...": "VisibleState" },
  "outcome": "success",
  "narration": "引き出しの底板が浮いている。その下に…",
  "delta": { "hp": 0, "sanity": -1, "clueId": "clue-03" },
  "degraded": false
}
```

- `outcome`: `Outcome`。`meta`（メタ入力）と `ambiguous`（手応えがない）を含む
- `narration`: テンプレート展開済みの文字列。**LLM が生成した文章ではない**（Constitution I）
- `degraded`: Jev の呼び出しに失敗してフォールバック経路で確定させた場合に `true`。
  UI に出す必要はないが、テストと SC-006 の計測で使う
- `visible.ending` が `null` でなければ決着済み。クライアントは以降の入力を無効化する

**400 Response**

| `error` | 条件 | クライアントの扱い |
|---|---|---|
| `invalid_action` | 入力が空・空白のみ・200 文字超 | ターンを消費せず、入力のやり直しを促す |
| `invalid_state` | 開封失敗、`version` 不一致、`turn` が範囲外 | セーブを破棄して新規プレイを提案する |

**409 Response**: `{ "error": "turn_mismatch" }`
リクエストの `turn` が開封した状態と一致しない（同一ターンの二重送信）。
クライアントは直前のレスポンスを保持したまま何もしない。状態は更新されない。

**決着後のリクエスト**: `GameState.ending` が `null` でない状態で `/api/turn` を呼んだ場合、
状態を変えずに現在の `visible` を 200 で返す（`outcome` は直前の値、`delta` は全 0）。
エラーにはしない。

---

## フォールバック（Constitution II / FR-015 / SC-006）

Jev の呼び出しが例外・タイムアウト（5 秒）・スキーマ不一致のいずれかになった場合、
ハンドラは**再呼び出しをせず**に次の `Judgment` を組み立ててターンを完結させる。

```ts
{
  actionType: 'other',
  skill: 'investigate',
  plausibility: 2,
  horrorExposure: 1,
  exploitsWeakness: false,
  meetsClear: false,
  metaCheat: false,
  confidence: 0,      // → outcome は必ず 'ambiguous' になる
  source: 'fallback',
}
```

`confidence: 0` により結果は `ambiguous`（手応えがない）に落ちる。プレイヤーの操作は
行き止まりにならず、ターンは消費される。レスポンスの `degraded` が `true` になる。

---

## セキュリティ

- `AI_GATEWAY_API_KEY`（ローカル開発）と `SEAL_KEY` はサーバー側の環境変数にのみ置く。
  `NEXT_PUBLIC_` 接頭辞を付けてはならない。Vercel 上では `VERCEL_OIDC_TOKEN` が
  自動注入されるため、Gateway 用のキーを設定する必要はない
- Jev の呼び出しには `providerOptions: { gateway: { zeroDataRetention: true } }` を付け、
  プレイヤーの入力文字列が Gateway 側に保持されないようにする
- プレイヤーの入力文字列は Jev の `state.action` に値として渡すだけで、
  `instructions` や `criteria` に連結してはならない（Constitution の指示注入対策）
- `meta_cheat` が真でも、クリア条件・怪異の正体はレスポンスに含めない。
  メタ入力専用の描写テンプレートに分岐するだけ（FR-013 / SC-008）
