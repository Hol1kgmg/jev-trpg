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

just / gitleaks / lefthook のインストールと Git フックの設定が一括で行われます。
以降はリポジトリのディレクトリに入るだけで自動的に環境が有効になります。

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

- 設計判断の記録: [adr/](adr/)
