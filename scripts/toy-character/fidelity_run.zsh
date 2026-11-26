#!/bin/zsh
# Use the existing local model/venv; all artifacts and caches stay under .work.
set -euo pipefail
cd "${0:A:h:h:h}"
toy_seeds=(42)
toy_skip_generation=0
while (( $# )); do
  case "$1" in
    --skip-generation) toy_skip_generation=1; shift ;;
    --seeds)
      shift; toy_seeds=()
      while (( $# )) && [[ "$1" != --* ]]; do
        [[ "$1" == <-> ]] || { print -u2 -- 'Seeds must be nonnegative integers'; exit 2; }
        toy_seeds+=("$1"); shift
      done
      (( ${#toy_seeds} )) || { print -u2 -- '--seeds requires at least one seed'; exit 2; }
      ;;
    *) print -u2 -- 'Usage: fidelity_run.zsh [--seeds 42 ...] [--skip-generation]'; exit 2 ;;
  esac
done
toy_seeds=(${(u)toy_seeds})
source .work/toy-character/img3d/env.sh
TOY_BLENDER="${TOY_BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
TOY_OUT=.work/toy-character/fidelity
mkdir -p "$TOY_OUT"
if [[ ! -f "$TOY_OUT/log.md" ]]; then
  cat > "$TOY_OUT/log.md" <<'LOG'
# 原画への位置合わせの再実行

条件と所要時間は generation.json、検査は seed-scores.json、誤差は metrics.json に記録する。seeds.png と欠損検査用レンダを開き、fidelity_annotations.json に観察を残してから後続処理へ進む。除外条件に当たる候補は変形しない。
LOG
fi
# Frozen input is retained byte-for-byte when its pixels are unchanged.
python scripts/toy-character/fidelity_input.py
if (( ! toy_skip_generation )); then
  python scripts/toy-character/fidelity_generate.py --seeds "${toy_seeds[@]}"
fi
python scripts/toy-character/fidelity_verify.py --stage generation --seeds "${toy_seeds[@]}"
for toy_stage in fidelity-base fidelity-seeds fidelity-inspect; do
  "$TOY_BLENDER" -b --factory-startup --python-exit-code 1 \
    -P scripts/toy-character/build.py -- --stage "$toy_stage" --out "$TOY_OUT" --seeds "${toy_seeds[@]}" \
    > "$TOY_OUT/$toy_stage.log" 2>&1
done
"$TOY_BLENDER" -b --factory-startup --python-exit-code 1 \
  -P scripts/toy-character/build.py -- --stage fidelity-repair --out "$TOY_OUT" --seeds "${toy_seeds[@]}" \
  > "$TOY_OUT/fidelity-repair.log" 2>&1
# Human inspection is mandatory: absent/stale annotations and all-excluded seeds
# stop here, before alignment, deformation or final comparison output.
python scripts/toy-character/fidelity_review.py gate --seeds "${toy_seeds[@]}"
"$TOY_BLENDER" -b --factory-startup --python-exit-code 1 \
  -P scripts/toy-character/build.py -- --stage fidelity-rank --out "$TOY_OUT" --seeds "${toy_seeds[@]}" \
  > "$TOY_OUT/fidelity-rank.log" 2>&1
python scripts/toy-character/fidelity_review.py seeds --seeds "${toy_seeds[@]}"
"$TOY_BLENDER" -b --factory-startup --python-exit-code 1 \
  -P scripts/toy-character/build.py -- --stage fidelity-fit --out "$TOY_OUT" --seeds "${toy_seeds[@]}" \
  > "$TOY_OUT/fidelity-fit.log" 2>&1
python scripts/toy-character/fidelity_review.py final --seeds "${toy_seeds[@]}"
python scripts/toy-character/fidelity_verify.py --seeds "${toy_seeds[@]}"
