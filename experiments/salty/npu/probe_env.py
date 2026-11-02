"""NPU spike environment probe: what Qualcomm targets can this venv compile for?"""
import sys

try:
    from ai_edge_litert.aot.vendors.qualcomm import target as t
    socs = [x for x in dir(t.SocModel) if not x.startswith("_")]
    print("SocModel entries:", socs)
    print("has SM8650:", any("8650" in s for s in socs))
except Exception as e:
    print("aot target import failed:", repr(e))

try:
    import ai_edge_litert
    print("ai_edge_litert:", getattr(ai_edge_litert, "__version__", "unknown"))
except Exception as e:
    print("ai_edge_litert import failed:", repr(e))

try:
    from litert_torch.generative.export_hf.experimental.npu_export import stages
    print("npu stages ok:", [f for f in dir(stages) if f.startswith("npu_")])
except Exception as e:
    print("stages import failed:", repr(e))
