# jev-trpg

ブラウザで遊ぶ 1 人用のコズミックホラー TRPG。探索者と怪異は開始時にランダム生成され、
プレイヤーは毎ターン行動の方向性を 4 択（観察する／攻撃する／働きかける／退く）から選び、
任意で詳細を自由入力します。入力の解釈は [Jev](https://typesafe.ai/)（Vercel AI Gateway 経由）が
1 ターン 1 回だけ担当し、成否の判定と状態更新はコード側の純関数が行います。
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
