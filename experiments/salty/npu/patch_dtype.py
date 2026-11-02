"""In-place dtype fix: prefill's last-layer KV cache tensors are FLOAT32 while
every other KV tensor (and the whole decode graph) is INT16. The NPU executor
allocates KV buffers at INT16 size, so tensor 54 needs 2x its allocation.

Single-byte edits inside a copy of the bundle: Tensor.Type FLOAT32(0) -> INT16(7)
for prefill_128_kv_cache_k_27 / _v_27 in Section 0.
"""
import shutil

from ai_edge_litert import schema_py_generated as schema

SRC = "/mnt/d/MuseTest/experiments/salty/npu/out_i4/model_srq.litertlm"
DST = "/mnt/d/MuseTest/experiments/salty/npu/out_i4/model_srq_fix.litertlm"
shutil.copyfile(SRC, DST)

data = bytearray(open(DST, "rb").read())

# LiteRTLM header: sections start after the header; Section 0 (prefill_decode)
# begins at offset 16384 in these builder-made bundles (see litertlm_peek).
SECTION0 = 16384
model = schema.Model.GetRootAsModel(data[SECTION0:], 0)
sg = model.Subgraphs(0)
patched = []
for ti in range(sg.TensorsLength()):
    t = sg.Tensors(ti)
    name = t.Name().decode() if t.Name() else ""
    if name in ("prefill_128_kv_cache_k_27", "prefill_128_kv_cache_v_27"):
        assert t.Type() == schema.TensorType.FLOAT32, (ti, name, t.Type())
        # Tensor table field 2 (type): locate via vtable.
        table_pos = t._tab.Pos
        vtable_pos = table_pos - int.from_bytes(
            data[SECTION0 + table_pos: SECTION0 + table_pos + 4], "little", signed=True)
        field_offset = int.from_bytes(
            data[SECTION0 + vtable_pos + 4 + 2 * 2: SECTION0 + vtable_pos + 4 + 2 * 2 + 2],
            "little")
        assert field_offset != 0, "type field is default-valued; cannot patch in place"
        at = SECTION0 + table_pos + field_offset
        assert data[at] == 0, (at, data[at])
        data[at] = 7  # INT16
        patched.append((ti, name, at))

print("patched:", patched)
open(DST, "wb").write(data)
print("wrote", DST)
