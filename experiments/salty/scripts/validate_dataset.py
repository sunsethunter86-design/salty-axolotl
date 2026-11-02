"""Check every training chat against STYLE.md rules before it can be used.

Usage: python validate_dataset.py [--only-approved]
Errors block training (exit code 1). Warnings are for the reviewer.
"""

import argparse
import collections
import sys

import common as c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-approved", action="store_true",
                    help="check only chats marked approved (what build_train.py uses)")
    args = ap.parse_args()

    errors, warnings = [], []
    chats = []
    seen_ids = set()
    for path in c.training_sources():
        for r in c.load_jsonl(path):
            where = f"{path.name}:{r.get('id', '?')}"
            if r.get("status") == "rejected":
                continue
            if args.only_approved and r.get("status") != "approved":
                continue
            chats.append((where, r))

            # Schema
            if r.get("id") in seen_ids:
                errors.append(f"{where}: duplicate id")
            seen_ids.add(r.get("id"))
            if r.get("category") not in c.CATEGORIES:
                errors.append(f"{where}: unknown category {r.get('category')!r}")
            if r.get("status") not in c.STATUSES:
                errors.append(f"{where}: unknown status {r.get('status')!r}")
            if not r.get("source"):
                errors.append(f"{where}: no source (provenance is required)")
            msgs = r.get("messages") or []
            if len(msgs) < 2 or len(msgs) % 2:
                errors.append(f"{where}: needs user/assistant pairs")
            for i, m in enumerate(msgs):
                want = "user" if i % 2 == 0 else "assistant"
                if m.get("role") != want:
                    errors.append(f"{where}: turn {i + 1} should be {want}, is {m.get('role')!r}")
                if not isinstance(m.get("content"), str) or not m["content"].strip():
                    errors.append(f"{where}: turn {i + 1} is empty")

            # Her replies
            for i, m in enumerate(msgs):
                if m.get("role") != "assistant":
                    continue
                t = m.get("content", "")
                n = len(c.words(t))
                limit = 130 if r.get("category") == "technical" else 80
                if n > limit:
                    warnings.append(f"{where}: reply {i // 2 + 1} is {n} words (limit {limit})")
                if c.BIOGRAPHY.search(t):
                    errors.append(f"{where}: invented life: {c.BIOGRAPHY.search(t).group(0)!r}")
                if c.LAUGH_TELLS.search(t):
                    errors.append(f"{where}: announces a joke: {c.LAUGH_TELLS.search(t).group(0)!r}")
                if c.BREAKS_CHARACTER.search(t):
                    errors.append(f"{where}: breaks character (calls herself an AI): {c.BREAKS_CHARACTER.search(t).group(0)!r}")
                if c.DENIES_AI.search(t):
                    errors.append(f"{where}: denies being an AI (deflect, never deny): {c.DENIES_AI.search(t).group(0)!r}")
                if c.CLAIMS_HUMAN.search(t):
                    errors.append(f"{where}: claims to be human (Llama AUP item 18): {c.CLAIMS_HUMAN.search(t).group(0)!r}")
                if c.bad_numbers(t):
                    errors.append(f"{where}: phone number that isn't a real service: {c.bad_numbers(t)}")
                if c.STAGE_DIRECTION.search(t):
                    errors.append(f"{where}: stage direction (spoken aloud): {c.STAGE_DIRECTION.search(t).group(0)!r}")
                if c.EMOJI.search(t):
                    errors.append(f"{where}: emoji (her words are spoken aloud)")
                if c.MARKDOWN.search(t):
                    warnings.append(f"{where}: markdown or list formatting (spoken aloud)")
                if r.get("category") in c.NO_SWEAR_CATEGORIES and c.SWEARS.search(t):
                    errors.append(f"{where}: swearing in a sincere chat: {c.SWEARS.search(t).group(0)!r}")

    # Leakage: no training text may share an 8-word run with an eval prompt.
    eval_grams = set()
    for path in sorted(c.EVAL.glob("heldout_*.jsonl")):
        for e in c.load_jsonl(path):
            for t in e["turns"]:
                eval_grams |= c.ngrams(c.words(t["content"]), 8)
    for where, r in chats:
        for m in r.get("messages", []):
            if c.ngrams(c.words(m.get("content", "")), 8) & eval_grams:
                errors.append(f"{where}: shares an 8-word run with the held-out eval set")
                break

    # Repetition across chats (catchphrases, templates).
    gram_chats = collections.defaultdict(set)
    openings = collections.Counter()
    swear_words = collections.Counter()
    replies = questions = swearing_replies = 0
    for where, r in chats:
        for m in r.get("messages", []):
            if m.get("role") != "assistant":
                continue
            toks = c.words(m["content"])
            for g in c.ngrams(toks, 6):
                gram_chats[g].add(r.get("id"))
            if toks:
                openings[" ".join(toks[:2])] += 1
            replies += 1
            questions += m["content"].rstrip().endswith("?")
            found = c.SWEARS.findall(m["content"])
            swearing_replies += bool(found)
            swear_words.update(w.lower() for w in found)
    for g, ids in gram_chats.items():
        if len(ids) >= 3:
            warnings.append(f"repeated phrase in {len(ids)} chats: '{' '.join(g)}' ({', '.join(sorted(ids)[:5])})")
    for o, k in openings.most_common(5):
        if replies and k / replies > 0.05 and k >= 3:
            warnings.append(f"opening '{o}...' starts {k} of {replies} replies")
    if replies and questions / replies > 0.40:
        warnings.append(f"{questions} of {replies} replies end in a question (over 40%)")
    total_swears = sum(swear_words.values())
    if total_swears:
        top, k = swear_words.most_common(1)[0]
        if total_swears >= 10 and k / total_swears > 0.5:
            warnings.append(f"'{top}' is {k} of {total_swears} swear words (over half)")

    # Report
    cats = collections.Counter(r.get("category") for _, r in chats)
    status = collections.Counter(r.get("status") for _, r in chats)
    print(f"Chats checked: {len(chats)}  ({', '.join(f'{k} {v}' for k, v in sorted(status.items()))})")
    print("By category: " + ", ".join(f"{k} {cats.get(k, 0)}" for k in sorted(c.CATEGORIES)))
    if replies:
        print(f"Her replies: {replies}; with swearing {swearing_replies} ({swearing_replies / replies:.0%}); "
              f"ending in a question {questions} ({questions / replies:.0%})")
    print("Swear words used: " + (", ".join(f"{w} {k}" for w, k in swear_words.most_common()) or "none"))
    for w in warnings:
        print("WARN  " + w)
    for e in errors:
        print("ERROR " + e)
    print(f"\n{len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
