import os, sys
root = sys.argv[1]
fixed = 0
for dirpath, dirs, files in os.walk(root):
    for f in files:
        p = os.path.join(dirpath, f)
        if os.path.islink(p):
            continue
        try:
            if os.path.getsize(p) > 200:
                continue
            data = open(p, "rb").read().strip()
        except Exception:
            continue
        try:
            name = data.decode()
        except Exception:
            continue
        # symlink-stub files contain exactly the target path (relative)
        if not name or "\n" in name or " " in name or name.startswith("#"):
            continue
        target = os.path.normpath(os.path.join(dirpath, name))
        if os.path.exists(target) or os.path.islink(target):
            os.remove(p)
            os.symlink(name, p)
            fixed += 1
            print("link", p, "->", name)
print("fixed", fixed)
