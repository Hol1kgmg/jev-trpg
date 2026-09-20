---
status: 'accepted'
date: 2026-09-20
decision-makers: 'Hol1kgmg'
---

# ゲーム状態を AES-256-GCM で封緘してクライアントに預ける

## Context and Problem Statement

このゲームは、プレイヤーに伏せたまま保持しなければならない情報を持つ。クリア条件の全文、怪異の正体・目的・弱点・出現条件、まだ入手していない手がかりの本文、探索者自身の秘密である。これらが読めてしまうと、推理するというゲームの中身がそのまま消える（FR-003）。

同時に、サーバー側にセッションを持ちたくない。1人用でアカウントがなく、中断と再開はブラウザを閉じて戻ってくるだけで成立してほしい（FR-018）。DB を置けば秘密は隠せるが、そのためだけに永続層と接続情報とライフサイクルが増える。

素朴に「秘密を除いた状態だけクライアントに返す」と、次のターンでサーバーが秘密を復元できない。ステートレスなまま秘密を保持する方法が要る。

さらに、預けた状態はプレイヤーの手元にある以上、書き換えられる前提で扱う必要がある。HP を 10 に戻す、ターンを 1 に戻す、といった改竄を検出できなければならない（FR-016）。

## Decision

`GameState` 全体を `SEAL_KEY`（サーバー側の環境変数、32 バイト）で AES-256-GCM 暗号化し、`iv + authTag + 本体` を base64url にした 1 本の不透明な文字列としてクライアントに返す。クライアントはこれを解釈せず、そのまま localStorage に保存し、次のリクエストで送り返す。

- 秘密を落とした投影（`VisibleState`）は別に作り、描画にはそちらだけを使う
- 開封は `web/src/lib/seal.ts` の `unseal()` に閉じる。認証タグ不一致・スキーマ版不一致・`turn` が範囲外のいずれも、例外ではなく `null` を返す
- 生成もターン処理も、開封鍵を持つサーバー側で行う

**Non-goals**

- 鍵のローテーションを実装しない。鍵を変えれば既存の保存値が開封できなくなるが、それは「壊れたセーブ」と同じ経路で新規プレイに落ちる
- 封緘文字列の圧縮をしない。1プレイ 8 ターンで、手がかりも高々 7 個なので、サイズが問題になる規模ではない

## Consequences

- Good, because 1つの仕組みで FR-003（秘密の非開示）・FR-016（改竄検証）・壊れたセーブの検出が同時に片付く
- Good, because 永続層が存在しない。依存は `node:crypto` だけで、デプロイ先の選択肢を狭めない
- Good, because 中断と再開が localStorage への文字列の出し入れだけになる（保存対象は封緘文字列・`VisibleState`・`phase` の 3 つだけ）
- Bad, because `SEAL_KEY` を失うと、稼働中の全プレイヤーのセーブが一斉に開封不能になる
- Bad, because 秘密の全量が毎リクエスト往復する。ターンあたりの転送量は状態のサイズに比例する
- Bad, because `VisibleState` の作り方を間違えると秘密がそのまま漏れる。防衛線が `toVisible()` 1 箇所に集中するため、ここのテスト（`visible.test.ts`）が実質的な要になる

## Implementation Plan

- **Affected paths**: `web/src/lib/seal.ts`、`web/src/lib/game/visible.ts`、`web/src/app/api/*/route.ts`、`web/src/lib/store.ts`
- **Dependencies**: `SEAL_KEY`（base64 で 32 バイト。`openssl rand -base64 32`）
- **Patterns to follow**:
  - 暗号処理は `seal.ts` の外に書かない
  - 型を変えたら `STATE_VERSION` を上げる。既存セーブは開封に失敗し、新規プレイの提案に落ちる
  - クライアントに渡す値は `VisibleState` を経由させる。`GameState` を直接 `Response.json` に渡さない
- **Patterns to avoid**:
  - `SEAL_KEY` に `NEXT_PUBLIC_` を付ける
  - 開封失敗で例外を投げる（壊れたセーブは正常系の一部）

### Verification

- [x] 改竄した封緘文字列が `400 invalid_state` になる（`turn/route.test.ts`）
- [x] `toVisible()` が怪異の秘密・クリア条件・未入手の手がかり・探索者の秘密を含めない（`visible.test.ts`）
- [ ] `AI_GATEWAY_API_KEY` と `SEAL_KEY` がクライアントバンドルに含まれない（quickstart.md 手順 3）

## Alternatives Considered

- **サーバー側にセッションストアを置く**: 秘密は確実に隠れるが、1人用・アカウントなしのゲームに永続層とその運用が付いてくる。得ているものに対して重い
- **秘密だけをサーバーに残し、可視部分をクライアントに持たせる**: 結局サーバー側に状態が残るので、上と同じ話になる
- **署名だけ付けて平文で渡す（HMAC）**: 改竄は検出できるが、秘密が読めてしまうので FR-003 を満たさない
- **クライアント側で生成する**: 秘密が最初からクライアントにあるため、前提が成立しない

## More Information

- 根拠: `specs/001-jev-cosmic-horror-trpg/research.md` R-003 / R-008
- 再検討条件: 複数端末での再開やリプレイ共有を入れるなら、その時点でサーバー側の永続層を検討する
