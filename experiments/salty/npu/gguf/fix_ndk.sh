#!/bin/bash
python3 /mnt/d/MuseTest/experiments/salty/npu/gguf/fix_symlinks.py $HOME/android-ndk-r28b | tail -8
bash /mnt/d/MuseTest/experiments/salty/npu/gguf/probe_clang.sh
