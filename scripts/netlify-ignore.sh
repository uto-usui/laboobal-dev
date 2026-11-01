#!/bin/sh
# Netlify の build.ignore から呼ぶ。本番のビルドに使わないファイルだけの変更なら exit 0 で止める。
# テストと道具の変更は GitHub の CI がビルドまで確かめる

# キャッシュがないビルドでは CACHED_COMMIT_REF が COMMIT_REF と同じになり、差分が空に見える。そのときはビルドする
if [ -z "$CACHED_COMMIT_REF" ] || [ "$CACHED_COMMIT_REF" = "$COMMIT_REF" ]; then
  exit 1
fi

git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . \
  ':(exclude)docs' \
  ':(exclude)README.md' \
  ':(exclude)CLAUDE.md' \
  ':(exclude)AGENTS.md' \
  ':(exclude)src/demos/*/notes.md' \
  ':(exclude).claude' \
  ':(exclude).github' \
  ':(exclude)e2e' \
  ':(exclude)playwright.config.ts' \
  ':(exclude)eslint.config.js' \
  ':(exclude).prettierrc' \
  ':(exclude).prettierignore' \
  ':(exclude).editorconfig' \
  ':(exclude).gitignore'
