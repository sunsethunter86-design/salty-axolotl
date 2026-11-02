"""Mark review decisions on chats without hand-editing JSON.

Examples (from experiments\\salty\\scripts):
  python set_status.py ..\\data\\candidates\\claude_batch_01.jsonl approved
  python set_status.py ..\\data\\candidates\\claude_batch_01.jsonl rejected --ids c01-004 c01-019 --note "not funny"
  python set_status.py ..\\data\\candidates\\claude_batch_01.jsonl approved --except c01-004 c01-019

Rejected chats stay in the file, so the decision is on record.
"""

import argparse
from pathlib import Path

import common as c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("status", choices=sorted(c.STATUSES))
    ap.add_argument("--ids", nargs="*", help="only these chats")
    ap.add_argument("--except", dest="skip", nargs="*", default=[], help="every chat except these")
    ap.add_argument("--note", help="reason, stored in the chat's notes field")
    args = ap.parse_args()

    path = Path(args.file)
    rows = c.load_jsonl(path)
    known = {r["id"] for r in rows}
    for i in (args.ids or []) + args.skip:
        if i not in known:
            raise SystemExit(f"No chat {i} in {path.name}")
    changed = 0
    for r in rows:
        if args.ids and r["id"] not in args.ids:
            continue
        if r["id"] in args.skip:
            continue
        r["status"] = args.status
        if args.note:
            r["notes"] = args.note
        changed += 1
    c.write_jsonl(path, rows)
    print(f"{changed} chats in {path.name} set to {args.status}")


if __name__ == "__main__":
    main()
