"""Spike workaround: calibration only recorded the last layer's KV-cache stats.

align_kv_cache_params needs a min/max for every layer's KV tensors in both the
prefill and decode signatures. The KV cache holds the same kind of values in
every layer, so clone the recorded layer-27 stats to the missing layers.
This is a spike approximation — quality is judged by the eval afterwards.
"""
import json
import re

path = "/mnt/d/MuseTest/experiments/salty/npu/out/calibration/Section0_TFLiteModel_tf_lite_prefill_decode.tflite.json"
d = json.load(open(path))
print("top-level type:", type(d), "keys sample:", list(d)[:3] if isinstance(d, dict) else len(d))

# Find the dict that maps tensor name -> {min, max}
def find_qsv(o):
    if isinstance(o, dict):
        if any(isinstance(k, str) and "kv_cache" in k for k in o):
            return o
        for v in o.values():
            r = find_qsv(v)
            if r is not None:
                return r
    return None

qsv = find_qsv(d)
print("qsv entries:", len(qsv))
kv = [k for k in qsv if "kv_cache" in k]
print("kv keys:", kv)

added = 0
for src in list(kv):
    m = re.search(r"^(.*kv_cache_[kv]_)(\d+)$", src)
    if not m:
        continue
    prefix, layer = m.group(1), int(m.group(2))
    for i in range(layer + 1):
        name = f"{prefix}{i}"
        if name not in qsv:
            qsv[name] = qsv[src]
            added += 1
    # also the other signature's naming: prefill_128_ <-> plain
    if prefix.startswith("prefill_128_"):
        plain = prefix[len("prefill_128_"):]
        for i in range(layer + 1):
            name = f"{plain}{i}"
            if name not in qsv:
                qsv[name] = qsv[src]
                added += 1

print("added:", added)
json.dump(d, open(path, "w"))
print("saved")
