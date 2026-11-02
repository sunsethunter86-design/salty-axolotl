"""Which ops read/write tensor 54, and what are the decode graph's KV dtypes?"""
import sys

from ai_edge_litert.interpreter import Interpreter

path = sys.argv[1]
interp = Interpreter(model_path=path)
interp.allocate_tensors()
details = {d["index"]: d for d in interp.get_tensor_details()}

# Interpreter API doesn't expose op list; use the flatbuffer via numpy-free parse:
# instead report dtype census of kv_cache tensors per signature name prefix.
from collections import Counter
c = Counter()
for d in details.values():
    if "kv_cache" in d["name"]:
        c[(d["name"].split("_kv_")[0], str(d["dtype"]))] += 1
for k in sorted(c):
    print(k, c[k])
bad = [d for d in details.values() if "kv_cache" in d["name"] and "float32" in str(d["dtype"])]
for d in bad:
    print("FP32 KV:", d["index"], d["name"], d["shape"])
