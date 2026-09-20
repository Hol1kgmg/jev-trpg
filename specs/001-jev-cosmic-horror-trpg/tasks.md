# Tasks: Jev判定型コズミックホラーTRPG（MVP）

**Input**: Design documents from `/specs/001-jev-cosmic-horror-trpg/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: テストタスクを含める。Constitution IV「LLM なしでテストできる」が
生成ロジック・ターン進行・終了判定・解ける保証への Vitest テストを必須としているため、
これらは任意ではなく要件である。

**Organization**: タスクはユーザーストーリー単位でまとめ、各ストーリーを独立に実装・検証できるようにする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（別ファイル、未完了タスクへの依存なし）
- **[Story]**: 対応するユーザーストーリー（US1 / US2 / US3）
- 説明には必ず具体的なファイルパスを含める

## Path Conventions

Next.js 単一プロジェクト（plan.md の Structure Decision）。ソースは `src/`、
テストは実装ファイルと同じ階層に `*.test.ts` として置く。

---

## マイルストーン

### M0: AI と生成を抜いて一巡させる 🚶 歩く骨格

**ゴール**: 探索者・怪異・クリア条件を**固定**し、Jev を**スタブ**に差し替えた状態で、
ターン進行・成否判定・状態更新・描写・終了判定・保存・UI が正常に動くことを確認する。
Jev の判定精度の調整（T046 / T047）と、ランダム生成の解ける保証（T013 / T017）は M0 の対象外。

**なぜこれで足りるか**: `judge()` が Jev 呼び出しの唯一の境界で、`resolveTurn` は
`Judgment` を引数に取る純関数である（research.md R-004 / Constitution I）。
固定の `GameState` と偽の `Judgment` を渡せば、残りの経路はすべて本番と同じコードを通る。
M0 用の仮実装は 2 ファイル（`fixture.ts` / `stub.ts`）で、どちらも M1 以降も残る。

**対象タスク**: Phase 1 全部（T001〜T006）→ Phase 2 全部（T007〜T012）→
T053, T054 → T014, T015（テスト）→ T018〜T021, T024, T025 → T026〜T030 → T055

**除外**: T013, T016, T017, T022, T023, T031〜T038, T039〜T052

**完了条件**:

- `just test` が通る（`resolve.test.ts` / `ending.test.ts` / `turn.e2e.test.ts`）
- `JEV_STUB=1 just dev` でブラウザから 12 ターン遊べ、4 つの終了理由すべてに到達できる
- ネットワークにも API キーにも一切触れずに上記が成立する

### M1: Jev を実接続する

T016, T022, T023, T046, T047。`JEV_STUB` を外して実 API で同じ一巡が動くことを確認し、
精度が SC-005（80%）に届かなければ `questions.ts` の `criteria` 文言を調整する。

### M2: ランダム生成と残りのストーリー

T013, T017（生成と解ける保証）→ US2（T031〜T034）→ US3（T035〜T038）→
Phase 6（T039〜T044）→ Phase 7 の残り。

---

## Phase 1: Setup（共有インフラ）

**Purpose**: プロジェクトの初期化と足回り

- [X] T001 `create-next-app` で App Router + TypeScript のプロジェクトを初期化し、`src/app/layout.tsx`・`src/app/page.tsx`・`src/app/globals.css` を plan.md の構成に合わせる
- [X] T002 [P] `ai` パッケージをマイナー版まで固定してインストールし（`package.json` の依存を `~x.y.z` 形式にする。Constitution の技術制約）、Zod を追加する
- [X] T003 [P] Tailwind CSS を導入し `src/app/globals.css` に読み込む
- [X] T004 [P] Vitest を導入し `vitest.config.ts` を作成する（`src/` 配下の `*.test.ts` を対象、jsdom 不要のノード環境）
- [X] T005 [P] `justfile` に `setup` / `dev` / `test` / `check` / `build` / `eval-jev` のレシピを追加する（quickstart.md が参照する。既存の `skills` / `sync` / `scan` は残す）
- [X] T006 [P] `.env.local.example` に `AI_GATEWAY_API_KEY`・`SEAL_KEY`（32 バイトを base64）・`JEV_STUB`（`1` で Jev をスタブに差し替え。T054）を記載し、`.gitignore` に `.env.local` が含まれることを確認する

---

## Phase 2: Foundational（全ストーリーの前提。ここが終わるまで着手不可）

**Purpose**: すべてのユーザーストーリーが依存する型・定数・封緘機構

**⚠️ CRITICAL**: このフェーズが完了するまでユーザーストーリーの実装は開始できない

- [X] T007 `src/lib/game/types.ts` に data-model.md の全型を定義する: `SkillId`（`'investigate' | 'combat' | 'persuade' | 'escape' | 'occult' | 'stealth'`）、`ActionType`（`'investigate' | 'combat' | 'persuade' | 'escape' | 'ritual' | 'hide' | 'other'`）、`Outcome`（`'critical_success' | 'success' | 'failure' | 'fumble' | 'ambiguous' | 'meta'`）、`Investigator`（`hp` / `sanity` は初期 10・範囲 0〜10、`skills` は各技能 5〜80 で全 `SkillId` を網羅、`items` は 1〜3 個）、`Entity`、`Weakness`、`ClearCondition`（`requiredClueIds` は 1〜3 個）、`Clue`、`Location`、`GameState`（`turn` は 1〜12）、`VisibleState`（`maxTurn: 12`）、`LogEntry`、`Judgment`、`Ending`
- [X] T008 [P] `src/lib/game/tuning.ts` に暫定値を集約する: `plausibilityMod`（`0 → -40, 1 → -20, 2 → 0, 3 → +15, 4 → +30`）、`weaknessBonus: 20`、成功率のクランプ範囲 `5〜95`、ファンブル境界 `96`、確信度しきい値（`ambiguous` は `action_type` の confidence `< 0.5`、`exploitsWeakness` / `meetsClear` は `>= 0.7`、`metaCheat` は `>= 0.6`）、最大ターン `12`、生成の再試行上限 `50`（research.md R-002 / R-006）
- [X] T009 [P] `src/lib/seal.ts` に `node:crypto` のみを使う `seal(state)` / `unseal(sealed)` を AES-256-GCM で実装する。鍵は環境変数 `SEAL_KEY`。開封失敗（認証タグ不一致・`version` 不一致）は例外を投げず `null` を返す（research.md R-003）
- [X] T010 [P] `src/lib/seal.test.ts` に往復テストと改竄検出テストを書く（1 文字書き換えた封緘文字列が `null` を返すこと）
- [X] T011 [P] `src/data/templates/` に空の骨格を作る: `scenes.ts` / `outcomes.ts` / `clues.ts` / `hallucinations.ts` / `meta.ts` / `endings.ts`。`outcomes.ts` は `(sceneKey, actionType, outcome) → string[]` の形、プレースホルダーは `{item}` / `{epithet}` / `{location}` / `{clue}`（data-model.md NarrationTemplate）
- [X] T012 `src/lib/api/schema.ts` に Zod スキーマを定義する: `/api/turn` のリクエスト（`sealed: string`、`turn: number`、`action` は 1〜200 文字かつ空白のみでない）と `/api/new-game` のリクエスト（空オブジェクト）（contracts/http-api.md）

**Checkpoint**: 型・定数・封緘が揃い、ユーザーストーリーの実装を開始できる

---

## Phase 3a: 固定シナリオと Jev スタブ（M0 の足場）

**Purpose**: 生成と Jev を止めた状態で US1 の残りを通すための差し替え点。
どちらも M1 / M2 で捨てずに残る（`fixture.ts` はテストの共通データに、
`stub.ts` は API キーなしの UI 開発とオフライン確認に使い続ける）。

> **ID について**: T053〜T055 は後から追加したタスクで、番号は実行順を表さない。
> 実行順は上の「マイルストーン」節が定める（T012 の直後に着手する）。

- [X] T053 [US1] `src/lib/game/fixture.ts` に固定シナリオを 1 本書き、`GameState` を 1 つ返す `fixedGameState()` を export する。data-model.md の制約を満たすこと（場所 4〜5 箇所、手がかり 5〜7 個、`clearCondition.requiredClueIds` は 1〜3 個ですべてどこかの `Location.clueIds` に配置済み、探索者の `skills` は全 `SkillId` を 5〜80 で網羅、`items` 1〜3 個、`hp` / `sanity` は 10）。M0 では `src/lib/game/generate.ts` はこれをそのまま返す実装にしておく
- [X] T054 [US1] `src/lib/jev/stub.ts` に `judgeStub(state): Judgment` を実装する。`state.action` のキーワードで `actionType` と `skill` を決め（調べる/探す→`investigate`、殴る/撃つ/壊す→`combat`、話す/説得→`persuade`、逃げる/離れる→`escape`、唱える/儀式→`ritual`、隠れる→`hide`、教えて/クリア条件/正体→`metaCheat: true`、該当なし→`other`）、`plausibility` は 2、`horrorExposure` は 1、`confidence` は 0.9、`source` は `'jev'` を返す。`src/lib/jev/client.ts` の `judge()` は環境変数 `JEV_STUB` が `'1'` のときこれを返し、実 API を呼ばない
- [X] T055 [US1] `src/lib/game/turn.e2e.test.ts` に M0 の受け入れテストを書く。`fixedGameState()` と `judgeStub()` と固定 `rng` を使い、ネットワークに触れずに 12 ターンを通す。4 つの終了理由（clear / death / madness / timeout）それぞれに到達するケースを 1 本ずつ置く（SC-007）

**Checkpoint**: 生成と Jev を差し替える口が揃い、Phase 3 の残りに着手できる

---

## Phase 3: User Story 1 - 1プレイを完走する (Priority: P1) 🎯 MVP

**Goal**: 生成 → 行動入力 → Jev 解釈 → コードによる成否判定 → 状態更新 → 結果描写 → 終了判定の一巡が動き、4つの終了理由すべてに到達しうる。

**Independent Test**: ブラウザでゲームを開始し、行動を入力し続けて最後までプレイできること。`just test` で 4 つの終了理由すべてに到達するテストが通ること。

### Tests for User Story 1

> **NOTE**: 実装前に書き、失敗することを確認してから実装に進む

- [ ] T013 [P] [US1] `src/lib/game/generate.test.ts` に 100 シードのテストを書く: 全シードで `clearCondition.requiredClueIds` が全 `Location.clueIds` の和集合に含まれること（SC-003 / Constitution III）、探索者の `skills` が全 `SkillId` を 5〜80 で網羅すること、`items` が 1〜3 個であること
- [X] T014 [P] [US1] `src/lib/game/resolve.test.ts` に `rng` を固定した決定的テストを書く: `plausibility` 0〜4 の各値で成功率が tuning.ts の表どおりに動くこと、`rate` が 5〜95 にクランプされること、`roll <= ceil(rate/5)` で `critical_success`、`roll >= 96` で `fumble`、`confidence < 0.5` でロールせず `ambiguous`、`metaCheat` が真でロールせず `meta` になること（research.md R-006）
- [X] T015 [P] [US1] `src/lib/game/ending.test.ts` に終了判定の優先順位テストを書く: `clear` > `death`(hp<=0) > `madness`(sanity<=0) > `timeout`(turn>12) の順で、クリアと同時に hp が 0 になったケースが `clear` になること（data-model.md 終了判定）
- [ ] T016 [P] [US1] `src/lib/jev/client.test.ts` に `judge()` の正規化テストとフォールバックテストを書く: `ai/test` の `Experimental_EvaluationMockModelV4` で応答を差し替え、contracts/jev-questions.md の写像表どおりに `Judgment` へ変換されること、`providerMetadata` 欠損時に `confidence` が `0` になること、例外・タイムアウト・スキーマ不一致で `source: 'fallback'` かつ `confidence: 0` の `Judgment` が返ること（SC-006）

### Implementation for User Story 1

- [ ] T017 [US1] `src/lib/game/generate.ts` の中身を、T053 の固定シナリオを返す実装からランダム生成に差し替える。探索者・怪異・クリア条件・マップを生成し、生成直後に `clearCondition.requiredClueIds ⊆ 全 Location.clueIds` を集合演算で検証し、失敗なら破棄して再生成（上限 50 回、超過で例外）。場所 4〜5 箇所、手がかり 5〜7 個（research.md R-007）
- [X] T018 [P] [US1] `src/lib/game/narrate.ts` にテンプレート選択とプレースホルダー展開を実装する（`{item}` / `{epithet}` / `{location}` / `{clue}`）。`rng` を引数で受けて決定化できるようにする
- [X] T019 [P] [US1] `src/lib/game/visible.ts` に `GameState → VisibleState` の投影を実装する。怪異の `nature` / `purpose` / `weakness` / `manifestation`、`clearCondition` 全フィールド、未入手 `Clue` の本文、各 `Location.clueIds`、探索者の `secret` を落とす（FR-003 / data-model.md 信頼境界）
- [X] T020 [US1] `src/lib/game/resolve.ts` に `resolveTurn` を純関数で実装する（`rng: () => number` を注入）。`rate = clamp(skill + plausibilityMod + weaknessBonus, 5, 95)` を算出し d100 を振って `Outcome` を決め、HP・正気度・手がかり・ターン数を更新する。`weaknessBonus` は `exploitsWeakness` かつ前提手がかりを所持している場合のみ +20（research.md R-006）
- [X] T021 [US1] `src/lib/game/ending.ts` に `checkEnding` を実装する。判定順は `clear`（`meetsClear` かつ `requiredClueIds ⊆ acquiredClueIds` かつ成功系）→ `death` → `madness` → `timeout` → `null` に固定する
- [ ] T022 [P] [US1] `src/lib/jev/questions.ts` に 7 問を contracts/jev-questions.md のとおりプレーンオブジェクトで定義する（`choice` 2 / `score` 2 / `boolean` 3）。`clearCondition` を受け取って `meets_clear` の `instructions` に埋め込む関数形にする
- [ ] T023 [US1] `src/lib/jev/client.ts` の `judge(state): Promise<Judgment>` に実 API 経路を実装する（`JEV_STUB` が `'1'` でないとき通る側。T054 のスタブ分岐は残す）。`experimental_evaluate({ model: 'typesafe-ai/jev', state, questions, providerOptions: { gateway: { zeroDataRetention: true } } })` を**1 回だけ**呼び、5 秒でタイムアウトする。失敗時は再試行せず contracts/http-api.md のフォールバック `Judgment` を返す（Constitution II）
- [X] T024 [P] [US1] `src/data/templates/scenes.ts` に場所ごとの場面描写、`src/data/templates/outcomes.ts` に `(sceneKey, actionType, outcome)` ごとの結果描写を複数バリエーションで書く。`ambiguous` には「手応えがない」系の文言を用意する
- [X] T025 [P] [US1] `src/data/templates/endings.ts` に 4 つの終了理由（clear / death / madness / timeout）のエンディング文を、`src/data/templates/meta.ts` にメタ入力専用の描写を書く
- [X] T026 [US1] `src/app/api/new-game/route.ts` を実装する。生成 → 解ける保証 → 初期封緘を行い `{ sealed, visible }` を返す。再試行上限超過時は `500 { "error": "generation_failed" }`（contracts/http-api.md）
- [X] T027 [US1] `src/app/api/turn/route.ts` を実装する。Zod 検証 → `unseal` → `judge()` を 1 回 → `resolveTurn` → `checkEnding` → 再封緘の順で処理し、`{ sealed, visible, outcome, narration, delta, degraded }` を返す。エラーは `400 invalid_action` / `400 invalid_state` / `409 turn_mismatch`、決着後の呼び出しは状態を変えず 200 で現在の `visible` を返す。プレイヤーの入力文字列は `state.action` に値として渡すだけで `instructions` へ連結しない（contracts/http-api.md セキュリティ）
- [X] T028 [US1] `src/lib/store.ts` に Zustand ストアを実装する。`sealed`（不透明文字列）と `VisibleState` を保持し、`/api/new-game` と `/api/turn` を呼ぶアクションを持つ。同一ターンの二重送信を抑止する送信中フラグを置く
- [X] T029 [US1] `src/app/page.tsx` にプレイ画面を実装する。探索者の職業・技能・所持品、現在地の場面描写、行動入力欄、残りターン数・HP・正気度、ログを常時表示する（FR-017 / AS 1-1）
- [X] T030 [US1] `src/app/page.tsx` にエンディング表示を追加する。`visible.ending` が `null` でなければ理由に応じたエンディング文と秘密の開示（`reveal`）を表示し、行動入力欄を無効化する（FR-020 / AS 1-5）

**Checkpoint**: 1 プレイを通しで遊べる。MVP としてデプロイ可能

---

## Phase 4: User Story 2 - 手がかりを集めて怪異の正体に迫る (Priority: P2)

**Goal**: 調査行動で手がかりが増え、重複入手せず、入手済み一覧を参照できる。

**Independent Test**: 複数の生成シードでプレイし、調査行動で手がかりが増えること、同じ場所の再調査で重複しないこと。

### Tests for User Story 2

- [ ] T031 [P] [US2] `src/lib/game/resolve.test.ts` に手がかり入手の冪等性テストを追加する: `investigatedLocationIds` に含まれる場所を再調査しても `acquiredClueIds` が増えないこと（AS 2-2）

### Implementation for User Story 2

- [ ] T032 [US2] `src/lib/game/resolve.ts` に手がかり入手を実装する。`actionType === 'investigate'` かつ成功系で、現在地が `investigatedLocationIds` に未登録なら未入手の `clueId` を 1 件 `acquiredClueIds` に加え、現在地を `investigatedLocationIds` に登録する
- [ ] T033 [P] [US2] `src/data/templates/clues.ts` に手がかり文と、調べ尽くした場所を再調査したときの描写を書く
- [ ] T034 [US2] `src/app/page.tsx` に入手済み手がかりの一覧表示を追加する（FR-017 / AS 2-1）

**Checkpoint**: US1 と US2 が両方独立に動作する

---

## Phase 5: User Story 3 - 中断して再開する (Priority: P3)

**Goal**: ブラウザを閉じても続きから遊べ、決着後は新規プレイを開始できる。

**Independent Test**: プレイ途中でページを再読み込みし、ターン数・HP・正気度・手がかり・ログが保持されていること。

### Tests for User Story 3

- [ ] T035 [P] [US3] `src/lib/store.test.ts` に復元テストを書く: 保存値が壊れている／`version` が不一致のとき、例外を投げず「新規プレイを提案する」状態に落ちること

### Implementation for User Story 3

- [ ] T036 [US3] `src/lib/store.ts` に localStorage 永続化を追加する。保存するのは封緘文字列と `VisibleState` のみ（data-model.md 信頼境界）
- [ ] T037 [US3] `src/app/page.tsx` に復元処理を実装する。`/api/turn` が `400 invalid_state` を返した場合、または保存値の読み取りに失敗した場合は、エラー画面で止めずに新規プレイを提案する（AS 3-1 / エッジケース）
- [ ] T038 [US3] `src/app/page.tsx` に「新規開始」の導線を追加する。決着後に選ぶと `/api/new-game` を呼び、前回の保存値を破棄して新しい探索者・怪異・クリア条件で始める（AS 3-2）

**Checkpoint**: 3 つのユーザーストーリーがすべて独立に動作する

---

## Phase 6: 権利・コンプライアンス（横断）

**Purpose**: spec.md FR-021〜FR-025 / SC-010 / SC-011。素材の出所を機械検証可能にし、
独自作品としての立ち位置を実装上の制約として固定する（research.md R-009）

- [ ] T039 `src/lib/game/types.ts` に `AssetEntry` 型を追加する: `path`（`public/` からの相対パス）、`sourceUrl`、`author`、`license`、`licenseUrl`、`requiresCredit`、`creditText`、`commercialUse`、`modification`、`modified`（data-model.md AssetEntry）
- [ ] T040 `src/data/assets.ts` に `AssetEntry[]` を 1 つ export し、使用する画像素材をすべて登録する。第三者のフリー素材・CC ライセンス素材のみとし、TRPG 出版社・発売元が配布する図版類は登録しない（FR-024 / research.md R-009）
- [ ] T041 [P] `src/data/assets.test.ts` に検証テストを書く: `public/` 配下の画像ファイル集合と `assets.ts` の `path` 集合が一致すること（SC-010）、`modified: true` のエントリは `modification: true` であること、`requiresCredit: true` のエントリは `creditText` が空でないこと（SC-011）、`path` に重複がないこと（data-model.md 検証ルール）
- [ ] T042 `src/app/credits/page.tsx` にクレジット画面を実装する。`assets.ts` の `requiresCredit: true` のエントリを、作者名・出典・ライセンス名つきで列挙する（FR-025）
- [ ] T043 `src/app/page.tsx` にクレジット画面への導線を 1 クリックで到達できる位置に置く（FR-025 の「常時到達可能」）
- [ ] T044 `src/data/templates/` 配下と `src/lib/game/tuning.ts` を人が読んで確認する: 既存TRPG作品のルール・技能表・データ表・固有名詞が混入していないこと（FR-022。機械判定できないためレビュー扱い）。あわせて画面全体に「公式」「公認」およびそれに類する表記がなく、収益化の導線が存在しないことを確認する（FR-021 / FR-023）

**Checkpoint**: 素材の登録漏れがテストで落ちる状態になり、quickstart.md 手順 8 が実行できる

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T045 [P] `src/data/templates/hallucinations.ts` に正気度低下時の幻覚描写を書き、`src/lib/game/narrate.ts` が正気度に応じて混ぜるようにする（エッジケース「正気度が低下した状態」）
- [ ] T046 [P] `src/lib/jev/__eval__/cases.ja.json` に日本語の行動入力 30 件と期待する `action_type` / `skill` を用意する
- [ ] T047 `src/lib/jev/__eval__/run.ts` に評価スクリプトを実装し、`just eval-jev` から実 API を叩いて一致率を出力する。Vitest のスイートに含めず CI からも除外する（Constitution IV / SC-005 目標 80%）
- [ ] T048 [P] `src/app/page.tsx` と `src/app/globals.css` を PC・スマートフォン縦画面で読める状態に整える（詳細なレスポンシブ最適化は範囲外）
- [ ] T049 quickstart.md の手順 1〜8 を順に実行して検証する。特に手順 3（`AI_GATEWAY_API_KEY` / `SEAL_KEY` がクライアントバンドルに含まれないことの grep 確認）と手順 6（Jev 不達時に 100% のターンが結果描写まで到達すること）
- [ ] T050 テストプレイを 10 回行い、所要時間の中央値（SC-002: 15〜20 分）、レイテンシ（SC-004: 90% のターンで 3 秒以内）、4 つの終了理由への到達（SC-007）を計測する。ずれていれば `src/lib/game/tuning.ts` の数値だけを調整する
- [ ] T051 Vercel にデプロイし、環境変数 `SEAL_KEY` を設定する（Gateway の認証は `VERCEL_OIDC_TOKEN` の自動注入で済むため設定不要。research.md R-001）
- [ ] T052 `just scan` で gitleaks を実行し、秘匿値がワーキングツリーに残っていないことを確認する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。即着手可
- **Foundational (Phase 2)**: Phase 1 の完了に依存。全ユーザーストーリーをブロックする
- **User Stories (Phase 3〜5)**: Phase 2 の完了に依存
- **権利・コンプライアンス (Phase 6)**: Phase 2 の完了に依存。T043 のみ T029（プレイ画面）に依存
- **Polish (Phase 7)**: 対象となるストーリーの完了に依存

### User Story Dependencies

- **US1 (P1)**: Phase 2 完了後に着手可。他ストーリーへの依存なし
- **US2 (P2)**: Phase 2 完了後に着手可。T032 は `resolve.ts`（T020）を、T034 はプレイ画面（T029）を前提にするため、実務上は US1 の後に回すのが早い
- **US3 (P3)**: Phase 2 完了後に着手可。T036〜T038 は `store.ts`（T028）とプレイ画面（T029）を前提にする

US2 と US3 は同じファイル（`resolve.ts` / `page.tsx`）を触るため、並行させる場合は
担当を分けて衝突を避ける。

### Within Each User Story

- テストを先に書き、失敗することを確認してから実装する
- 型 → 生成 → 純関数（resolve / ending / narrate / visible）→ Jev ラッパー → Route Handler → ストア → UI の順
- ストーリーを完了させてから次の優先度へ進む

### Parallel Opportunities

- Phase 1 の T002〜T006 はすべて並列可
- Phase 2 の T008〜T011 は並列可（T007 の型定義の後）
- US1 のテスト 4 本（T013〜T016）は並列可
- US1 の T018 / T019 / T022 / T024 / T025 は別ファイルのため並列可
- Phase 6 は T039 → T040 → T041 が直列、T042 / T043 は T040 の後に並列可
- Phase 7 の T045 / T046 / T048 は並列可

---

## Parallel Example: User Story 1

```bash
# US1 のテストをまとめて着手（実装前に失敗を確認する）:
Task: "src/lib/game/generate.test.ts に 100 シードの解ける保証テストを書く"
Task: "src/lib/game/resolve.test.ts に rng 固定の成功率・Outcome テストを書く"
Task: "src/lib/game/ending.test.ts に終了判定の優先順位テストを書く"
Task: "src/lib/jev/client.test.ts に judge() の正規化とフォールバックのテストを書く"

# US1 の独立した純関数とデータをまとめて着手:
Task: "src/lib/game/narrate.ts にテンプレート選択とプレースホルダー展開を実装"
Task: "src/lib/game/visible.ts に GameState → VisibleState の投影を実装"
Task: "src/lib/jev/questions.ts に 7 問を定義"
Task: "src/data/templates/scenes.ts と outcomes.ts に描写を書く"
```

---

## Implementation Strategy

### M0 First（AI と生成を抜いた一巡）

1. Phase 1: Setup を完了する
2. Phase 2: Foundational を完了する（全ストーリーをブロックするため最優先）
3. Phase 3a: T053（固定シナリオ）と T054（Jev スタブ）
4. Phase 3 のうち T014, T015 → T018〜T021, T024, T025 → T026〜T030
5. T055（M0 受け入れテスト）
6. **STOP して検証**: `just test` が通り、`JEV_STUB=1 just dev` で 12 ターン遊べ、
   4 つの終了理由すべてに到達できること

M0 では生成が固定・判定がスタブなので、バランス調整とAI精度の話が一切入ってこない。
壊れていたら原因は自分のコードにあると断言できる状態で、ターン進行・状態更新・描写・
保存・UI を確定させる。

### M1 以降

1. M1: T016, T022, T023 で Jev を実接続 → `JEV_STUB` を外して同じ一巡を確認
2. M1: T046（日本語検証セット 30 件）と T047（評価スクリプト）で精度を測り、
   SC-005（80%）に届かなければ `src/lib/jev/questions.ts` の `criteria` 文言を調整する
3. M2: T013, T017 でランダム生成と解ける保証 → US2 → US3 → Phase 6 → Phase 7

### Incremental Delivery

1. Setup + Foundational → 土台が揃う
2. US1 → 単独で検証 → デプロイ／デモ（MVP）
3. US2 → 単独で検証 → デプロイ／デモ
4. US3 → 単独で検証 → デプロイ／デモ
5. Phase 6（権利・コンプライアンス）→ 画像素材を使い始める時点までに完了させる
6. Phase 7（Polish）→ テストプレイの結果で `tuning.ts` を調整

Phase 6 は US の完了を待つ必要がない。**画像素材を 1 枚でもリポジトリに置く前に
T039〜T041 を終えておく**と、登録漏れがその場でテストに落ちる（quickstart.md の
「素材を追加するときの手順」がこの順序を前提にしている）。

### Parallel Team Strategy

1. Setup + Foundational をチームで完了させる
2. Foundational 完了後:
   - 開発者 A: US1（最も重い。Route Handler と UI を含む）
   - 開発者 B: Phase 6（権利・コンプライアンス。US に依存しない）と Phase 7 の T046 / T047
3. US1 完了後に US2 / US3 を分担する（両者とも `resolve.ts` / `page.tsx` を触るため、
   同時並行にする場合は担当ファイルを明確に分ける）

---

## Notes

- [P] = 別ファイル・依存なし
- テストは実装ファイルと同じ階層に置く（`src/lib/game/resolve.test.ts` など）。
  別ディレクトリに切らないのは、対象が単一パッケージ内の純関数に限られるため（plan.md）
- `just test` は API キー未設定・ネットワーク遮断で完走しなければならない（Constitution IV）
- 数値の調整は `src/lib/game/tuning.ts` 1 ファイルだけを触る
- lefthook の Git フックを無効化してコミットしない（Constitution 開発ワークフロー）
- 各タスクまたは論理的なまとまりごとにコミットする
