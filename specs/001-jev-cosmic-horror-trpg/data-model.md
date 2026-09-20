# Data Model: Jev判定型コズミックホラーTRPG（MVP）

**Branch**: `001-jev-cosmic-horror-trpg` | **Date**: 2026-09-20

型はすべて `src/lib/game/types.ts` に置く。永続化先は localStorage のみで、
DB スキーマもマイグレーションも存在しない。

---

## 信頼境界

| 区分 | 内容 | 置き場所 |
|---|---|---|
| **秘密** | 怪異の正体・目的・弱点、クリア条件、未入手の手がかり本文、各場所の手がかり配置 | 封緘状態（AES-256-GCM）の中だけ。サーバーでのみ開封 |
| **可視** | HP、正気度、ターン数、入手済み手がかり、ログ、探索者の職業・技能・所持品、現在地の場面描写 | クライアントが平文で保持・描画 |

`SealedState` は不透明な文字列であり、クライアントはその中身を解釈しない。

---

## エンティティ

### Investigator（探索者）

| フィールド | 型 | 制約 |
|---|---|---|
| `occupation` | `string` | 生成テーブルから選択 |
| `skills` | `Record<SkillId, number>` | 各技能 5〜80。全 `SkillId` を網羅する |
| `items` | `string[]` | 1〜3 個 |
| `secret` | `string` | 生成テーブルから選択。演出用で判定には使わない |
| `hp` | `number` | 初期 10、範囲 0〜10 |
| `sanity` | `number` | 初期 10、範囲 0〜10 |

`SkillId` = `'investigate' | 'combat' | 'persuade' | 'escape' | 'occult' | 'stealth'`。
`ActionType` と 1 対 1 ではない（例: 儀式行動でも `persuade` を使う入力がありうる）ため、
Jev には両方を独立に尋ねる。

**可視/秘密**: `secret` 以外はすべて可視。`secret` は封緘側に置き、エンディングで開示する。

### Entity（怪異）

| フィールド | 型 | 制約 |
|---|---|---|
| `epithet` | `string` | 異名。**可視**（描写テンプレートの差し込みに使う） |
| `nature` | `string` | 正体。**秘密** |
| `purpose` | `string` | 目的。**秘密** |
| `weakness` | `Weakness` | 弱点。**秘密** |
| `manifestation` | `string` | 出現条件。**秘密** |

`Weakness` = `{ id: string; label: string; requiredClueIds: string[] }`。

### ClearCondition（クリア条件）

| フィールド | 型 | 制約 |
|---|---|---|
| `id` | `string` | |
| `description` | `string` | Jev の `meets_clear` の instructions に埋め込む |
| `requiredClueIds` | `string[]` | 1〜3 個。すべて入手済みでなければ成立しない |
| `locationId` | `LocationId \| null` | 特定の場所でのみ成立する場合に指定 |

**全フィールドが秘密**。FR-003 によりクライアントへ一切送らない。

### Clue（手がかり）

| フィールド | 型 | 制約 |
|---|---|---|
| `id` | `string` | 一意 |
| `text` | `string` | 入手時に開示される本文 |
| `hints` | `('nature' \| 'purpose' \| 'weakness')[]` | 何を示唆するか |

生成時に 5〜7 個。未入手の `Clue` は秘密、入手済みは可視。

### Location（場所）

| フィールド | 型 | 制約 |
|---|---|---|
| `id` | `LocationId` | |
| `name` | `string` | **可視** |
| `sceneKey` | `string` | 場面描写テンプレートのキー。**可視** |
| `clueIds` | `string[]` | 配置された手がかり。**秘密** |

1 シナリオあたり 4〜5 箇所。

### GameState（封緘される全体状態）

| フィールド | 型 |
|---|---|
| `version` | `number`（スキーマ版。不一致なら開封を失敗扱いにする） |
| `investigator` | `Investigator` |
| `entity` | `Entity` |
| `clearCondition` | `ClearCondition` |
| `locations` | `Location[]` |
| `clues` | `Record<string, Clue>` |
| `currentLocationId` | `LocationId` |
| `turn` | `number`（1〜12） |
| `acquiredClueIds` | `string[]` |
| `investigatedLocationIds` | `LocationId[]`（再調査での重複入手を防ぐ / FR-022 相当） |
| `log` | `LogEntry[]` |
| `ending` | `Ending \| null` |

### VisibleState（クライアントが平文で持つ投影）

`GameState` から秘密を落としたもの。

```ts
type VisibleState = {
  occupation: string;
  skills: Record<SkillId, number>;
  items: string[];
  hp: number;
  sanity: number;
  turn: number;
  maxTurn: 12;
  locationName: string;
  scene: string;              // 場面描写（テンプレート展開済み）
  entityEpithet: string;
  acquiredClues: { id: string; text: string }[];
  log: LogEntry[];
  ending: Ending | null;
};
```

### LogEntry（ログ 1 件）

```ts
type LogEntry = {
  turn: number;
  action: string;             // プレイヤーの入力（そのまま）
  outcome: Outcome;
  narration: string;          // テンプレート展開済み
  delta: { hp: number; sanity: number; clueId: string | null };
};
```

### Judgment（Jev の解釈結果）

Jev の生応答をコード側で正規化した値。**これ自体はゲーム状態を変えない**（Constitution I）。

```ts
type Judgment = {
  actionType: ActionType;     // choice
  skill: SkillId;             // choice
  plausibility: number;       // score 0..4（小数。使用時に丸める）
  horrorExposure: number;     // score 0..3（小数）
  exploitsWeakness: boolean;  // probability >= 0.7
  meetsClear: boolean;        // probability >= 0.7
  metaCheat: boolean;         // probability >= 0.6
  confidence: number;         // action_type の confidence 0..1（欠損時は 0）
  source: 'jev' | 'fallback'; // フォールバック経路で作られた値かどうか
};
```

`ActionType` = `'investigate' | 'combat' | 'persuade' | 'escape' | 'ritual' | 'hide' | 'other'`。

### Outcome（判定結果の段階）

```ts
type Outcome =
  | 'critical_success'
  | 'success'
  | 'failure'
  | 'fumble'
  | 'ambiguous'   // confidence < 0.5、またはフォールバック
  | 'meta';       // meta_cheat。ゲーム内の出来事として処理する
```

### Ending

```ts
type Ending = {
  reason: 'clear' | 'death' | 'madness' | 'timeout';
  text: string;               // テンプレート展開済み
  reveal: { nature: string; purpose: string; weakness: string; secret: string };
};
```

エンディング到達時にのみ秘密を開示する。以降の行動入力は受け付けない（FR-020）。

### NarrationTemplate（描写テンプレート）

キー `(sceneKey, actionType, outcome)` に対し文字列の配列を持ち、乱数で 1 つ選ぶ。
プレースホルダーは `{item}` / `{epithet}` / `{location}` / `{clue}`。
別系統として、場面描写・手がかり文・正気度低下時の幻覚描写・エンディング文・
メタ入力用の描写を同じ形式で持つ。`src/data/templates/` 配下。

---

## 状態遷移

### ターン処理（`resolveTurn`）

```text
入力: GameState, action(string), Judgment, rng
1. ending != null なら何もせず返す（FR-020）
2. metaCheat        → outcome = 'meta'
   confidence < 0.5 → outcome = 'ambiguous'
   それ以外          → rate を算出して d100（R-006）
3. 状態更新
   sanity -= sanityLoss(outcome, horrorExposure)
   hp     -= hpLoss(outcome, actionType)
   outcome が成功系 かつ actionType = 'investigate' かつ
     現在地が未調査 → 未入手の手がかりを 1 つ入手し、現在地を調査済みに加える
   turn += 1
4. 終了判定（下記）
5. 描写テンプレートを選択して log に追加
出力: GameState
```

`sanityLoss` / `hpLoss` の係数は `src/lib/game/tuning.ts` に集約する（暫定値）。

### 終了判定（`checkEnding`）

判定順は固定する。

```text
1. meetsClear かつ requiredClueIds ⊆ acquiredClueIds かつ outcome が成功系 → 'clear'
2. hp <= 0                                                                → 'death'
3. sanity <= 0                                                            → 'madness'
4. turn > 12                                                              → 'timeout'
5. それ以外                                                                → null
```

クリアを最優先にすることで、決着の一撃と引き換えに HP が 0 になったケースが
死亡に倒れない。

### 手がかり入手の冪等性（FR/AS 2-2）

同じ場所を再度調査しても `investigatedLocationIds` に含まれていれば新規入手しない。
描写は「すでに調べ尽くした」系のテンプレートに分岐する。

---

## 検証ルール

| 対象 | ルール | 失敗時 |
|---|---|---|
| 行動入力 | 1〜200 文字、空白のみでない | 400 を返しターンを消費しない（FR: 入力エッジケース） |
| 封緘状態 | GCM 認証タグが有効、`version` が現行と一致 | 400 を返し、クライアントは新規プレイを提案 |
| 生成結果 | `clearCondition.requiredClueIds` ⊆ 全 `Location.clueIds` の和 | 破棄して再生成（上限 50 回） |
| 同一ターンの重複送信 | リクエストの `turn` と開封した `GameState.turn` が一致 | 409 を返し状態を更新しない |
| `turn` | 1 以上 12 以下 | 開封時に不正なら破棄 |
| `hp` / `sanity` | 0 以上 10 以下にクランプ | — |

---

## AssetEntry（素材マニフェストの1件）

ゲーム状態とは独立した静的データ。封緘の対象外で、クライアントにもそのまま届く。

```ts
type AssetEntry = {
  path: string;            // public/ からの相対パス。例: 'assets/scene-corridor.webp'
  sourceUrl: string;       // 入手元のページURL
  author: string;          // 作者名（不明な場合も空文字にせず出典名を入れる）
  license: string;         // 'CC0-1.0' / 'CC BY 4.0' / 'いらすとや利用規約' など
  licenseUrl: string;      // ライセンス条文のURL
  requiresCredit: boolean; // クレジット表示が必須か
  creditText: string;      // 表示するクレジット文（requiresCredit が false でも記録する）
  commercialUse: boolean;  // 商用利用可否
  modification: boolean;   // 改変可否
  modified: boolean;       // 本作で実際に加工したか
};
```

`src/data/assets.ts` が `AssetEntry[]` を 1 つ export し、画像の参照はこの配列のエントリ経由に
限定する（FR-024）。クレジット画面は `requiresCredit: true` のエントリを列挙する（FR-025）。

### 検証ルール（追加）

| 対象 | ルール | 失敗時 |
|---|---|---|
| 素材マニフェスト | `public/` 配下の画像ファイル集合 == マニフェストの `path` 集合 | テスト失敗（SC-010） |
| 素材マニフェスト | `modified: true` のエントリは `modification: true` であること | テスト失敗（FR-024） |
| 素材マニフェスト | `requiresCredit: true` のエントリは `creditText` が空でないこと | テスト失敗（SC-011） |
| 素材マニフェスト | `path` に重複がないこと | テスト失敗 |
