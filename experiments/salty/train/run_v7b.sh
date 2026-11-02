#!/usr/bin/env bash
# v7b: train (2 epochs), merge, convert with prefill 32+128. Writes v7b.done with each stage's exit code.
T=/mnt/d/MuseTest/experiments/salty/train
rm -f $T/v7b.done
bash $T/run_axolotl.sh train salty_lora_v7b.yml > $T/v7b.log 2>&1; A=$?
bash $T/run_axolotl.sh merge-lora salty_lora_v7b.yml > $T/merge-v7b.log 2>&1; B=$?
mkdir -p /mnt/d/MuseTest/convert/salty-v7b-p32-out
bash $T/convert_salty_p32.sh $T/runs/salty-v7b/merged /mnt/d/MuseTest/convert/salty-v7b-p32-out; C=$?
echo "TRAIN=$A MERGE=$B CONVERT=$C $(cat /mnt/d/MuseTest/convert/salty-v7b-p32-out/convert.done 2>/dev/null)" > $T/v7b.done
