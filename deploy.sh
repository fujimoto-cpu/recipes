#!/bin/bash
# deploy.sh — レシピ図書館サイトの再ビルド＆公開（recipe-site スキルの正本デプロイ手順）
# 2026-07-08 新設：無人バッチが `cd ~/Documents/recipes && git ...` の即興bashを組んで
# 許可プロンプトで止まる事故の恒久対策。呼び出しは `bash /Users/yuriko/Documents/recipes/deploy.sh` の1回だけ。
set -euo pipefail

REPO="/Users/yuriko/Documents/recipes"
cd "$REPO"

python3 build.py

if [ -z "$(git status --short)" ]; then
  echo "NO_CHANGES"
  exit 0
fi

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "ERROR: branch is '$BRANCH' (expected main). Aborting push." >&2
  exit 1
fi

git add -A
git commit -m "Update recipe data ($(date '+%Y-%m-%d'))"
git push
echo "DEPLOYED"
