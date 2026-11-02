#!/usr/bin/env bash
# v7a: train (2 epochs), merge, convert with prefill 32+128. Writes v7a.done with each stage's exit code.
T=/mnt/d/MuseTest/experiments/salty/train
rm -f $T/v7a.done
bash $T/run_axolotl.sh train salty_lora_v7a.yml > $T/v7a.log 2>&1; A=$?
bash $T/run_axolotl.sh merge-lora salty_lora_v7a.yml > $T/merge-v7a.log 2>&1; B=$?
mkdir -p /mnt/d/MuseTest/convert/salty-v7a-p32-out
bash $T/convert_salty_p32.sh $T/runs/salty-v7a/merged /mnt/d/MuseTest/convert/salty-v7a-p32-out; C=$?
echo "TRAIN=$A MERGE=$B CONVERT=$C $(cat /mnt/d/MuseTest/convert/salty-v7a-p32-out/convert.done 2>/dev/null)" > $T/v7a.done
