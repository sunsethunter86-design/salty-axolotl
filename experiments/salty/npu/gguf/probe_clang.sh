#!/bin/bash
B=$HOME/android-ndk-r28b/toolchains/llvm/prebuilt/linux-x86_64/bin
cat $B/clang
echo "--- direct clang-19 test ---"
echo 'int main(){return 0;}' > /tmp/t.c
$B/clang-19 --version | head -1
$B/clang --target=aarch64-linux-android34 -c /tmp/t.c -o /tmp/t.o && echo CLANG_WRAPPER_OK
ls -l /tmp/t.o
