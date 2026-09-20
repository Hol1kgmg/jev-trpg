# List recipes
list:
    @just --list

# Install dependencies
setup:
    pnpm -C web install

# Run the dev server
dev:
    pnpm -C web run dev

# Run the test suite
test:
    pnpm -C web run test

# Typecheck and test
check:
    pnpm -C web run typecheck
    pnpm -C web run test

# Build for production
build:
    pnpm -C web run build

# Measure Jev interpretation accuracy against the real API
eval-jev:
    pnpm -C web run eval-jev

# Install skills into .claude/skills
skills:
    nix run .#skills-install-local

# List installed skills
skills-list:
    nix run .#skills-list

# Re-pin skill sources
skills-update:
    nix run .#skills-sources-lock

# Update all locks, then check
update:
    nix flake update
    nix run .#skills-sources-lock
    nix flake check

# Restore speckit-* skills into .agents/skills
spec:
    nix develop --command specify integration upgrade claude --force

sync:
    #!/usr/bin/env bash
    set -euo pipefail
    git remote get-url upstream >/dev/null 2>&1 \
        || git remote add upstream https://github.com/Hol1kgmg/claude-temp.git
    git fetch --no-tags upstream main
    # --allow-unrelated-histories は初回のみ必要。テンプレート生成は履歴を共有しないため。
    # 2 回目以降は無害なので条件分岐は置かない。
    # マージコミットであることが必須。squash / rebase すると共通祖先が失われ、
    # 次回以降ツリー全体が衝突する（adr/from-template/0001）
    git merge upstream/main --allow-unrelated-histories --no-edit

# Serve markdown at http://localhost:8080
docs *ARGS:
    markserv . -p 8080 -a 0.0.0.0 --browser=false {{ARGS}}

# Scan working tree for secrets
scan:
    gitleaks dir --verbose

# Scan staged changes for secrets
scan-staged:
    gitleaks protect --staged --verbose
