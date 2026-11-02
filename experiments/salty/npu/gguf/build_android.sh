#!/bin/bash
set -x
cd /mnt/d/MuseTest/tools/llama.cpp
cp docs/backend/snapdragon/CMakeUserPresets.json ./CMakeUserPresets.json
export ANDROID_NDK_ROOT=$HOME/android-ndk-r28b
export PATH=$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH
export HEXAGON_SDK_ROOT=$HOME/Hexagon_SDK/6.7.0.0
export HEXAGON_TOOLS_ROOT=$HOME/Hexagon_SDK/6.7.0.0/tools/HEXAGON_Tools/21.0.04
cmake --preset arm64-android-snapdragon-release -B build-android -DGGML_OPENCL=OFF
cmake --build build-android -j 8
cmake --install build-android --prefix pkg-android/llama.cpp
ls -lh pkg-android/llama.cpp/bin pkg-android/llama.cpp/lib
