"""Run the Qualcomm AOT compiler plugin directly and show its output."""
import os
import subprocess
import sys

plugin = "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages/ai_edge_litert/vendors/qualcomm/compiler/libLiteRtCompilerPlugin_Qualcomm.so"
sdk_libs = "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages/ai_edge_litert_sdk_qualcomm/data/lib/x86_64-linux-clang"
model = "/mnt/d/MuseTest/experiments/salty/npu/out/compile_tmp/Section0_TFLiteModel_tf_lite_prefill_decode.tflite"
out = "/tmp/test_compiled.tflite"
err = "/mnt/d/MuseTest/experiments/salty/npu/out/plugin_err.txt"

env = os.environ.copy()
env["LD_LIBRARY_PATH"] = sdk_libs + ":" + env.get("LD_LIBRARY_PATH", "")
args = [plugin, "--cmd=apply", f"--model={model}", f"--o={out}",
        "--soc_manufacturer=Qualcomm", "--soc_model=SM8650", f"--err={err}"]
print(" ".join(args), flush=True)
r = subprocess.run(args, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
print("returncode:", r.returncode)
print(r.stdout[-4000:])
if os.path.exists(err):
    print("--- err file ---")
    print(open(err).read()[-4000:])
