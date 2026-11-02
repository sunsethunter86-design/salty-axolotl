#!/bin/bash
set -e
V=/mnt/d/MuseTest/tools/convert-venv
PY=$V/bin/python
N=/mnt/d/MuseTest/experiments/salty/npu
for f in "$N/out_i4/model_srq.litertlm.intermediate.tflite" "$N/out_i4/exported/model.tflite" "$N/out_i4/exported/model_quantized.tflite" "$N/out/exported/model.tflite"; do
  echo "=== $f ==="
  ls -lh "$f" 2>&1
  $PY "$N/tensor54d.py" "$f" 2>&1 | head -20
done
