"""Which ops consume KV tensors 0 and 54 in the prefill graph?"""
import sys

from ai_edge_litert import schema_py_generated as schema

buf = open(sys.argv[1], "rb").read()
model = schema.Model.GetRootAsModel(buf, 0)
sg = model.Subgraphs(0)

def op_name(op):
    code = model.OperatorCodes(op.OpcodeIndex())
    return str(code.BuiltinCode())

for want in (0, 54, 55):
    print(f"--- tensor {want} consumers ---")
    for oi in range(sg.OperatorsLength()):
        op = sg.Operators(oi)
        ins = [op.Inputs(j) for j in range(op.InputsLength())]
        if want in ins:
            outs = [op.Outputs(j) for j in range(op.OutputsLength())]
            print(f" op {oi} {op_name(op)} inputs={ins[:6]} outputs={outs[:6]}")
