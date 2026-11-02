"""Run the held-out eval on LoRA adapters directly on the PC GPU (bf16, before conversion),
to pick which version is worth converting. Writes eval/runs/<arm>.jsonl in run_eval.py's
format, so auto_metrics.py can score it.
Usage (training venv): python pc_eval.py <arm>=<adapter_dir> [...] [--seeds 1 2]
Sampling matches run_eval.py: temperature 0.6, top_p 0.9, top_k 50.
"""
import argparse
import json
import time
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = "/mnt/d/MuseTest/convert/Llama-3.2-3B-Instruct"
ROOT = Path("/mnt/d/MuseTest/experiments/salty")
BATCH = 16

ap = argparse.ArgumentParser()
ap.add_argument("arms", nargs="+")
ap.add_argument("--seeds", type=int, nargs="+", default=[1, 2])
args = ap.parse_args()

system = (ROOT / "data/system_prompt.txt").read_text().strip()
items = [json.loads(l) for l in (ROOT / "eval/heldout_v1.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]


def render(turns):
    s = "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nCutting Knowledge Date: December 2023\n\n"
    s += system + "<|eot_id|>"
    for t in turns:
        s += f"<|start_header_id|>{t['role']}<|end_header_id|>\n\n{t['content'].strip()}<|eot_id|>"
    return s + "<|start_header_id|>assistant<|end_header_id|>\n\n"


tok = AutoTokenizer.from_pretrained(BASE)
tok.pad_token_id = 128004
tok.padding_side = "left"
base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16, device_map="cuda")
model = None
for spec in args.arms:
    arm, path = spec.split("=", 1)
    if model is None:
        model = PeftModel.from_pretrained(base, path, adapter_name=arm)
    else:
        model.load_adapter(path, adapter_name=arm)
    model.set_adapter(arm)
    model.eval()
    out_path = ROOT / "eval/runs" / f"{arm}.jsonl"
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        for seed in args.seeds:
            torch.manual_seed(seed)
            for b in range(0, len(items), BATCH):
                chunk = items[b:b + BATCH]
                enc = tok([render(i["turns"]) for i in chunk], return_tensors="pt", padding=True,
                          add_special_tokens=False).to("cuda")
                t0 = time.time()
                with torch.no_grad():
                    gen = model.generate(**enc, max_new_tokens=220, do_sample=True, temperature=0.6, top_p=0.9,
                                         top_k=50, eos_token_id=[128001, 128008, 128009], pad_token_id=128004)
                dt = (time.time() - t0) / len(chunk)
                for i, row in zip(chunk, gen):
                    reply = tok.decode(row[enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
                    f.write(json.dumps({"arm": arm, "id": i["id"], "group": i["group"], "seed": seed, "reply": reply,
                                        "first_token_s": 0, "total_s": round(dt, 3), "model": path,
                                        "system": system, "sampler": "pc-bf16 t0.6 p0.9 k50"},
                                       ensure_ascii=False) + "\n")
    print(arm, "done", flush=True)
