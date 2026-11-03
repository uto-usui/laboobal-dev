#!/bin/sh
# トップの背景の「labobal.dev」の字だけに絞った Molle を src/fonts/ に作る。デモで使う Molle はそのまま @fontsource から読む。
# 手元で `sh scripts/subset-fonts.sh`。fonttools は uv で一時的に入れる（uv がなければ `pip install 'fonttools[woff]'` して pyftsubset を直接呼ぶ）
set -eu

uvx --from 'fonttools[woff]' pyftsubset \
  node_modules/@fontsource/molle/files/molle-latin-400-italic.woff2 \
  --text=' labobal.dev' --flavor=woff2 --output-file=src/fonts/molle-mark.woff2
