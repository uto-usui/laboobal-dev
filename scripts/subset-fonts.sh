#!/bin/sh
# 字を絞ったフォントを src/fonts/ に作る。トップの背景の「labobal.dev」とピックアップの「pick!」の Molle と、本文の Montserrat 400 の英数字。
# 手元で `sh scripts/subset-fonts.sh`。fonttools は uv で一時的に入れる（uv がなければ `pip install 'fonttools[woff]'` して pyftsubset を直接呼ぶ）
set -eu

uvx --from 'fonttools[woff]' pyftsubset \
  node_modules/@fontsource/molle/files/molle-latin-400-italic.woff2 \
  --text=' labobal.devpick!' --flavor=woff2 --output-file=src/fonts/molle-mark.woff2

# 本文の Montserrat 400 の英数字だけの版。@fontsource の latin の版より後に読むので、英数字はこちらで描き、
# それ以外のラテン文字（© や — など）が出たときだけ latin の版を読みに行く
uvx --from 'fonttools[woff]' pyftsubset \
  node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2 \
  --unicodes='U+0020-007E,U+00A0' --flavor=woff2 --output-file=src/fonts/montserrat-ascii-400.woff2
