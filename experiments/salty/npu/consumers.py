import sys
sys.path.insert(0, "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages")
from ai_edge_litert import schema_py_generated as schema
buf = open(sys.argv[1], "rb").read()
model = schema.Model.GetRootAsModel(buf, 0)
for si in range(2):
    sg = model.Subgraphs(si)
    print(f"--- subgraph {si} ops={sg.OperatorsLength()} ---")
    for want in (0, 52, 54, 55, 56):
        cons = []
        for oi in range(sg.OperatorsLength()):
            op = sg.Operators(oi)
            ins = [op.Inputs(j) for j in range(op.InputsLength())]
            if want in ins:
                code = model.OperatorCodes(op.OpcodeIndex()).BuiltinCode()
                outs = [op.Outputs(j) for j in range(op.OutputsLength())]
                cons.append((oi, code, outs[:3]))
        t = sg.Tensors(want)
        print(f" tensor {want} {t.Name()} consumers={cons[:4]} count={len(cons)}")
    # also outputs list membership
    outs = [sg.Outputs(j) for j in range(sg.OutputsLength())]
    print(" 54 in outputs?", 54 in outs, "55 in outputs?", 55 in outs)
