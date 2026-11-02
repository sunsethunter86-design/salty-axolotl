"""Which KV-cache tensors did calibration record, per section file?"""
import glob
import json
import os

for path in sorted(glob.glob("/mnt/d/MuseTest/experiments/salty/npu/out/calibration/*.json")):
    if "state" in path:
        continue
    d = json.load(open(path))
    # calibration files vary in shape; dig for tensor-name keys
    def keys(o, prefix=""):
        out = []
        if isinstance(o, dict):
            for k, v in o.items():
                if "kv_cache" in str(k) or "kv_slice" in str(k):
                    out.append(str(k))
                out += keys(v, prefix)
        elif isinstance(o, list):
            for v in o[:3]:
                out += keys(v, prefix)
        return out
    ks = sorted(set(keys(d)))
    print(os.path.basename(path), len(ks))
    for k in ks[:12]:
        print("  ", k)
