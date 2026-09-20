---
status: 'accepted'
date: 2026-09-20
decision-makers: 'Hol1kgmg'
---

# 実行前に事前判定を走らせ、ダイス補正だけを見せる

## Context and Problem Statement

Jev の判定（技能・妥当性・弱点への作用）は成功率にだけ効き、その内訳はプレイヤーに見えなかった。画面に出るのは「調査 65 → 出目 42 成功」の 1 行で、自由入力を変えても何が変わったのか分からない。AI がどこで働いているのかが伝わらず、詳細を書く動機が薄い。

実行前に「この行動にどれだけ補正が入るか」を見せれば、入力と判定の関係が体験として分かる。しかし Jev は原則 II で「1 ターン 1 回」に縛られており、送信前に判定を見せるには呼び出しを先に走らせる必要がある。また、送信前に判定を見せると、入力を変えて何度も試すことで秘密（クリア条件・弱点の前提）を探る手段になる。

## Decision

- 入力が `previewDebounceMs`（3 秒）止まったら自動で `/api/preview` を呼び、Jev を 1 回走らせる
- 返すのは**成功率の内訳（`RateBreakdown`）だけ**。恐怖の負荷、クリア条件の充足、弱点ボーナスが乗らなかった理由は返さない
- 判定結果（`Judgment`）は封緘に入れてクライアントに往復させ、同じ方針・詳細で `/api/turn` に来たときだけ再利用する。実行時に Jev は呼ばない
- 1 ターンの事前判定は `previewLimit`（10 回）まで。達したら入力を固定し、最後の判定で確定する
- 実行後のログにも同じ内訳を残す
- 原則 II は「1 つの行動の判定に 1 回」と読み替え、上限つきの事前判定を認める（Constitution 1.3.0）

**Non-goals**

- クリアへの手応え（`meets_clear` の確率）を段階表示すること。総当たりのオラクルになる
- 事前判定の結果で描写を変えること。描写はテンプレート選択に限る（ADR 0003）

## Consequences

- Good, because Jev の解釈が「妥当性 +15」「弱点 +20」として数字で見え、入力を工夫する理由ができる
- Good, because 実行時の待ちが消える。判定は入力中に済んでいる
- Good, because 内訳は `rateBreakdown()` 1 箇所から出るので、事前判定と実行後ログがずれない
- Bad, because Jev の呼び出し上限が 1 ゲーム 8 回から最大 88 回になる。コストは 10 倍強が上限
- Bad, because plausibility の付き方を学習して入力を最適化できる。難度は下がる。数値は `tuning.ts` で調整する
- Bad, because 弱点ボーナスの「乗った／乗らない」は見えるので、前提手がかりの有無を推測する材料にはなる

## Implementation Plan

- **Affected paths**: `web/src/app/api/preview/route.ts`、`web/src/app/api/turn/route.ts`、`web/src/lib/game/resolve.ts`、`web/src/lib/game/types.ts`、`web/src/lib/store.ts`、`web/src/app/page.tsx`
- **Dependencies**: なし（封緘は ADR 0001 の仕組みをそのまま使う）
- **Patterns to follow**:
  - 内訳は `rateBreakdown()` から取る。画面や Route Handler で再計算しない
  - `GameState.previews` / `preview` はターンが進むと `resolveTurn` が 0 / null に戻す
  - フォールバックになった判定は封緘に残さず、実行時に判定し直す
  - クライアントは今の入力と一致する判定だけを表示する。古い判定は出さない
- **Patterns to avoid**:
  - `/api/preview` のレスポンスに `Judgment` の他のフィールド（horrorExposure / meetsClear）を載せる
  - 上限を超えたとき `/api/turn` を拒否する。実行は常に通す（行き止まりにしない）

### Verification

- [x] 内訳の和が rate と一致し、ロールしない判定では null になる（`resolve.test.ts`）
- [x] 上限で 429、同じ入力なら再利用、違えば判定し直す（`api/preview/route.test.ts`）
- [ ] テストプレイで、事前判定の待ち（3 秒＋Jev の応答）が入力の妨げにならないか確認する

## Alternatives Considered

- **送信時に 2 段階（判定 → 確認 → 実行）**: 呼び出し回数は同じだが、毎回ボタンを 1 つ余計に押させる。入力停止で自動化するほうが軽い
- **クリアへの接近度も見せる**: 不透明さは減るが、入力を変えて何度も試せる状況ではクリア条件の総当たりになる。FR-003 を実質的に壊す
- **事前判定は 1 ターン 1 回だけ**: 入力を直したときに再判定できず、見せた補正が古くなる。上限を大きめに取って自動再判定するほうが体験は素直

## More Information

- 根拠: `.specify/memory/constitution.md` 原則 II（1.3.0）
- 関連: [ゲーム状態を AES-256-GCM で封緘してクライアントに預ける](0001-seal-game-state-with-aes-256-gcm.md)、[描写をテンプレートの選択に限り、LLM に文章を書かせない](0003-narrate-from-templates-only.md)
- 再検討条件: Jev のコストが問題になったら `previewLimit` を下げるか、debounce を長くする。難度が下がりすぎたら `plausibilityMod` を圧縮する
