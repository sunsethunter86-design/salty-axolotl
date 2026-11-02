#!/bin/bash
OLD=/mnt/d/MuseTest/app/android/app/llama-jniLibs/arm64-v8a
NEW=/mnt/d/MuseTest/tools/llama.cpp/pkg-android/llama.cpp/lib
nm -D --undefined-only $OLD/libvfmind_jni.so | awk '{print $NF}' | grep -E 'ggml|llama|mtmd' | sort -u > /tmp/need.txt
wc -l /tmp/need.txt
for f in libllama.so libggml.so libggml-base.so libggml-hexagon.so libmtmd.so libggml-cpu.so; do
  nm -D --defined-only $NEW/$f 2>/dev/null | awk '{print $NF}'
done | sort -u > /tmp/have.txt
wc -l /tmp/have.txt
echo "=== MISSING (bridge needs, new libs lack) ==="
comm -23 /tmp/need.txt /tmp/have.txt
echo "=== DT_NEEDED of bridge ==="
readelf -d $OLD/libvfmind_jni.so | grep NEEDED
echo "=== old libllama DT_NEEDED ==="
readelf -d $OLD/libllama.so | grep NEEDED
