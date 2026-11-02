import sys, json
sys.path.insert(0, "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages")
from ai_edge_litert import schema_py_generated as schema

for path in sys.argv[1:]:
    print("===", path)
    buf = open(path, "rb").read()
    # litertlm bundles: section0 at 16384 if not pure tflite
    off = 0
    if buf[4:8] != b"TFL3":
        # try find TFL3
        idx = buf.find(b"TFL3")
        print(" TFL3 at", idx)
        # litertlm section header parsing is complex; for intermediate tflite offset 0
        off = 0
    model = schema.Model.GetRootAsModel(buf, off)
    for si in range(min(model.SubgraphsLength(), 2)):
        sg = model.Subgraphs(si)
        print(f" subgraph {si} inputs={ [sg.Inputs(j) for j in range(sg.InputsLength())][:8]}... total_in={sg.InputsLength()} outputs={[sg.Outputs(j) for j in range(sg.OutputsLength())]}")
        for ti in range(sg.TensorsLength()):
            t = sg.Tensors(ti)
            name = t.Name().decode() if t.Name() else ""
            if "kv_cache_k_27" in name or "kv_cache_v_27" in name or "kv_cache_k_0" in name or ti in (54,55):
                qp = t.Quantization()
                qstr = None
                if qp:
                    scales = [qp.Scale(j) for j in range(qp.ScaleLength())]
                    zps = [qp.ZeroPoint(j) for j in range(qp.ZeroPointLength())]
                    qstr = f"scales={scales[:3]} zps={zps[:3]} dim={qp.QuantizedDimension()}"
                shape = [t.Shape(j) for j in range(t.ShapeLength())]
                print(f"  [{ti}] {name} type={t.Type()} shape={shape} buffer={t.Buffer()} quant={qstr}")
        # signatures
    for i in range(model.SignatureDefsLength()):
        sd = model.SignatureDefs(i)
        print(" sig", sd.SignatureKey(), "subgraph", sd.SubgraphIndex(), "inputs", sd.InputsLength(), "outputs", sd.OutputsLength())
        for j in range(sd.InputsLength()):
            inp = sd.Inputs(j)
            n = inp.Name().decode() if inp.Name() else ""
            if "27" in n or j>50:
                print("   in", j, n, inp.TensorIndex())
