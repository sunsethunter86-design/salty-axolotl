"""What is tensor idx 54 in the prefill/decode graph?"""
import sys

from ai_edge_litert import interpreter as litert_interpreter  # noqa: F401  (ensures schema import path)
import flatbuffers  # noqa: F401

sys.path.insert(0, "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages")
try:
    from tflite import Model as TFLiteModel
except ImportError:
    from tflite.Model import Model as TFLiteModel

path = sys.argv[1]
model = TFLiteModel.FromFile(path) if hasattr(TFLiteModel, "FromFile") else None
if model is None:
    buf = open(path, "rb").read()
    from tflite.Model import Model
    model = Model.GetRootAs(buf, 0)

for si in range(model.SubgraphsLength()):
    sg = model.Subgraphs(si)
    print(f"subgraph {si}: {sg.Name()}, tensors={sg.TensorsLength()}, ops={sg.OperatorsLength()}")
    for ti in range(min(sg.TensorsLength(), 70)):
        t = sg.Tensors(ti)
        shape = [t.Shape(j) for j in range(t.ShapeLength())]
        print(f"  [{ti}] {t.Name()} type={t.Type()} shape={shape}")
    if si >= 1:
        break
