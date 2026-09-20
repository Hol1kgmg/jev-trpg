# Data Model: Jev判定型コズミックホラーTRPG（MVP）

**Branch**: `001-jev-cosmic-horror-trpg` | **Date**: 2026-09-20

型はすべて `web/src/lib/game/types.ts` に置く。永続化先は localStorage のみで、
DB スキーマもマイグレーションも存在しない。

---

## 信頼境界

| 区分 | 内容 | 置き場所 |
|---|---|---|
| **秘密** | 怪異の正体・目的・弱点・出現条件、クリア条件、未入手の手がかり本文、探索者の秘密 | 封緘状態（AES-256-GCM）の中だけ。サーバーでのみ開封 |
| **可視** | HP、正気度、ターン数、入手済み手がかり、ログ、探索者の職業・技能・所持品、怪異の外見・異名、現在の様子の描写 | クライアントが平文で保持・描画 |

`SealedState` は不透明な文字列であり、クライアントはその中身を解釈しない。
待機画面で見えるものと、セッション中に見えるものの範囲は同じ（FR-027）。

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
`Direction` と 1 対 1 ではない（例: 「働きかける」でも `occult` を使う入力と `persuade` を
使う入力の両方がありうる）ため、方向性が決まっていても技能は Jev に尋ねる。

**可視/秘密**: `secret` 以外はすべて可視。`secret` は封緘側に置き、エンディングで開示する。

### Entity（怪異）

| フィールド | 型 | 制約 |
|---|---|---|
| `epithet` | `string` | 異名。**可視**（待機画面と描写テンプレートの差し込みに使う） |
| `appearance` | `string` | 外見。**可視**（待機画面で提示する。FR-026） |
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

**全フィールドが秘密**。FR-003 / FR-027 によりクライアントへ一切送らない。

### Clue（手がかり）

| フィールド | 型 | 制約 |
|---|---|---|
| `id` | `string` | 一意 |
| `text` | `string` | 入手時に開示される本文 |
| `hints` | `('nature' \| 'purpose' \| 'weakness')[]` | 何を示唆するか |

生成時に 5〜7 個。すべて観察行動の成功で入手可能で、場所への配置という概念はない
（FR-004）。未入手の `Clue` は秘密、入手済みは可視。

### Direction（行動の方向性）

プレイヤーが各ターンに 4 択から選ぶ固定の宣言（FR-006）。行動種別そのものであり、
Jev の推定対象ではない（FR-030）。

```ts
type Direction = 'observe' | 'attack' | 'engage' | 'withdraw';
```

| 値 | 画面表示 | 典型的な技能 |
|---|---|---|
| `observe` | 観察する | `investigate` / `occult` |
| `attack` | 攻撃する | `combat` |
| `engage` | 働きかける | `persuade` / `occult` |
| `withdraw` | 退く | `escape` / `stealth` |

手がかりを入手できるのは `observe` の成功時のみ。

### EntityStage（怪異の状態）

描写テンプレートのキーになる段階。**`GameState` には保存せず、`turn` から導出する**
（保存すると `turn` と二重管理になる）。境界値は `tuning.ts` に置く。

```ts
type EntityStage = 'appearance' | 'agitation' | 'frenzy';
```

### GameState（封緘される全体状態）

| フィールド | 型 |
|---|---|
| `version` | `number`（スキーマ版。不一致なら開封を失敗扱いにする） |
| `investigator` | `Investigator` |
| `entity` | `Entity` |
| `clearCondition` | `ClearCondition` |
| `clues` | `Record<string, Clue>` |
| `turn` | `number`（1〜8） |
| `acquiredClueIds` | `string[]` |
| `log` | `LogEntry[]` |
| `ending` | `Ending \| null` |

待機画面かセッション中かを表す `phase` は**封緘状態に含めない**。両者で開示される情報は
同じで、`phase` が守るものが何もないため、クライアント（Zustand + localStorage）が
`'briefing' | 'playing'` を持つだけでよい。

### VisibleState（クライアントが平文で持つ投影）

`GameState` から秘密を落としたもの。待機画面とプレイ画面はこの 1 つの型で描き分ける。

```ts
type VisibleState = {
  occupation: string;
  skills: Record<SkillId, number>;
  items: string[];
  hp: number;
  sanity: number;
  turn: number;
  maxTurn: 8;
  entityEpithet: string;
  entityAppearance: string;
  scene: string;              // 怪異の現在の様子（テンプレート展開済み）
  acquiredClues: { id: string; text: string }[];
  log: LogEntry[];
  ending: Ending | null;
};
```

新規生成直後は `log` が空、`turn` は 1、`scene` は対峙の最初の様子。待機画面はこの同じ
`VisibleState` から、探索者の情報と `entityEpithet` / `entityAppearance` だけを描く。

### LogEntry（ログ 1 件）

```ts
type LogEntry = {
  turn: number;
  direction: Direction;       // プレイヤーが選んだ方向性
  detail: string;             // 添えられた詳細（空文字もありうる）
  outcome: Outcome;
  narration: string;          // テンプレート展開済み
  delta: { hp: number; sanity: number; clueId: string | null };
};
```

### Judgment（Jev の解釈結果）

Jev の生応答をコード側で正規化した値。**これ自体はゲーム状態を変えない**（Constitution I）。
行動種別はプレイヤーの選択で確定するため、この型には含まれない。

```ts
type Judgment = {
  skill: SkillId;             // choice
  plausibility: number;       // score 0..4（小数。使用時に丸める）
  horrorExposure: number;     // score 0..3（小数）
  exploitsWeakness: boolean;  // probability >= 0.7
  meetsClear: boolean;        // probability >= 0.7
  metaCheat: boolean;         // probability >= 0.6
  confidence: number;         // skill の confidence 0..1（欠損時は 0）
  source: 'jev' | 'fallback'; // フォールバック経路で作られた値かどうか
};
```

詳細が空のまま送信された場合も Jev は 1 回呼ぶ（方向性だけの汎用行動として解釈させる）。

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

キー `(EntityStage, Direction, Outcome)` に対し文字列の配列を持ち、乱数で 1 つ選ぶ。
プレースホルダーは `{item}` / `{epithet}` / `{clue}`。
別系統として、怪異の様子の描写・手がかり文・正気度低下時の幻覚描写・エンディング文・
メタ入力用の描写を同じ形式で持つ。`web/src/data/templates/` 配下。

---

## 状態遷移

### セッション開始

ストアの `phase` を `'briefing'` から `'playing'` に変えるだけで、サーバーへの通信は
発生しない。逆向きの遷移は用意しない（FR-028）。待機画面では判定も Jev 呼び出しも行わない。

### ターン処理（`resolveTurn`）

```text
入力: GameState, direction(Direction), detail(string), Judgment, rng
1. ending != null なら何もせず返す（FR-020）
2. metaCheat        → outcome = 'meta'
   confidence < 0.5 → outcome = 'ambiguous'
   それ以外          → rate を算出して d100（R-006）
3. 状態更新
   sanity -= sanityLoss(outcome, horrorExposure)
   hp     -= hpLoss(outcome, direction)
   outcome が成功系 かつ direction = 'observe' かつ
     未入手の手がかりが残っている → 1 つ入手する
   turn += 1
4. 終了判定（下記）
5. 描写テンプレートを選択して log に追加
出力: GameState
```

`sanityLoss` / `hpLoss` の係数は `web/src/lib/game/tuning.ts` に集約する（暫定値）。

### 終了判定（`checkEnding`）

判定順は固定する。

```text
1. meetsClear かつ requiredClueIds ⊆ acquiredClueIds かつ outcome が成功系 → 'clear'
2. hp <= 0                                                                → 'death'
3. sanity <= 0                                                            → 'madness'
4. turn > 8                                                               → 'timeout'
5. それ以外                                                                → null
```

クリアを最優先にすることで、決着の一撃と引き換えに HP が 0 になったケースが
死亡に倒れない。

### 手がかり入手の冪等性（AS 2-2）

未入手の手がかりが尽きた状態で観察に成功しても新規入手は起きない。
描写は「これ以上は読み取れない」系のテンプレートに分岐する。

---

## 検証ルール

| 対象 | ルール | 失敗時 |
|---|---|---|
| 方向性 | `Direction` の 4 値のいずれか | 400 を返しターンを消費しない |
| 詳細入力 | 0〜200 文字（空は正常系。FR-029） | 400 を返しターンを消費しない |
| 封緘状態 | GCM 認証タグが有効、`version` が現行と一致 | 400 を返し、クライアントは新規プレイを提案 |
| 生成結果 | `clearCondition.requiredClueIds` が `clues` の id 全体に含まれる | 破棄して再生成（上限 50 回） |
| 同一ターンの重複送信 | リクエストの `turn` と開封した `GameState.turn` が一致 | 409 を返し状態を更新しない |
| `turn` | 1 以上 8 以下 | 開封時に不正なら破棄 |
| `hp` / `sanity` | 0 以上 10 以下にクランプ | — |

---

## AssetEntry（素材マニフェストの1件）

ゲーム状態とは独立した静的データ。封緘の対象外で、クライアントにもそのまま届く。

```ts
type AssetEntry = {
  path: string;            // public/ からの相対パス。例: 'assets/entity-dweller.webp'
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

`web/src/data/assets.ts` が `AssetEntry[]` を 1 つ export し、画像の参照はこの配列のエントリ経由に
限定する（FR-024）。クレジット画面は `requiresCredit: true` のエントリを列挙する（FR-025）。

### 検証ルール（追加）

| 対象 | ルール | 失敗時 |
|---|---|---|
| 素材マニフェスト | `public/` 配下の画像ファイル集合 == マニフェストの `path` 集合 | テスト失敗（SC-010） |
| 素材マニフェスト | `modified: true` のエントリは `modification: true` であること | テスト失敗（FR-024） |
| 素材マニフェスト | `requiresCredit: true` のエントリは `creditText` が空でないこと | テスト失敗（SC-011） |
| 素材マニフェスト | `path` に重複がないこと | テスト失敗 |
