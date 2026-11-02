"""List sections of a .litertlm by scanning its flatbuffer section headers."""
import struct
import sys

for path in sys.argv[1:]:
    data = open(path, "rb").read(2_000_000)
    print(path, "header scan:")
    # LiteRTLM section types are ASCII-ish in the header area; print printable runs
    import re
    runs = re.findall(rb"[ -~]{6,}", data[:200_000])
    seen = []
    for r in runs:
        s = r.decode()
        if any(k in s for k in ("Proto", "TFLite", "Tokenizer", "Metadata", "Section")):
            if s not in seen:
                seen.append(s)
    for s in seen[:20]:
        print("  ", s)
