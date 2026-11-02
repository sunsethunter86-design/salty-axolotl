import json, os, glob, sys
cal = "/mnt/d/MuseTest/experiments/salty/npu/out_i4/calibration"
for f in sorted(glob.glob(cal + "/**/*.json", recursive=True)):
    print(f, os.path.getsize(f))
    try:
        d = json.load(open(f))
    except Exception as e:
        print("  load err", e); continue
    qsv = d.get("model_qsvs", d)
    if isinstance(qsv, dict):
        keys = list(qsv.keys())
        kv = [k for k in keys if "kv_cache" in k]
        print("  total", len(keys), "kv", len(kv))
        for want in ["prefill_128_kv_cache_k_27","prefill_128_kv_cache_v_27","prefill_128_kv_cache_k_0","prefill_128_kv_cache_k_26","decode_kv_cache_k_27","kv_cache_k_27"]:
            hits=[k for k in keys if want in k]
            print("   ", want, "->", hits[:3])
        print("   sample kv:", sorted(kv)[:5])
        print("   sample kv tail:", sorted(kv)[-5:])
