#!/bin/bash
cd /mnt/d/MuseTest/tools/llama.cpp/pkg-android/llama.cpp/lib
for f in libllama.so libggml.so libggml-base.so libggml-hexagon.so libggml-htp-v75.so libggml-cpu.so; do
  echo "== $f"
  readelf -d $f | grep NEEDED
done
ls /mnt/d/MuseTest/tools/llama.cpp/pkg-android/llama.cpp/lib | grep -i "c++\|omp"
find ~/android-ndk-r28b -name "libc++_shared.so" -path "*aarch64*" | head -2
