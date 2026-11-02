"""List graph inputs/outputs and tensor 54 via the LiteRT interpreter API."""
import sys

from ai_edge_litert.interpreter import Interpreter

path = sys.argv[1]
interp = Interpreter(model_path=path)
interp.allocate_tensors()
details = interp.get_tensor_details()
print("tensors:", len(details))
for d in details:
    if d["index"] in (0, 1, 2, 53, 54, 55) or d["index"] < 3:
        print(d["index"], d["name"], d["shape"], d["dtype"])
print("--- inputs ---")
for d in interp.get_input_details():
    print(d["index"], d["name"], d["shape"])
print("--- outputs ---")
for d in interp.get_output_details():
    print(d["index"], d["name"], d["shape"])
