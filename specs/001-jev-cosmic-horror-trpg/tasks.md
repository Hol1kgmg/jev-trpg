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

Next.js 単一プロジェクト（plan.md の Structure Decision）。アプリは `web/` 配下にあり、
ソースは `web/src/`、テストは実装ファイルと同じ階層に `*.test.ts` として置く。
パッケージマネージャは pnpm（`just` のレシピが `pnpm -C web` を呼ぶ）。

---

## この版について（spec 改訂の反映）

spec.md の改訂で次が変わった。旧版のタスク T001〜T055 は本ファイルで置き換える。

| 変更 | 影響 |
|---|---|
| 探索・場所・マップを廃止し、単一の対峙で完結 | `Location` 型と関連ロジックを削除 |
| 手がかりは観察行動の成功で入手 | 手がかり入手の条件が場所ベースから `Direction` ベースに |
| 最大ターン 12 → 8 | `tuning.ts` / 型 / テスト |
| 待機画面を追加 | UI とストアに `phase`（サーバー側には持たない） |
| 行動は 4 択 + 任意の詳細入力 | `ActionType` を `Direction` に置換、Jev は 7 問 → 6 問 |
| アプリを `web/` へ移動し pnpm 化 | 済み（パスの読み替えのみ） |

既存実装のうち**改訂の影響を受けないもの**は完了済みとして扱う
（`seal.ts` / `seal.test.ts` / `layout.tsx` / `endings.ts` / `meta.ts` / `hallucinations.ts` /
`new-game/route.ts` の骨格）。

---

## マイルストーン

### M0': 改訂を既存実装に反映して一巡させる 🚶 歩く骨格

**ゴール**: 固定シナリオ（`fixture.ts`）と Jev スタブ（`stub.ts`）のまま、
待機画面 → 4 択 + 詳細入力 → 8 ターンの一巡がブラウザで動く。

**対象**: Phase 1 全部（T001〜T012）

**完了条件**:

- `just check` が通る
- `JEV_STUB=1 just dev` で待機画面から 8 ターン遊べ、4 つの終了理由すべてに到達できる
- ネットワークにも API キーにも一切触れずに上記が成立する

### M1: Jev を実接続する

Phase 2（T013〜T016）と Phase 6 の T029 / T030。`JEV_STUB` を外して実 API で同じ一巡が
動くことを確認し、精度が SC-005（80%）に届かなければ `questions.ts` の `criteria` 文言を調整する。

### M2: ランダム生成と残りのストーリー

Phase 3（T017〜T019）→ US2（T020〜T022）→ US3（T023〜T025）→ Phase 5（T026〜T028）→ Phase 6 の残り。

---

## Phase 1: 改訂の反映（M0'。ここが終わるまで他フェーズに着手しない）

**Purpose**: 旧仕様（探索・場所・12 ターン・自由入力のみ）で書かれた既存実装を、
改訂後の data-model.md に合わせる

- [X] T001 `web/src/lib/game/types.ts` を改訂する: `ActionType` を削除して `Direction`（`'observe' | 'attack' | 'engage' | 'withdraw'`）を追加、`EntityStage`（`'appearance' | 'agitation' | 'frenzy'`）を追加、`Location` 型と `LocationId` を削除、`Entity` に `appearance: string` を追加、`ClearCondition` から `locationId` を削除、`GameState` から `locations` / `currentLocationId` / `investigatedLocationIds` を削除し `turn` を 1〜8 に、`VisibleState` から `locationName` を削除して `entityAppearance` を追加し `maxTurn` を `8` に、`LogEntry` の `action: string` を `direction: Direction` と `detail: string` に分割、`Judgment` から `actionType` を削除（data-model.md エンティティ）
- [X] T002 `web/src/lib/game/tuning.ts` を改訂する: 最大ターンを `12` → `8`、`EntityStage` の境界値を追加（`turn <= 3` → `appearance`、`turn <= 6` → `agitation`、それ以降 → `frenzy`）、`hpLoss` の分岐キーを `ActionType` から `Direction` に張り替える。確信度しきい値のコメントを `action_type` → `skill` に直す
- [X] T003 [P] `web/src/lib/game/fixture.ts` を改訂する: 場所の配列を削除し、怪異に `appearance` を追加、手がかり 5〜7 個は場所に配置せず `clues` に直接持たせる。`clearCondition.requiredClueIds`（1〜3 個）が `clues` の id に含まれることを満たす
- [X] T004 [P] `web/src/lib/jev/stub.ts` を改訂する: `actionType` の推定をやめ、`skill` だけをキーワードから決める（調べる/観察→`investigate`、殴る/撃つ→`combat`、話す/説得→`persuade`、逃げる→`escape`、唱える/儀式→`occult`、隠れる→`stealth`、該当なしは方向性の既定技能）。`plausibility` は 2、`horrorExposure` は 1、`confidence` は 0.9、`source` は `'jev'`。詳細が空文字でも同じ形の `Judgment` を返す
- [X] T005 `web/src/lib/game/resolve.ts` を改訂する: 引数を `(state, direction, detail, judgment, rng)` にし、手がかり入手の条件を「`direction === 'observe'` かつ成功系かつ未入手の手がかりが残っている」に変更する（場所と `investigatedLocationIds` の参照を削除）。`hpLoss` の引数を `direction` に変える（data-model.md ターン処理）
- [X] T006 `web/src/lib/game/ending.ts` を改訂する: `timeout` の判定を `turn > 12` から `turn > 8` に変える（`tuning.ts` の値を参照する形にする）
- [X] T007 [P] `web/src/lib/game/visible.ts` を改訂する: 投影から `locationName` を落とし、`entityAppearance` を加える。落とす秘密は怪異の `nature` / `purpose` / `weakness` / `manifestation`、`clearCondition` 全フィールド、未入手 `Clue` の本文、探索者の `secret`（FR-003 / FR-027）
- [X] T008 [P] `web/src/lib/game/narrate.ts` とテンプレートを改訂する: `web/src/data/templates/scenes.ts` を場所ごとの描写から `EntityStage` ごとの描写に置き換え、`web/src/data/templates/outcomes.ts` のキーを `(sceneKey, actionType, outcome)` から `(EntityStage, Direction, Outcome)` に張り替える。プレースホルダーから `{location}` を削除する（`{item}` / `{epithet}` / `{clue}` は残す）
- [X] T009 `web/src/lib/api/schema.ts` を改訂する: `/api/turn` のリクエストを `{ sealed: string; turn: number; direction: Direction; detail: string }` にする。`detail` は **0〜200 文字（空文字は正常系）**、`direction` は 4 値の列挙（contracts/http-api.md）
- [X] T010 `web/src/app/api/turn/route.ts` を改訂する: 検証 → `unseal` → `judge()` を 1 回 → `resolveTurn(state, direction, detail, judgment, rng)` → `checkEnding` → 再封緘。`detail` は Jev の `state.action.detail` に値として渡すだけで `instructions` へ連結しない（contracts/http-api.md セキュリティ）
- [X] T011 `web/src/lib/store.ts` に `phase`（`'briefing' | 'playing'`）を追加する。初期値は `'briefing'`、`startSession()` で `'playing'` にする一方向の遷移のみ。サーバーへの通信は発生させない（FR-028 / data-model.md セッション開始）
- [X] T012 `web/src/app/page.tsx` を改訂する: `phase === 'briefing'` のとき待機画面（職業・技能・所持品と怪異の `entityEpithet` / `entityAppearance`、開始操作。正体・目的・弱点は出さない）を描く。`'playing'` のとき 4 つの選択肢（観察する／攻撃する／働きかける／退く）と任意の詳細入力欄を描き、詳細が空でも送信できるようにする（FR-026〜FR-029 / AS 1-1〜1-4）

**Checkpoint**: `JEV_STUB=1` で待機画面から 8 ターンの一巡が動く

---

## Phase 2: Jev の実接続（M1）

- [X] T013 [P] [US1] `web/src/lib/jev/questions.ts` に 6 問を contracts/jev-questions.md のとおりプレーンオブジェクトで定義する（`choice` 1 / `score` 2 / `boolean` 3）。`action_type` は**含めない**（プレイヤーの 4 択で確定するため。FR-030）。`clearCondition` を受け取って `meets_clear` の `instructions` に埋め込む関数形にする
- [X] T014 [US1] `web/src/lib/jev/client.ts` の `judge(state): Promise<Judgment>` に実 API 経路を実装する（`JEV_STUB` が `'1'` でないとき通る側。スタブ分岐は残す）。`experimental_evaluate({ model: 'typesafe-ai/jev', state, questions, providerOptions: { gateway: { zeroDataRetention: true } } })` を**1 回だけ**呼び、5 秒でタイムアウトする。`confidence` は `providerMetadata.typesafe.confidence.skill`（欠損時 `0`）。失敗時は再試行せず contracts/http-api.md のフォールバック `Judgment` を返す（Constitution II）
- [X] T015 [P] [US1] `web/src/lib/jev/client.test.ts` に `judge()` の正規化テストとフォールバックテストを書く: `ai/test` の `Experimental_EvaluationMockModelV4` で応答を差し替え、contracts/jev-questions.md の写像表どおりに `Judgment` へ変換されること、`providerMetadata` 欠損時に `confidence` が `0` になること、例外・タイムアウト・スキーマ不一致で `source: 'fallback'` かつ `confidence: 0` の `Judgment` が返ること（SC-006）
- [X] T016 [US1] 既存テストを改訂後の形に更新する: `web/src/lib/game/resolve.test.ts`（`resolveTurn` の新しい引数、`observe` 成功で手がかりが増えること）、`web/src/lib/game/ending.test.ts`（`timeout` が `turn > 8`）、`web/src/lib/game/turn.e2e.test.ts`（8 ターン通し、4 つの終了理由すべてに到達）

**Checkpoint**: `JEV_STUB` を外して実 API で同じ一巡が動く

---

## Phase 3: User Story 1 - ランダム生成（Priority: P1）🎯 MVP の残り

**Goal**: 固定シナリオを本物の生成に差し替え、どのシードでも解けることを保証する。

**Independent Test**: `just test` で 100 シードの生成テストが通ること。

- [X] T017 [P] [US1] `web/src/lib/game/generate.test.ts` に 100 シードのテストを書く: 全シードで `clearCondition.requiredClueIds` が `clues` の id 全体に含まれること（SC-003 / Constitution III）、探索者の `skills` が全 `SkillId` を 5〜80 で網羅すること、`items` が 1〜3 個であること、手がかりが 5〜7 個であること
- [X] T018 [US1] `web/src/lib/game/generate.ts` の中身を、固定シナリオを返す実装からランダム生成に差し替える。探索者（職業・技能・所持品・秘密）・怪異（異名・外見・正体・目的・弱点・出現条件）・クリア条件・手がかり 5〜7 個を生成し、生成直後に `clearCondition.requiredClueIds ⊆ clues の id 全体` を集合演算で検証し、失敗なら破棄して再生成（上限 50 回、超過で例外。research.md R-007）
- [X] T019 [US1] `web/src/app/api/new-game/route.ts` が生成 → 解ける保証 → 初期封緘を行い `{ sealed, visible }` を返すことを確認する。再試行上限超過時は `500 { "error": "generation_failed" }`（contracts/http-api.md）

**Checkpoint**: 毎回違うシナリオで 1 プレイを通しで遊べる。MVP としてデプロイ可能

---

## Phase 4: User Story 2 - 観察を重ねて怪異の弱点を見抜く（Priority: P2）

**Goal**: 観察行動で手がかりが増え、出し尽くした後は重複せず、入手済み一覧を参照できる。

**Independent Test**: 複数の生成シードでプレイし、観察行動で手がかりが増えること、
手がかりを出し尽くした後の観察成功で増えないこと。

- [X] T020 [P] [US2] `web/src/lib/game/resolve.test.ts` に手がかり入手のテストを追加する: `direction === 'observe'` かつ成功系で `acquiredClueIds` が 1 件増えること（AS 2-1）、未入手の手がかりが尽きた状態では増えないこと（AS 2-2）、`observe` 以外の方向性では成功しても増えないこと
- [X] T021 [P] [US2] `web/src/data/templates/clues.ts` に手がかり文と、これ以上読み取れないときの描写を書く
- [X] T022 [US2] `web/src/app/page.tsx` に入手済み手がかりの一覧表示を追加する（FR-017 / AS 2-1）

**Checkpoint**: US1 と US2 が両方独立に動作する

---

## Phase 5: User Story 3 - 中断して再開する（Priority: P3）

**Goal**: ブラウザを閉じても続きから遊べ、待機画面で止めた場合も同じ怪異のまま戻れる。

**Independent Test**: プレイ途中と待機画面のそれぞれでページを再読み込みし、状態が保持されること。

- [ ] T023 [P] [US3] `web/src/lib/store.test.ts` に復元テストを書く: 保存値が壊れている／`version` が不一致のとき例外を投げず「新規プレイを提案する」状態に落ちること、`phase` が `'briefing'` のまま保存・復元されること（AS 3-2）
- [ ] T024 [US3] `web/src/lib/store.ts` に localStorage 永続化を追加する。保存するのは封緘文字列・`VisibleState`・`phase` のみ（data-model.md 信頼境界）
- [ ] T025 [US3] `web/src/app/page.tsx` に復元処理と「新規開始」の導線を実装する。`/api/turn` が `400 invalid_state` を返した場合、または保存値の読み取りに失敗した場合はエラー画面で止めずに新規プレイを提案する。決着後に新規開始を選ぶと `/api/new-game` を呼び、前回の保存値を破棄して待機画面から始める（AS 3-1 / AS 3-3）

**Checkpoint**: 3 つのユーザーストーリーがすべて独立に動作する

---

## Phase 6: 権利・コンプライアンス（横断）

**Purpose**: spec.md FR-021〜FR-025 / SC-010 / SC-011。素材の出所を機械検証可能にし、
独自作品としての立ち位置を実装上の制約として固定する（research.md R-009）

- [ ] T026 `web/src/lib/game/types.ts` に `AssetEntry` 型を追加する: `path`（`public/` からの相対パス）、`sourceUrl`、`author`、`license`、`licenseUrl`、`requiresCredit`、`creditText`、`commercialUse`、`modification`、`modified`（data-model.md AssetEntry）
- [ ] T027 `web/src/data/assets.ts` に `AssetEntry[]` を 1 つ export し、使用する画像素材をすべて登録する。第三者のフリー素材・CC ライセンス素材のみとし、TRPG 出版社・発売元が配布する図版類は登録しない（FR-024 / research.md R-009）
- [ ] T028 [P] `web/src/data/assets.test.ts` に検証テストを書く: `public/` 配下の画像ファイル集合と `assets.ts` の `path` 集合が一致すること（SC-010）、`modified: true` のエントリは `modification: true` であること、`requiresCredit: true` のエントリは `creditText` が空でないこと（SC-011）、`path` に重複がないこと（data-model.md 検証ルール）
- [ ] T029 `web/src/app/credits/page.tsx` にクレジット画面を実装し、`assets.ts` の `requiresCredit: true` のエントリを作者名・出典・ライセンス名つきで列挙する（FR-025）
- [ ] T030 `web/src/app/page.tsx` にクレジット画面への導線を 1 クリックで到達できる位置に置く（FR-025 の「常時到達可能」）
- [ ] T031 `web/src/data/templates/` 配下と `web/src/lib/game/tuning.ts` を人が読んで確認する: 既存TRPG作品のルール・技能表・データ表・固有名詞が混入していないこと（FR-022。機械判定できないためレビュー扱い）。あわせて画面全体に「公式」「公認」およびそれに類する表記がなく、収益化の導線が存在しないことを確認する（FR-021 / FR-023）

**Checkpoint**: 素材の登録漏れがテストで落ちる状態になり、quickstart.md 手順 8 が実行できる

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T032 [P] `web/src/data/templates/hallucinations.ts` に正気度低下時の幻覚描写を書き、`web/src/lib/game/narrate.ts` が正気度に応じて混ぜるようにする（エッジケース「正気度が低下した状態」）
- [ ] T033 [P] `web/src/lib/jev/__eval__/cases.ja.json` に、方向性と詳細入力の組 30 件と期待する `skill` / `plausibility` を用意する。詳細が空のケースを数件含める
- [ ] T034 `web/src/lib/jev/__eval__/run.ts` に評価スクリプトを実装し、`just eval-jev` から実 API を叩いて一致率を出力する。Vitest のスイートに含めず CI からも除外する（Constitution IV / SC-005 目標 80%）
- [ ] T035 [P] `web/src/app/page.tsx` と `web/src/app/globals.css` を PC・スマートフォン縦画面で読める状態に整える（詳細なレスポンシブ最適化は範囲外）
- [ ] T036 quickstart.md の手順 1〜8 を順に実行して検証する。特に手順 3（`AI_GATEWAY_API_KEY` / `SEAL_KEY` がクライアントバンドルに含まれないことの grep 確認）と手順 6（Jev 不達時に 100% のターンが結果描写まで到達すること）
- [ ] T037 テストプレイを 10 回行い、所要時間の中央値（SC-002: 8〜12 分）、最初の行動を送信するまでの時間（SC-001: 30 秒以内）、レイテンシ（SC-004: 90% のターンで 3 秒以内）、4 つの終了理由への到達（SC-007）を計測する。ずれていれば `web/src/lib/game/tuning.ts` の数値だけを調整する
- [ ] T038 Vercel の Project Settings で Root Directory が `web`、Framework Preset が Next.js になっていることを確認し、環境変数 `SEAL_KEY` を設定する（Gateway の認証は `VERCEL_OIDC_TOKEN` の自動注入で済むため設定不要。research.md R-001）
- [ ] T039 `just scan` で gitleaks を実行し、秘匿値がワーキングツリーに残っていないことを確認する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1（改訂の反映）**: 依存なし。**他のすべてをブロックする**
- **Phase 2（Jev 実接続）**: Phase 1 の完了に依存
- **Phase 3〜5（ユーザーストーリー）**: Phase 1 の完了に依存。Phase 2 とは独立に進められる
  （スタブのままでも生成・手がかり・保存の検証はできる）
- **Phase 6（権利）**: Phase 1 の完了に依存。T030 のみ T012（画面）に依存
- **Phase 7（Polish）**: 対象となるフェーズの完了に依存

### Phase 1 の内部順序

`T001（型）→ T002（定数）→ T003 / T004（固定データとスタブ）→ T005 / T006 / T007 / T008（純関数と描写）
→ T009 / T010（API 境界）→ T011 / T012（ストアと UI）`。

型を最初に直すと、残りの作業対象は `just check` の型エラーがそのまま指し示す。

### User Story Dependencies

- **US1 (P1)**: Phase 1 完了後に着手可。他ストーリーへの依存なし
- **US2 (P2)**: Phase 1 完了後に着手可。T020 は `resolve.ts`（T005）を、T022 は画面（T012）を前提にする
- **US3 (P3)**: Phase 1 完了後に着手可。T024 / T025 は `store.ts`（T011）と画面（T012）を前提にする

US2 と US3 は同じ `page.tsx` を触るため、並行させる場合は担当を分けて衝突を避ける。

### Parallel Opportunities

- Phase 1 の T003 / T004 は並列可（T002 の後）。T007 / T008 も別ファイルのため並列可
- Phase 2 の T013 / T015 は並列可
- Phase 4 の T020 / T021 は並列可
- Phase 6 は T026 → T027 → T028 が直列、T029 / T030 は T027 の後に並列可
- Phase 7 の T032 / T033 / T035 は並列可

---

## Parallel Example: Phase 1

```bash
# 型と定数（T001 / T002）を終えたあと、まとめて着手できるもの:
Task: "web/src/lib/game/fixture.ts から場所を削り appearance を足す"
Task: "web/src/lib/jev/stub.ts を skill だけ返す形にする"
Task: "web/src/lib/game/visible.ts の投影を entityAppearance 込みに直す"
Task: "web/src/data/templates/ のキーを (EntityStage, Direction, Outcome) に張り替える"
```

---

## Implementation Strategy

### M0' First（改訂を反映した一巡）

1. Phase 1 を T001 から順に完了する
2. **STOP して検証**: `just check` が通り、`JEV_STUB=1 just dev` で待機画面から 8 ターン
   遊べ、4 つの終了理由すべてに到達できること

生成が固定・判定がスタブなので、バランス調整と AI 精度の話が一切入ってこない。
壊れていたら原因は自分のコードにあると断言できる状態で、改訂を着地させる。

### M1 以降

1. M1: T013〜T016 で Jev を実接続 → `JEV_STUB` を外して同じ一巡を確認
2. M1: T033 / T034 で精度を測り、SC-005（80%）に届かなければ
   `web/src/lib/jev/questions.ts` の `criteria` 文言を調整する
3. M2: Phase 3（ランダム生成）→ US2 → US3 → Phase 6 → Phase 7

### Incremental Delivery

1. Phase 1 → 改訂後の骨格が動く
2. Phase 2 + Phase 3 → 単独で検証 → デプロイ／デモ（MVP）
3. US2 → US3 → それぞれ単独で検証 → デプロイ／デモ
4. Phase 6（権利）→ 画像素材を使い始める時点までに完了させる
5. Phase 7（Polish）→ テストプレイの結果で `tuning.ts` を調整

Phase 6 は US の完了を待つ必要がない。**画像素材を 1 枚でもリポジトリに置く前に
T026〜T028 を終えておく**と、登録漏れがその場でテストに落ちる。

---

## Notes

- [P] = 別ファイル・依存なし
- テストは実装ファイルと同じ階層に置く（`web/src/lib/game/resolve.test.ts` など）。
  別ディレクトリに切らないのは、対象が単一パッケージ内の純関数に限られるため（plan.md）
- `just test` は API キー未設定・ネットワーク遮断で完走しなければならない（Constitution IV）
- 数値の調整は `web/src/lib/game/tuning.ts` 1 ファイルだけを触る
- lefthook の Git フックを無効化してコミットしない（Constitution 開発ワークフロー）
- 各タスクまたは論理的なまとまりごとにコミットする

---

## Phase 8: Convergence

**Purpose**: 現状のコードを spec.md / plan.md / Constitution に突き合わせて残った差分。
既存の未完了タスク（T013〜T039）が扱う範囲は含めない。

- [ ] T040 `web/src/lib/game/visible.test.ts` を追加し、`toVisible` が怪異の `nature` / `purpose` / `weakness` / `manifestation`、`clearCondition` の全フィールド、未入手 `Clue` の本文、探索者の `secret` を投影に含めないことを検証する per FR-003 / FR-027 / SC-008 (missing)
- [ ] T041 `web/src/app/api/turn/route.test.ts` を追加し、Route Handler の異常系を検証する: 200 文字超・不正な `direction` で `400 invalid_action`、改竄された封緘文字列で `400 invalid_state`、`turn` 不一致で `409 turn_mismatch`（いずれも状態を更新しないこと）per FR-016 / Edge「同一ターン内に送信が重複」「詳細入力が極端に長い」 (missing)
- [ ] T042 `adr/` に本機能の設計判断を ADR として記録する: 状態の AES-256-GCM 封緘（research.md R-003）、Jev を Vercel AI Gateway 経由で呼ぶこと（R-001）、描写をテンプレート選択に限ること（Constitution I） per Constitution 開発ワークフロー (missing)
- [ ] T043 `.specify/memory/constitution.md` の原則 V「1プレイ15〜20分」を spec.md SC-002 / plan.md の「8〜12分」に合わせて改定する（Governance の改定手順に従い、バージョンと Sync Impact Report を更新する）per Constitution V vs SC-002 (contradicts)
- [ ] T044 `web/src/lib/game/resolve.ts` がハードコードしている HP・正気度の上限 `10` を `web/src/lib/game/tuning.ts` の定数に移し、`resolve.ts` から参照する per plan.md「tuning.ts = 暫定値の集約点」 (partial)
