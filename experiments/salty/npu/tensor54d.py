"""KV dtypes in every subgraph, via TensorFlow's bundled tflite schema."""
import sys
from collections import Counter

from tensorflow.lite.python import schema_py_generated as schema

buf = open(sys.argv[1], "rb").read()
model = schema.Model.GetRootAsModel(buf, 0)
for si in range(model.SubgraphsLength()):
    sg = model.Subgraphs(si)
    c = Counter()
    bad = []
    for ti in range(sg.TensorsLength()):
        t = sg.Tensors(ti)
        name = t.Name().decode() if t.Name() else ""
        if "kv_cache" in name:
            c[t.Type()] += 1
            if t.Type() == schema.TensorType.FLOAT32:
                bad.append((ti, name))
    print(f"subgraph {si} ({sg.Name()}): kv dtypes {dict(c)} fp32={bad}")
