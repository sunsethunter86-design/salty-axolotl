"""Make a blind scoring sheet from two or more eval runs.

Usage: python make_blind.py A-stock-short B-stock-saltyprompt C-salty-v1 [--seed 1]
Writes eval/blind/sheet_<stamp>.csv (open in Excel and fill the score columns)
and eval/blind/key_<stamp>.json (don't open it until scoring is finished).
"""

import argparse
import csv
import json
import random
import time

import common as c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("arms", nargs="+")
    ap.add_argument("--seed", type=int, default=1, help="which generation seed to score")
    args = ap.parse_args()

    items = {i["id"]: i for i in c.load_jsonl(c.EVAL / "heldout_v1.jsonl")}
    replies = {}
    for arm in args.arms:
        for r in c.load_jsonl(c.EVAL / "runs" / f"{arm}.jsonl"):
            if r["seed"] == args.seed:
                replies[(r["id"], arm)] = r["reply"]

    stamp = time.strftime("%Y%m%d-%H%M%S")
    rng = random.Random(stamp)
    out_dir = c.EVAL / "blind"
    out_dir.mkdir(exist_ok=True)
    key = {}
    order = list(items)
    rng.shuffle(order)
    with open(out_dir / f"sheet_{stamp}.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["row", "item", "conversation so far", "reply label", "reply",
                    "funny 1-5", "natural 1-5", "her 1-5", "right 1-5", "note"])
        row = 0
        for iid in order:
            arms = [a for a in args.arms if (iid, a) in replies]
            rng.shuffle(arms)
            convo = " / ".join(f"{t['role']}: {t['content']}" for t in items[iid]["turns"])
            for label, arm in enumerate(arms, 1):
                row += 1
                key[f"{iid}#{label}"] = arm
                w.writerow([row, iid, convo, label, replies[(iid, arm)], "", "", "", "", ""])
    (out_dir / f"key_{stamp}.json").write_text(json.dumps(key, indent=1), encoding="utf-8")
    print(f"Sheet: {out_dir / f'sheet_{stamp}.csv'} ({row} replies)")
    print(f"Key:   {out_dir / f'key_{stamp}.json'} (keep it closed while scoring)")


if __name__ == "__main__":
    main()
