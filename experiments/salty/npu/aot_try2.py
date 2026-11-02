"""AOT-compile one .tflite for SM8650 and print the Qualcomm plugin's own words."""
import glob
import os
import time

from ai_edge_litert.aot import aot_compile as aot_mod
from ai_edge_litert.aot.vendors.qualcomm import target as qnn_target
from ai_edge_litert.aot.vendors.qualcomm import qualcomm_backend

model = "/mnt/d/MuseTest/experiments/salty/npu/out/compile_tmp/Section2_TFLiteModel_tf_lite_aux.tflite"
target = qnn_target.Target(qnn_target.SocModel.SM8650)
backend = qualcomm_backend.QualcommBackend({"soc_model": "SM8650"})
print("compiling with Qualcomm backend only...", flush=True)
t0 = time.time()
try:
    result = aot_mod.aot_compile(model, backends=[backend])
    print(f"done in {time.time()-t0:.1f}s")
    print(result)
except Exception as e:
    print(f"raised in {time.time()-t0:.1f}s:", repr(e))

for f in sorted(glob.glob("/tmp/*.error"), key=os.path.getmtime)[-3:]:
    print("=====", f)
    print(open(f).read()[-3000:])
