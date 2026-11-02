#!/bin/bash
# Build libvfmind_jni.so (Hexagon spike bridge) and stage hex-jniLibs.
# Run in WSL: bash app/android/app/native-hex/build_hex_native.sh
set -e
NDK=$HOME/android-ndk-r28b
CXX=$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android26-clang++
PKG=/mnt/d/MuseTest/tools/llama.cpp/pkg-android/llama.cpp
SRC=/mnt/d/MuseTest/app/android/app/native-hex/vfhex_jni.cpp
OUT=/mnt/d/MuseTest/app/android/app/hex-jniLibs/arm64-v8a
mkdir -p $OUT
$CXX -O2 -shared -fPIC -std=c++17 \
  -I/mnt/d/MuseTest/tools/llama.cpp/include \
  -I/mnt/d/MuseTest/tools/llama.cpp/ggml/include \
  $SRC -o $OUT/libvfmind_jni.so \
  -L$PKG/lib -lllama -lggml -lggml-base -llog -ldl
for f in libggml-base.so libggml.so libggml-cpu.so libggml-hexagon.so libggml-htp-v75.so libllama.so; do
  cp $PKG/lib/$f $OUT/
done
cp $NDK/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so $OUT/
ls -lh $OUT
