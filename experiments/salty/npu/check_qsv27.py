import json
p="/mnt/d/MuseTest/experiments/salty/npu/out_i4/calibration/Section0_TFLiteModel_tf_lite_prefill_decode.tflite.json"
d=json.load(open(p))
q=d.get("model_qsvs",d)
for k in ["prefill_128_kv_cache_k_0","prefill_128_kv_cache_k_26","prefill_128_kv_cache_k_27","prefill_128_kv_cache_v_27","prefill_128_kv_cache_v_26","decode_kv_cache_k_27"]:
    print(k, q.get(k))
print("meta", d.get("metadata"))
