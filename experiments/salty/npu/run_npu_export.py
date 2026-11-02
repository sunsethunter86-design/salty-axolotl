"""Salty NPU spike: compile her Llama-3.2-3B fine-tune for the SM8650 Hexagon.

Stages (litert-torch experimental npu_export):
  1 export    HF weights -> .litertlm (split cache, dynamic wi8)
  2 calibrate activation ranges on salty.jsonl prompts
  3 quantize  static-range (SRQ) .litertlm
  4 compile   QNN ahead-of-time for SM8650 (phone cannot JIT-compile a 3B in RAM)

Run one stage at a time:  python run_npu_export.py <stage>
Everything lands under ./out/ next to this file.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, os.environ.get("NPU_OUT", "out"))
os.makedirs(OUT, exist_ok=True)

from litert_torch.generative.export_hf.experimental.npu_export import config_manager, stages

cfg = config_manager.NpuPipelineConfig.from_dict(
    json.load(open(os.path.join(HERE, os.environ.get("NPU_CFG", "salty_sm8650.json"))))
)
cfg.print_summary()

stage = sys.argv[1] if len(sys.argv) > 1 else "all"
exported = os.path.join(OUT, "exported", "model.litertlm")
srq = os.path.join(OUT, "model_srq.litertlm")
aot = os.path.join(OUT, "model_salty_sm8650.litertlm")

if stage in ("1", "export", "all"):
    print("STAGE 1: export", flush=True)
    stages.npu_export(cfg, os.path.join(OUT, "exported"), keep_temporary_files=True,
                      calibration_dataset_dir=HERE)
    print("exported:", exported, flush=True)

if stage in ("2", "calibrate", "all"):
    print("STAGE 2: calibrate", flush=True)
    stages.npu_calibrate(cfg, exported, HERE, os.path.join(OUT, "calibration"))
    print("calibration done", flush=True)

if stage in ("3", "quantize", "all"):
    print("STAGE 3: quantize (SRQ)", flush=True)
    # Spike workaround: KV alignment looks up signature tensors the profiler
    # calibration never recorded (Llama split-cache naming). Skip missing
    # names instead of dying; count them so the report can own the risk.
    import ai_edge_quantizer.utils.calibration_utils as _cu
    _orig = _cu._find_overall_min_max
    _missing = []
    def _tolerant(qsv, tensor_names):
        present = [t for t in tensor_names if t in qsv]
        _missing.extend(t for t in tensor_names if t not in qsv)
        if not present:
            return -1.0, 1.0
        return _orig(qsv, present)
    _cu._find_overall_min_max = _tolerant
    # align_quant_stats also writes back into qsv[tensor] for every resolved
    # name; create placeholders for missing ones and retry until it settles.
    _orig_align = _cu.CalibrationQsvAlignmentUtils.align_quant_stats
    def _align_retry(self, qsv, signature_data):
        for _ in range(64):
            try:
                return _orig_align(self, qsv, signature_data)
            except KeyError as e:
                name = str(e).strip("'\"")
                if name in qsv:
                    raise
                qsv[name] = {"min": -1.0, "max": 1.0}
                _missing.append(name)
        return _orig_align(self, qsv, signature_data)
    _cu.CalibrationQsvAlignmentUtils.align_quant_stats = _align_retry
    _orig_update = _cu.CalibrationQsvAlignmentUtils.update_quant_stats
    def _update_retry(self, qsv, signature_data, min_value, max_value):
        for _ in range(64):
            try:
                return _orig_update(self, qsv, signature_data, min_value, max_value)
            except KeyError as e:
                name = str(e).strip("'\"")
                if name in qsv:
                    raise
                qsv[name] = {"min": -1.0, "max": 1.0}
                _missing.append(name)
        return _orig_update(self, qsv, signature_data, min_value, max_value)
    _cu.CalibrationQsvAlignmentUtils.update_quant_stats = _update_retry
    import atexit
    atexit.register(lambda: print(f"KV-ALIGN missing tensors skipped: {len(_missing)}", flush=True))
    # KV dtype fix: prefill's last-layer KV inputs (tensors 54/55) have no
    # consumer op in the prefill graph, so the quantizer leaves them FLOAT32
    # with no quant params. The NPU executor allocates INT16 KV buffers
    # (decode is INT16), so inference dies at warmup with
    # "Custom allocation is too small for tensor idx: 54". Force those two
    # tensors INT16 with the decode tensors' quant params on the quantizer's
    # own model object, just before its external-buffer serialization.
    import copy as _copy
    from ai_edge_litert import schema_py_generated as _schema
    from ai_edge_quantizer import model_modifier as _mm

    def _fix_last_layer_kv(model_t):
        if not model_t.subgraphs or len(model_t.subgraphs) < 2:
            return
        def _nm(t):
            n = t.name
            return n.decode() if isinstance(n, (bytes, bytearray)) else n
        pre, dec = model_t.subgraphs[0], model_t.subgraphs[1]
        dec_by_name = {_nm(d): d for d in dec.tensors}
        fixed = []
        for t in pre.tensors:
            n = _nm(t)
            if "kv_cache_" not in n or t.type != _schema.TensorType.FLOAT32:
                continue
            suffix = n.rsplit("kv_cache_", 1)[-1]
            donor = dec_by_name.get(f"decode_kv_cache_{suffix}")
            if donor is None or donor.type != _schema.TensorType.INT16:
                continue
            t.type = _schema.TensorType.INT16
            t.quantization = _copy.deepcopy(donor.quantization)
            fixed.append(n)
        if fixed:
            print(f"KV-DTYPE fixed to INT16: {fixed}", flush=True)

    _orig_ser = _mm.ModelModifier._serialize_model
    def _ser_fixed(self, quantized_model, packed_buffer_data, serialize_to_path=None):
        _fix_last_layer_kv(quantized_model)
        return _orig_ser(self, quantized_model, packed_buffer_data, serialize_to_path)
    _mm.ModelModifier._serialize_model = _ser_fixed
    _orig_ser_small = _mm.ModelModifier._serialize_small_model
    def _ser_small_fixed(self, quantized_model):
        _fix_last_layer_kv(quantized_model)
        return _orig_ser_small(self, quantized_model)
    _mm.ModelModifier._serialize_small_model = _ser_small_fixed
    stages.npu_quantize(cfg, exported, srq, os.path.join(OUT, "calibration"))
    print("srq:", srq, flush=True)

if stage in ("4", "compile", "all"):
    print("STAGE 4: QNN AOT compile for", cfg.soc_model, flush=True)
    stages.npu_compile(cfg, srq, aot, keep_temporary_files=True,
                       intermediate_dir=os.path.join(OUT, "compile_tmp"))
    print("aot:", aot, flush=True)

print("STAGE OK:", stage, flush=True)
