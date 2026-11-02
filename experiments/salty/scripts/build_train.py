"""Build the Axolotl training file from approved chats.

Usage: python build_train.py [--allow-proposed]
  --allow-proposed  include chats not yet approved (only for the tiny smoke test)
Runs validate_dataset.py's checks first and refuses to build if they fail.
Writes data/build/train.jsonl and data/build/MANIFEST.json (counts, sources, hashes).
"""

import argparse
import hashlib
import json
import subprocess
import sys
import time

import common as c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-proposed", action="store_true")
    args = ap.parse_args()

    check = [sys.executable, str(c.ROOT / "scripts" / "validate_dataset.py")]
    if not args.allow_proposed:
        check.append("--only-approved")
    if subprocess.run(check).returncode:
        sys.exit("Validation failed; not building.")

    ok = {"approved"} | ({"proposed", "needs_edit"} if args.allow_proposed else set())
    system = c.system_prompt()
    rows, used = [], []
    for path in c.training_sources():
        for r in c.load_jsonl(path):
            if r.get("status") in ok:
                rows.append({"messages": [{"role": "system", "content": system}] + r["messages"]})
                used.append({"id": r["id"], "file": path.name, "status": r["status"], "source": r["source"]})
    if not rows:
        sys.exit("No chats to build (nothing approved yet?).")

    out = c.DATA / "build" / "train.jsonl"
    c.write_jsonl(out, rows)
    manifest = {
        "built": time.strftime("%Y-%m-%d %H:%M:%S"),
        "allow_proposed": args.allow_proposed,
        "chats": len(rows),
        "system_prompt": system,
        "train_sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        "sources": used,
    }
    (c.DATA / "build" / "MANIFEST.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"Wrote {len(rows)} chats to {out}")


if __name__ == "__main__":
    main()
