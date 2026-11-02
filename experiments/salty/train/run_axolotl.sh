#!/usr/bin/env bash
# Usage: run_axolotl.sh <axolotl subcommand> <config.yml> [extra args]
# Runs Axolotl fully offline with all telemetry off: nothing about the training
# data or the run leaves this PC.
set -euo pipefail
source "$HOME/salty-train-venv/bin/activate"
export AXOLOTL_DO_NOT_TRACK=1 DO_NOT_TRACK=1
export WANDB_MODE=disabled WANDB_DISABLED=true
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_DATASETS_OFFLINE=1
export HF_HUB_DISABLE_TELEMETRY=1 POSTHOG_DISABLED=1
export TOKENIZERS_PARALLELISM=false
cd /mnt/d/MuseTest/experiments/salty/train
exec axolotl "$@"
