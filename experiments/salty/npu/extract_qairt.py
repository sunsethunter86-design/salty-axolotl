"""Extract QAIRT device .so files without basename collisions.

Host (aarch64-android) copies win for shared names; the Hexagon v75 folder
contributes only its Skel library.
"""
import os
import zipfile

src = os.path.expanduser("~/qairt/qairt.zip")
dst = os.path.expanduser("~/npu-harness/qairt-libs")
os.makedirs(dst, exist_ok=True)
z = zipfile.ZipFile(src)
host = [n for n in z.namelist() if n.endswith(".so") and "aarch64-android/libQnn" in n]
skel = [n for n in z.namelist() if n.endswith("Skel.so") and "hexagon-v75/unsigned/" in n]
for n in host + skel:
    out = os.path.join(dst, os.path.basename(n))
    open(out, "wb").write(z.read(n))
    print(out, os.path.getsize(out))
