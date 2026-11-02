"""Run the held-out eval set against Salty Q4_0 serving on the phone's
Hexagon NPU (llama-server, --device HTP0), replicating run_eval.py's
prompt rendering, sampler and row format so auto_metrics.py can score it
against the LiteRT arms.

Prereqs: llama-server running on device with the GGUF, adb forward
tcp:38199 tcp:38199. Usage:
  python run_eval_npu.py --arm NPUQ4-salty-v7a
"""
import argparse
import json
import re
import time
import urllib.request
from pathlib import Path

import common as c


def salty_facts(text):
    """Python replica of salty-mind.mjs saltyFacts (measurement only)."""
    t = text or ""
    if not (re.search(r"\?", t) or re.match(r"\s*(what|how|when|if)\b", t, re.I)):
        return None
    def fmt(n):
        return str(int(n)) if float(n).is_integer() else str(round(n, 2))
    clock = re.search(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?\b", t, re.I)
    dur = (re.search(r"(\d+)\s*hours?\s*(?:and\s*)?(\d+)?\s*min(?:ute)?s?", t, re.I)
           or re.search(r"in\s+(\d+)\s*min(?:ute)?s?\b", t, re.I)
           or re.search(r"takes\s+(\d+)\s*min(?:ute)?s?\b", t, re.I))
    if clock and dur:
        h = int(clock.group(1)) % 12 + (12 if (clock.group(3) or "").lower() == "pm" else 0)
        start = h * 60 + int(clock.group(2))
        if dur.group(2):
            add = int(dur.group(1)) * 60 + int(dur.group(2))
        elif "hour" in dur.group(0).lower():
            add = int(dur.group(1)) * 60
        else:
            add = int(dur.group(1))
        end = (start + add) % 1440
        eh, em = divmod(end, 60)
        shown = f"{(eh + 11) % 12 + 1}:{em:02d}{'pm' if eh >= 12 else 'am'}"
        return f"{clock.group(1)}:{clock.group(2)}{(clock.group(3) or '').lower()} + {re.sub(r'^in ', '', dur.group(0), flags=re.I)} = {shown}"
    pct = re.search(r"(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d[\d,]*(?:\.\d+)?)", t, re.I)
    if pct:
        return f"{pct.group(1)}% of {pct.group(2)} = {fmt(float(pct.group(1)) * float(pct.group(2).replace(',', '')) / 100)}"
    miles = re.search(r"(\d+(?:\.\d+)?)\s*miles?\b", t, re.I)
    if miles and re.search(r"kilo|km\b", t, re.I):
        return f"{miles.group(1)} miles = {float(miles.group(1)) * 1.60934:.1f} km"
    b = re.search(r"(-?\d[\d,]*(?:\.\d+)?)\s*(\+|-|×|x|\*|/|÷|plus|minus|times|multiplied by|divided by)\s*(-?\d[\d,]*(?:\.\d+)?)", t, re.I)
    if b:
        a, bb = float(b.group(1).replace(",", "")), float(b.group(3).replace(",", ""))
        op = b.group(2).lower()
        if op in ("+", "plus"): sym, val = "+", a + bb
        elif op in ("-", "minus"): sym, val = "−", a - bb
        elif op in ("/", "÷", "divided by"): sym, val = "÷", (a / bb if bb else float("nan"))
        else: sym, val = "×", a * bb
        if val == val:
            return f"{fmt(a)} {sym} {fmt(bb)} = {fmt(val)}"
    return None

SERVER = "http://127.0.0.1:38199/completion"
SAMPLER = {"temperature": 0.6, "top_p": 0.9, "top_k": 50}


def render(system, earlier, prompt):
    out = ["<|begin_of_text|>"]
    out.append("<|start_header_id|>system<|end_header_id|>\n\n"
               "Cutting Knowledge Date: December 2023\n\n" + system.strip() + "<|eot_id|>")
    for t in earlier:
        out.append(f"<|start_header_id|>{t['role']}<|end_header_id|>\n\n{t['content'].strip()}<|eot_id|>")
    out.append(f"<|start_header_id|>user<|end_header_id|>\n\n{prompt.strip()}<|eot_id|>")
    out.append("<|start_header_id|>assistant<|end_header_id|>\n\n")
    return "".join(out)


def complete(prompt_text, seed):
    body = json.dumps({
        "prompt": prompt_text, "temperature": SAMPLER["temperature"],
        "top_p": SAMPLER["top_p"], "top_k": SAMPLER["top_k"], "seed": seed,
        "n_predict": 256, "stream": True, "cache_prompt": False,
    }).encode()
    req = urllib.request.Request(SERVER, data=body,
                                 headers={"Content-Type": "application/json"})
    first = None
    parts = []
    start = time.time()
    with urllib.request.urlopen(req, timeout=300) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            chunk = json.loads(line[5:])
            text = chunk.get("content", "")
            if text and first is None:
                first = time.time() - start
            parts.append(text)
            if chunk.get("stop"):
                break
    return "".join(parts).strip(), (first or 0), time.time() - start


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", default="NPUQ4-salty-v7a")
    ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2])
    ap.add_argument("--facts", action="store_true", help="append saltyFacts note (as the app does)")
    args = ap.parse_args()

    system = c.system_prompt()
    items = c.load_jsonl(c.EVAL / "heldout_v1.jsonl")
    out = c.EVAL / "runs" / f"{args.arm}.jsonl"
    done = set()
    if out.exists():
        done = {(r["id"], r["seed"]) for r in c.load_jsonl(out)}
    todo = [(i, s) for s in args.seeds for i in items if (i["id"], s) not in done]
    print(f"{args.arm}: {len(todo)} replies to generate ({len(done)} done)", flush=True)
    with open(out, "a", encoding="utf-8", newline="\n") as f:
        for n, (item, seed) in enumerate(todo, 1):
            earlier = [{"role": t["role"], "content": t["content"]} for t in item["turns"][:-1]]
            prompt = item["turns"][-1]["content"]
            if args.facts:
                fact = salty_facts(prompt)
                if fact:
                    prompt = f"{prompt}\n\n(Worked out for you: {fact}.)"
            reply, first, total = complete(render(system, earlier, prompt), seed)
            row = {"arm": args.arm, "id": item["id"], "group": item["group"], "seed": seed,
                   "reply": reply, "first_token_s": round(first, 3), "total_s": round(total, 3),
                   "model": "Llama-3.2-3B-Salty-v7a-Q4_0.gguf (llama.cpp HTP0)",
                   "system": system, "sampler": SAMPLER}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            print(f"[{n}/{len(todo)}] {item['id']} s{seed} {total:.1f}s: {reply[:90]!r}", flush=True)


if __name__ == "__main__":
    main()
