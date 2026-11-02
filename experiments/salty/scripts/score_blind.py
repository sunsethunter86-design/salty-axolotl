"""Unblind a filled-in scoring sheet and average the scores per arm and group.

Usage: python score_blind.py eval/blind/sheet_<stamp>.csv
(The key file with the same stamp must sit next to it.)
"""

import collections
import csv
import json
import statistics
import sys
from pathlib import Path

import common as c

SCORES = ["funny 1-5", "natural 1-5", "her 1-5", "right 1-5"]


def main():
    sheet = Path(sys.argv[1])
    key = json.loads(sheet.with_name(sheet.name.replace("sheet_", "key_").replace(".csv", ".json")).read_text(encoding="utf-8"))
    groups = {i["id"]: i["group"] for i in c.load_jsonl(c.EVAL / "heldout_v1.jsonl")}
    vals = collections.defaultdict(list)
    with open(sheet, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            arm = key[f"{row['item']}#{row['reply label']}"]
            for s in SCORES:
                if row[s].strip():
                    v = float(row[s])
                    vals[(arm, "all", s)].append(v)
                    vals[(arm, groups[row["item"]], s)].append(v)

    arms = sorted({a for a, _, _ in vals})
    group_names = ["all"] + sorted({g for _, g, _ in vals if g != "all"})
    print("| Arm | Group | " + " | ".join(SCORES) + " |")
    print("|---|---|" + "---|" * len(SCORES))
    for arm in arms:
        for g in group_names:
            cells = []
            for s in SCORES:
                v = vals.get((arm, g, s))
                cells.append(f"{statistics.mean(v):.2f} (n={len(v)})" if v else "")
            if any(cells):
                print(f"| {arm} | {g} | " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main()
