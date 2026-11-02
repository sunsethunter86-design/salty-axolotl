"""Quantize-stage fix: prefill's last-layer KV inputs (tensors 54/55) have no
consumer op in the prefill graph, so ai_edge_quantizer leaves them FLOAT32
with no quant params, while the executor allocates INT16 KV buffers (decode
is INT16). Force them INT16 with the decode tensors' quant params.

Usage: fix_kv_dtype.py <in.tflite> <out.tflite>
"""
import copy
import sys

sys.path.insert(0, "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages")
import flatbuffers
from ai_edge_litert import schema_py_generated as schema

src, dst = sys.argv[1], sys.argv[2]
buf = open(src, "rb").read()
model_t = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(buf, 0))
pre, dec = model_t.subgraphs[0], model_t.subgraphs[1]

def name(t):
    n = t.name
    return n.decode() if isinstance(n, (bytes, bytearray)) else n

fixed = []
for t in pre.tensors:
    n = name(t)
    if n in ("prefill_128_kv_cache_k_27", "prefill_128_kv_cache_v_27"):
        suffix = n.rsplit("_", 2)[-2] + "_" + n.rsplit("_", 1)[-1]  # k_27 / v_27
        donor = next(d for d in dec.tensors if name(d) == f"decode_kv_cache_{suffix}")
        assert donor.type == schema.TensorType.INT16, (suffix, donor.type)
        assert t.type == schema.TensorType.FLOAT32, (n, t.type)
        t.type = schema.TensorType.INT16
        t.quantization = copy.deepcopy(donor.quantization)
        fixed.append((n, donor.quantization.scale))
print("fixed:", fixed, flush=True)
assert len(fixed) == 2

builder = flatbuffers.Builder(0)
builder.Finish(model_t.Pack(builder), file_identifier=b"TFL3")
out = builder.Output()
open(dst, "wb").write(out)
print(f"wrote {dst} {len(out)} bytes (in {len(buf)})", flush=True)
