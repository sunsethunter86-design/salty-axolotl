"""Why did apply_plugin fail? Check the Qualcomm SDK package and plugin binary."""
import os
import pathlib

try:
    import ai_edge_litert_sdk_qualcomm as q
    print("sdk package OK, libs:", q.path_to_sdk_libs())
except Exception as e:
    print("sdk package MISSING:", repr(e))

import ai_edge_litert
pkg = pathlib.Path(ai_edge_litert.__file__).parent
print("ai_edge_litert at:", pkg)
for cand in [pkg / "vendors" / "qualcomm" / "compiler",
             pkg.parent / "vendors" / "qualcomm" / "compiler"]:
    print(cand, "exists:", cand.exists())
    if cand.exists():
        for f in sorted(cand.rglob("*"))[:20]:
            print("   ", f.relative_to(cand), f.stat().st_size if f.is_file() else "")
