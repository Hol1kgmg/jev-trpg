# List available recipes for just
list:
    @just --list

# Sync agent skills into .claude/skills
skills:
    nix run .#skills-install-local

skills-list:
    nix run .#skills-list

# Update pinned skill sources (rewrites registry/sources.lock.json)
skills-update:
    nix run .#skills-sources-lock

# Update flake.lock and registry/sources.lock.json, then verify
update:
    nix flake update
    nix run .#skills-sources-lock
    nix flake check

# Merge template updates from upstream (run when you want them, not on a schedule)
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

# Scan the working tree for secrets
scan:
    gitleaks dir --verbose

# Scan staged changes for secrets
scan-staged:
    gitleaks protect --staged --verbose
