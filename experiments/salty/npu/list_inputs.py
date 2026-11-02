import sys
sys.path.insert(0, "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages")
from ai_edge_litert import schema_py_generated as schema
buf = open(sys.argv[1], "rb").read()
model = schema.Model.GetRootAsModel(buf, 0)
for si in range(2):
    sg = model.Subgraphs(si)
    print(f"--- subgraph {si} ---")
    for j in range(sg.InputsLength()):
        ti = sg.Inputs(j)
        t = sg.Tensors(ti)
        name = t.Name().decode() if t.Name() else ""
        qp = t.Quantization()
        nscale = qp.ScaleLength() if qp else -1
        print(f" in[{j}] tensor={ti} {name} type={t.Type()} nscale={nscale}")
