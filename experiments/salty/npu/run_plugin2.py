"""Run the Qualcomm AOT compiler plugin on one .tflite and show what it says.

Usage: python run_plugin2.py <model.tflite> [extra plugin args...]
"""
import os
import subprocess
import sys
import time

plugin = "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages/ai_edge_litert/vendors/qualcomm/compiler/libLiteRtCompilerPlugin_Qualcomm.so"
sdk_libs = "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages/ai_edge_litert_sdk_qualcomm/data/lib/x86_64-linux-clang"
model = sys.argv[1]
extra = sys.argv[2:]
out = "/tmp/test_compiled.tflite"
err = "/mnt/d/MuseTest/experiments/salty/npu/out/plugin_err.txt"

env = os.environ.copy()
env["LD_LIBRARY_PATH"] = sdk_libs + ":" + env.get("LD_LIBRARY_PATH", "")
env.setdefault("QNN_LOG_LEVEL", "verbose")
args = [plugin, "--cmd=apply", f"--model={model}", f"--o={out}",
        "--soc_manufacturer=Qualcomm", "--soc_model=SM8650", f"--err={err}"] + extra
print(" ".join(args), flush=True)
t0 = time.time()
r = subprocess.run(args, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
print(f"returncode: {r.returncode} in {time.time()-t0:.1f}s")
print(r.stdout[-6000:])
if os.path.exists(err):
    print("--- err file ---")
    print(open(err).read()[-3000:])
