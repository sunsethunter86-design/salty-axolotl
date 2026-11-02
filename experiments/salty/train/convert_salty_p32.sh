#!/usr/bin/env bash
# Converts a merged Salty model to .litertlm with the 26 Oct stock settings
# (convert/convert.log): int4 block-32 + int8 embeddings, cache 4096.
# ONLY difference from convert_salty.sh (kept as the rollback): prefill
# lengths [32,128] instead of [128]. The shipped file has prefill_128 only,
# so every short suffix prefill is padded to 128 tokens (~0.8 s floor on
# the ROG, benchPrefill in the phone log). UNVERIFIED until measured:
# LiteRT-LM v0.16 picking the smallest prefill size that fits.
# Usage: convert_salty_p32.sh <merged_dir> <out_dir>
set -uo pipefail
MERGED="$1"; OUT="$2"
LOG="$OUT/convert.log"; MEM="$OUT/mem.log"
mkdir -p "$OUT"
rm -f "$OUT/convert.done"
( while true; do
    echo "$(date +%H:%M:%S) $(free -m | awk '/Mem:/{print "used_mb="$3" avail_mb="$7}')" >> "$MEM"; sleep 20
  done ) &
MON=$!
source /mnt/d/MuseTest/tools/convert-venv/bin/activate
START=$(date +%s)
python -m litert_torch.generative.export_hf "$MERGED" "$OUT" \
  --quantization_recipe=/mnt/d/MuseTest/convert/llama_int4_b32_emb8.json \
  --cache_length=4096 --prefill_lengths=[32,128] --bundle_litert_lm=True > "$LOG" 2>&1
RC=$?
kill $MON
echo "EXIT=$RC SECONDS=$(( $(date +%s) - START ))" > "$OUT/convert.done"
