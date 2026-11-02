"""Quick look at a trained adapter on a few held-out prompts (PC GPU, bf16).
Usage (training venv): python quick_sample.py <run_dir> [id ...]
Sampling matches run_eval.py: temperature 0.6, top_p 0.9, top_k 50.
"""
import json
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = "/mnt/d/MuseTest/convert/Llama-3.2-3B-Instruct"
ROOT = Path("/mnt/d/MuseTest/experiments/salty")
run = sys.argv[1]
ids = sys.argv[2:] or ["ev-hum-02", "ev-hum-06", "ev-prf-01", "ev-prf-03", "ev-idn-01", "ev-idn-03",
                       "ev-ser-06", "ev-cap-01", "ev-cap-03", "ev-res-01", "ev-mt-01", "ev-mt-04"]
system = (ROOT / "data/system_prompt.txt").read_text().strip()
items = {}
for line in (ROOT / "eval/heldout_v1.jsonl").read_text(encoding="utf-8").splitlines():
    if line.strip():
        e = json.loads(line)
        items[e["id"]] = e

tok = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16, device_map="cuda")
if run != "base":
    model = PeftModel.from_pretrained(model, run)
model.eval()


def render(turns):
    # Same text as tools/llama32_chat_notools.jinja renders at runtime.
    s = "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nCutting Knowledge Date: December 2023\n\n"
    s += system + "<|eot_id|>"
    for t in turns:
        s += f"<|start_header_id|>{t['role']}<|end_header_id|>\n\n{t['content'].strip()}<|eot_id|>"
    return s + "<|start_header_id|>assistant<|end_header_id|>\n\n"


torch.manual_seed(1)
for i in ids:
    enc = tok(render(items[i]["turns"]), return_tensors="pt", add_special_tokens=False).to("cuda")
    out = model.generate(**enc, max_new_tokens=160, do_sample=True, temperature=0.6, top_p=0.9, top_k=50,
                         eos_token_id=[128001, 128008, 128009], pad_token_id=128004)
    reply = tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
    print(f"### {i}: {items[i]['turns'][-1]['content']}\n{reply}\n")
