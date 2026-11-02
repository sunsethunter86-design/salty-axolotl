"""Compile one .tflite for SM8650 through the ai_edge_litert AOT API.

Usage: python aot_try.py <model.tflite> <out_dir>
"""
import sys
import time

from ai_edge_litert.aot import aot_compile as aot_mod
from ai_edge_litert.aot.vendors.qualcomm import target as qnn_target

model, out_dir = sys.argv[1], sys.argv[2]
target = qnn_target.Target(qnn_target.SocModel.SM8650)
print("compiling", model, "->", out_dir, flush=True)
t0 = time.time()
result = aot_mod.aot_compile(model, targets=[target])
print(f"compiled in {time.time()-t0:.1f}s:", result, flush=True)
from ai_edge_litert.aot.ai_pack import export_lib
export_lib.export_ai_pack(result, export_dir=out_dir)
print("exported to", out_dir, flush=True)
