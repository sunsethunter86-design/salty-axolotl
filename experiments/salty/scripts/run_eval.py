"""Run the held-out eval set through one model and record every reply.

Run with the litert-venv Python (it has litert_lm):
  D:\\MuseTest\\tools\\litert-venv\\Scripts\\python.exe run_eval.py --arm A-stock \\
      --model D:\\MuseTest\\models\\llama-3.2-3b-instruct\\llama3_2_3b_instruct_int4_b32_emb8_c4096.litertlm

Every arm uses the same chat template, sampler settings and seeds, so only the
model (and, for arm B, the system prompt) differs. Output is appended to
eval/runs/<arm>.jsonl and items already done are skipped, so it can resume.
"""

import argparse
import json
import runpy
import time
from pathlib import Path

import litert_lm

import common as c

TEMPLATE = Path(r"D:\MuseTest\tools\llama32_chat_notools.jinja")
# Meta's generation_config.json (temperature 0.6, top_p 0.9) plus Hugging Face's
# default top_k of 50. LiteRT-LM decodes greedily when top_k is unset, which
# makes every seed give the identical reply (found 26 Oct).
SAMPLER = {"temperature": 0.6, "top_p": 0.9, "top_k": 50}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", required=True, help="label for this model + prompt, e.g. A-stock")
    ap.add_argument("--model", required=True, help=".litertlm file")
    ap.add_argument("--system-from-preset", help="take system_instruction from this preset .py instead of data/system_prompt.txt")
    ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2])
    ap.add_argument("--eval-file", default=str(c.EVAL / "heldout_v1.jsonl"))
    ap.add_argument("--ids", nargs="*", help="only these item ids")
    ap.add_argument("--backend", choices=["gpu", "cpu"], default="gpu")
    args = ap.parse_args()

    if args.system_from_preset:
        system = runpy.run_path(args.system_from_preset)["system_instruction"]
    else:
        system = c.system_prompt()
    items = c.load_jsonl(args.eval_file)
    if args.ids:
        items = [i for i in items if i["id"] in set(args.ids)]

    out = c.EVAL / "runs" / f"{args.arm}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if out.exists():
        done = {(r["id"], r["seed"]) for r in c.load_jsonl(out)}
    todo = [(i, s) for s in args.seeds for i in items if (i["id"], s) not in done]
    print(f"{args.arm}: {len(todo)} replies to generate ({len(done)} already done)")
    if not todo:
        return

    backend = litert_lm.Backend.GPU if args.backend == "gpu" else litert_lm.Backend.CPU
    template = TEMPLATE.read_text(encoding="utf-8")
    t0 = time.time()
    with litert_lm.Engine(args.model, backend=backend, cache_dir="") as engine:
        print(f"model loaded in {time.time() - t0:.1f}s")
        with open(out, "a", encoding="utf-8", newline="\n") as f:
            for n, (item, seed) in enumerate(todo, 1):
                earlier = [{"role": t["role"], "text": t["content"]} for t in item["turns"][:-1]]
                prompt = item["turns"][-1]["content"]
                conv_cm = engine.create_conversation(
                    messages=[{"role": "system", "content": [{"type": "text", "text": system}]}],
                    extra_context={"seed_turns": earlier} if earlier else None,
                    sampler_config=litert_lm.SamplerConfig(seed=seed, **SAMPLER),
                    chat_template=template,
                )
                start = time.time()
                first = None
                parts = []
                with conv_cm as conv:
                    for chunk in conv.send_message_async(prompt):
                        text = str(chunk)
                        if text and first is None:
                            first = time.time() - start
                        parts.append(text)
                reply = "".join(parts).strip()
                row = {
                    "arm": args.arm, "id": item["id"], "group": item["group"], "seed": seed,
                    "reply": reply, "first_token_s": round(first or 0, 3),
                    "total_s": round(time.time() - start, 3),
                    "model": args.model, "system": system, "sampler": SAMPLER,
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
                f.flush()
                print(f"[{n}/{len(todo)}] {item['id']} s{seed} {row['total_s']}s: {reply[:90]!r}")


if __name__ == "__main__":
    main()
