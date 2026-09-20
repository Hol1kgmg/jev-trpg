# jev-trpg

ブラウザで遊ぶ 1 人用のコズミックホラー TRPG。探索者と怪異は開始時にランダム生成され、
プレイヤーは毎ターン行動の方向性を 4 択（観察する／攻撃する／働きかける／退く）から選び、
任意で詳細を自由入力します。入力の解釈は [Jev](https://typesafe.ai/)（Vercel AI Gateway 経由）が
担当し、成否の判定と状態更新はコード側の純関数が行います。入力が 3 秒止まると事前判定が走り、
その行動に入るダイス補正（技能・妥当性・弱点）が送信前に見えます。
最大 8 ターンで、クリア・死亡・発狂・ターン切れのいずれかに決着します。

Next.js（App Router）＋ TypeScript / Zustand / Tailwind CSS / Vitest、デプロイは Vercel。
アプリ本体は [web/](web/) 配下です。

## 前提条件

[Nix](https://nixos.org/)（Flakes 有効）と [direnv](https://direnv.net/) がインストールされ、シェルに統合されていること。

macOS (Homebrew):

```bash
brew install nix direnv
```

Flakes の有効化:

```bash
mkdir -p ~/.config/nix
echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
```

シェル統合 (zsh):

```bash
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc
```

## セットアップ

```bash
direnv allow
```

ツールのインストールと Git フックの設定が一括で行われます。
以降はリポジトリのディレクトリに入るだけで自動的に環境が有効になります。

```bash
just setup    # web/ の依存をインストールする
```

## 開発環境

`direnv` が `flake.nix` の devShell を読み込み、次のツールが PATH に入ります。

| ツール | 用途 |
|---|---|
| just | タスクランナー（[justfile](justfile)） |
| gitleaks / lefthook | pre-commit でステージ済みの差分をシークレット走査する（[lefthook.yaml](lefthook.yaml)） |
| gh / gh-dash | GitHub 操作 |
| spec-kit | `specs/` の仕様駆動フロー（`just spec`） |
| markserv | `just docs` で Markdown を http://localhost:8080 に配信する |

Node.js 20 以上と pnpm は devShell に含まれないので、各自で用意してください（pnpm のバージョンは
`web/package.json` の `packageManager` に固定してあります）。

エージェント用スキルは `skills.nix` の宣言から devShell 起動時に `.agents/skills` へ同期されます
（`just skills` / `just skills-list` / `just skills-update`）。

CI（[.github/workflows/ci.yaml](.github/workflows/ci.yaml)）は `nix flake check` のみを実行します。
アプリの型チェックとテストはローカルの `just check` で回してください。

### ディレクトリ

| パス | 中身 |
|---|---|
| `web/src/app` | 画面と Route Handler（`api/new-game`、`api/turn`） |
| `web/src/lib/jev` | Jev 呼び出しの境界。ここより先は `Judgment` を引数に取る純関数 |
| `web/src/lib/game` | 生成・判定・状態更新のゲームロジックとチューニング値 |
| `web/src/data` | 結果描写などのテンプレート文 |
| `specs/` / `adr/` | 仕様・設計判断の記録 |

## Jev の担当範囲

Jev が担当するのは**プレイヤーの自由入力の解釈だけ**です。`web/src/lib/jev/client.ts` の `judge()` が
`Judgment` を返した時点で役目が終わり、成功率・ダイス・HP/正気度・エンディング判定・描写はすべて
コード側の純関数（`web/src/lib/game`）が担います。

### 質問と使われ方（[contracts/jev-questions.md](specs/001-jev-cosmic-horror-trpg/contracts/jev-questions.md)）

| 質問 | 型 | ゲーム内での使われ方 |
|---|---|---|
| `plausibility` | 0〜4 | 成功率補正（`plausibilityMod`）。事前判定で「妥当性 +15」として画面に見える |
| `horror_exposure` | 0〜3 | 正気度の減少量に加算（`sanityLoss`） |
| `meets_clear` | 確率 | 手がかりが揃ったルートで条件を満たすと `routeBonus` 加算、成功すればクリア |
| `meta_cheat` | 確率 | ゲーム外の情報を引き出す入力を検出し、ロールせず `meta` に分岐 |
| `skill` | 6 択 | 現状は未使用。技能は方針の 4 択から `DIRECTION_SKILL` で確定する |
| `exploits_weakness` | 確率 | 現状は未使用。正規化はするが消費箇所がない |

`providerMetadata` の confidence が `confidenceThresholds.ambiguous` 未満なら `ambiguous`（ロールしない）に落とします。
しきい値はすべて `web/src/lib/game/tuning.ts` にあります。

### 呼ばれるタイミング（[ADR 0004](adr/jev-trpg/0004-preview-dice-modifier-before-commit.md)）

- `/api/preview`: 入力が 3 秒止まると自動実行。1 ターン `previewLimit`（10）回まで。結果は封緘に入れて往復させる
- `/api/turn`: 事前判定と同じ方針・詳細なら再利用して Jev を呼ばない。違えばここで 1 回呼ぶ

### 渡すもの・渡さないもの（`web/src/lib/jev/state.ts`）

- 渡す: 現在の場面描写、探索者の職業・技能・所持品・HP・正気度、入手済み手がかりの本文、方針と詳細入力
- 渡さない: 怪異の正体・目的、未入手の手がかり、ログ全文。クリア条件は `meets_clear` の instructions にだけ埋め込み、レスポンスには出さない

### 担当しないもの

- 文章生成: 描写とエンディングはテンプレート選択（[ADR 0003](adr/jev-trpg/0003-narrate-from-templates-only.md)）
- シナリオ生成: `generate.ts` が乱数で組む
- 失敗時: タイムアウト 5 秒、再試行なし。`fallbackJudgment`（confidence 0）で必ず `ambiguous` に落ち、ゲームは止まらない。`JEV_STUB=1` でスタブに差し替えられる

## 環境変数

`web/.env.local` に置きます（コミットしない）。

| 変数 | 用途 |
|---|---|
| `AI_GATEWAY_API_KEY` | Jev の呼び出し。Vercel ダッシュボードの AI Gateway で発行する（Vercel 本番・プレビューでは `VERCEL_OIDC_TOKEN` が自動注入されるため不要） |
| `SEAL_KEY` | ゲーム状態の封緘鍵。`openssl rand -base64 32` で生成する |

`just test` はネットワークに触れないので、どちらも未設定のまま通ります。

## タスク

```bash
just          # 利用可能なタスク一覧
just setup    # 依存のインストール
just dev      # 開発サーバー（http://localhost:3000）
just check    # 型チェックとテスト
just eval-jev # Jev の判定精度を実 API で計測する（料金が発生する）
```

## テンプレート同期

テンプレート元の変更と lockfile の更新は、必要なときに手動で取り込みます。

```bash
just sync      # テンプレート元の変更を取り込む
just update    # flake.lock / sources.lock.json を更新して検証する
```

`just sync` はマージコミットで取り込みます。PR 経由にする場合も **Create a merge commit** を使ってください（squash / rebase は共通祖先を壊します）。

## ドキュメント

- 仕様・設計・タスク: [specs/001-jev-cosmic-horror-trpg/](specs/001-jev-cosmic-horror-trpg/)（[検証手順](specs/001-jev-cosmic-horror-trpg/quickstart.md)）
- 実装プランの下書き: [app-spec.md](app-spec.md)
- 設計判断の記録: [adr/](adr/)
