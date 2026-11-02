#!/usr/bin/env bash
# Creates the isolated Salty training environment in WSL (Linux filesystem, for speed).
# Never touches convert-venv or litert-venv.
set -euo pipefail
VENV="$HOME/salty-train-venv"
OUT=/mnt/d/MuseTest/experiments/salty/train

[ -d "$VENV" ] || python3 -m venv "$VENV"
source "$VENV/bin/activate"
pip install -q --upgrade pip setuptools wheel
pip install axolotl
python - <<'EOF'
import torch, axolotl
print("torch", torch.__version__, "cuda", torch.version.cuda, "available", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu", torch.cuda.get_device_name(0), "bf16", torch.cuda.is_bf16_supported())
print("axolotl", axolotl.__version__)
EOF
pip freeze > "$OUT/env-freeze.txt"
echo INSTALL_DONE
