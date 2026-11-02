"""One-session bundle surgery: unpack SRQ bundle, flip the two fp32 KV
tensor dtypes to INT16, rebuild, and copy the result out to /mnt/d."""
import os
import shutil
import subprocess
import sys

import flatbuffers

from ai_edge_litert import schema_py_generated as schema

PY = sys.executable
SRC = "/mnt/d/MuseTest/experiments/salty/npu/out_i4/model_srq.litertlm"
WORK = "/tmp/unpack_i4"
DST = "/mnt/d/MuseTest/experiments/salty/npu/out_i4/model_srq_fix.litertlm"

subprocess.run([PY, "-m", "litert_lm_builder.litertlm_builder_cli", "unpack",
                "--input", SRC, "--output_dir", WORK], check=True)

path = os.path.join(WORK, "Section0_TFLiteModel_tf_lite_prefill_decode.tflite")
buf = open(path, "rb").read()
model_t = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(buf, 0))
sg = model_t.subgraphs[0]
fixed = []
for t in sg.tensors:
    name = t.name.decode() if isinstance(t.name, (bytes, bytearray)) else t.name
    if name in ("prefill_128_kv_cache_k_27", "prefill_128_kv_cache_v_27"):
        t.type = schema.TensorType.INT16
        fixed.append(name)
print("fixed:", fixed, flush=True)
assert len(fixed) == 2

builder = flatbuffers.Builder(0)
builder.Finish(model_t.Pack(builder), file_identifier=b"TFL3")
open(path, "wb").write(builder.Output())
print("section0 rewritten", flush=True)

toml = open(os.path.join(WORK, "model.toml")).read()
print(toml, flush=True)
out = os.path.join(WORK, "rebuilt.litertlm")
out = os.path.join(WORK, "rebuilt.litertlm")
subprocess.run([PY, "-m", "litert_lm_builder.litertlm_builder_cli", "toml",
                "--path", os.path.join(WORK, "model.toml"),
                "output", "--path", out],
               check=True, cwd=WORK)
shutil.copyfile(out, DST)
print("wrote", DST, os.path.getsize(DST), flush=True)
