# Run Salty on the phone NPU via the standalone LiteRT-LM CLI and time it.
# Nothing is installed; everything lives in /data/local/tmp/npu.
$ErrorActionPreference = 'Stop'
$adb = "C:\Users\Shaun\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$s = 'YOUR_DEVICE_SERIAL'
$D = '/data/local/tmp/npu'
$prompt = "Hey Salty, tell me in two short sentences what you love most about your tank."

& $adb -s $s shell dumpsys battery | Select-String temperature
$cmd = "cd $D && export LD_LIBRARY_PATH=`$D:`$D/jit && export ADSP_LIBRARY_PATH=`"$D/jit;/system/lib/rfsa/adsp;/vendor/lib/rfsa/adsp;/dsp`" && ./litert_lm_advanced_main --backend=npu --model_path=$D/model.litertlm --litert_dispatch_lib_dir=$D/jit --max_output_tokens=64 --input_prompt='$prompt'"
Write-Host $cmd
& $adb -s $s shell $cmd 2>&1 | Tee-Object -FilePath "$env:TEMP\salty-npu-bench.txt"
& $adb -s $s shell dumpsys battery | Select-String temperature
