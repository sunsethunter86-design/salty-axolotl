import copy, sys
import flatbuffers
from tensorflow.lite.python import schema_py_generated as schema

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
        suffix = n.rsplit("kv_cache_",1)[-1]
        donor = next(d for d in dec.tensors if name(d) == f"decode_kv_cache_{suffix}")
        print(n, "type", t.type, "donor type", donor.type, "donor quant", donor.quantization.scale if donor.quantization else None)
        t.type = schema.TensorType.INT16
        t.quantization = copy.deepcopy(donor.quantization)
        fixed.append(n)
print("fixed", fixed)
builder = flatbuffers.Builder(0)
builder.Finish(model_t.Pack(builder), file_identifier=b"TFL3")
out = builder.Output()
open(dst, "wb").write(out)
print(f"wrote {dst} {len(out)} (in {len(buf)})")
