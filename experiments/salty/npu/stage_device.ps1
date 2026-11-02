# Stage the standalone NPU harness on the phone (nothing installed; files in /data/local/tmp).
# Usage: ./stage_device.ps1 <model.litertlm>
param([Parameter(Mandatory=$true)][string]$Model)
$ErrorActionPreference = 'Stop'
$adb = "C:\Users\Shaun\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$s = 'YOUR_DEVICE_SERIAL'
$D = '/data/local/tmp/npu'

& $adb -s $s shell "mkdir -p $D/jit"
# LiteRT-LM CLI harness (community build of google's litert_lm_advanced_main, v0.18.0)
wsl -e bash -lc "tar -xzf /mnt/d/MuseTest/experiments/salty/npu/libs/litert-lm-android.tar.gz -C ~/npu-harness --strip-components=1 2>/dev/null; ls ~/npu-harness/litert_lm_advanced_main"
& $adb -s $s push "\\wsl.localhost\Ubuntu-24.04\root\npu-harness\litert_lm_advanced_main" "$D/litert_lm_advanced_main"
# Qualcomm dispatch (LiteRT v2.2.0 release, v75) + QAIRT 2.47 device libraries
& $adb -s $s push "D:\MuseTest\experiments\salty\npu\libs\runtime\qualcomm_runtime_v75\src\main\jni\arm64-v8a\libLiteRtDispatch_Qualcomm.so" "$D/jit/"
wsl -e bash -lc "ls ~/npu-harness/qairt-libs/libQnnHtp.so ~/npu-harness/qairt-libs/libQnnSystem.so ~/npu-harness/qairt-libs/libQnnHtpPrepare.so ~/npu-harness/qairt-libs/libQnnHtpV75Skel.so ~/npu-harness/qairt-libs/libQnnHtpV75Stub.so ~/npu-harness/qairt-libs/libQnnIr.so ~/npu-harness/qairt-libs/libQnnSaver.so"
foreach ($lib in 'libQnnHtp.so','libQnnSystem.so','libQnnHtpPrepare.so','libQnnHtpV75Skel.so','libQnnHtpV75Stub.so','libQnnIr.so','libQnnSaver.so') {
  & $adb -s $s push "\\wsl.localhost\Ubuntu-24.04\root\npu-harness\qairt-libs\$lib" "$D/jit/"
}
& $adb -s $s push $Model "$D/model.litertlm"
& $adb -s $s shell "chmod +x $D/litert_lm_advanced_main; ls -la $D $D/jit"
Write-Host "staged at $D"
