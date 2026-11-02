# Training notes: Salty

## What actually happened (27 Oct, gate lifted by Shaun: "i want it done now before going on the phone")

- **Environment:** `~/salty-train-venv` in WSL (Linux filesystem, for speed), made by `setup_train_env.sh`. Axolotl 0.21.0, PyTorch 2.14.1+cu130, transformers 5.20.1, peft 0.21.2; full list in `env-freeze.txt`. `convert-venv` and `litert-venv` untouched. Every Axolotl run goes through `run_axolotl.sh`: telemetry and W&B off, Hugging Face offline.
- **Preprocess check:** the rendered tokens match the runtime template exactly; only her replies (plus their end-of-turn marker) are training targets.
- **Smoke test (10 steps):** 7.6 GiB GPU memory for training (11.9 GiB system-wide including Windows), about 3 s per step, 47 °C. bf16 LoRA fits; no QLoRA needed.
- **v1** (`salty_lora_v1.yml`, 2 epochs, lr 1e-4, 41 steps, 2 min): eval loss 3.29 → 2.36, still falling. Quick look (`v1-quick-sample.txt`): no stage directions, real jokes, but invented a life, half-claimed to be human, kept swearing near a kid, US helpline. Undertrained.
- **v2** (`salty_lora_v2.yml`, 3 epochs, lr 2e-4, 3 min): eval loss bottomed at 2.27 (epoch 2.1), 2.29 at the end. Quick look (`v2-quick-sample.txt`): honest about being an AI, no invented life, Lifeline and 000, tones down for a kid, callback to an earlier joke. Spider-legs maths still wrong (stock is wrong too).
- **Merge:** `runs/salty-v2/merged` (LoRA applied to 196 of 254 tensors; tied embeddings intact; shard 1 SHA256 `2f32c3e6…`, different from Meta's). Plain chat template written into its `tokenizer_config.json`; LICENSE.txt, USE_POLICY.md and NOTICE included.
- **Conversion:** `convert_salty.sh`, same recipe and settings as the stock model, to `convert/out-salty-v2`.

## Original plan (26 Oct)

**Status 26 Oct:** no environment installed, nothing trained, merged or converted.

(Naming note: Axolotl is the training tool. The axolotl character is a coincidence. Nice one.)

## Facts checked from the project files

| Thing | Value | Where from |
|---|---|---|
| Base model | `meta-llama/Llama-3.2-3B-Instruct`, revision `0cb88a4f764b7a12671c53f0838cd831a0843b95` | `convert/Llama-3.2-3B-Instruct/.cache/huggingface/download/*.metadata` |
| Architecture | LlamaForCausalLM, 28 layers, hidden 3072, 24 heads / 8 KV heads, vocab 128,256, **tied embeddings**, bf16 | `config.json` |
| Weights | two safetensors shards, 6.43 GB total; shard 1's SHA256 matches Hugging Face's recorded checksum | `PROVENANCE.md` |
| Tokenizer | `tokenizer.json` + `tokenizer_config.json`; has `<|finetune_right_pad_id|>` for padding; eos `<|eot_id|>` | `tokenizer_config.json` |
| Converter | `litert-torch` 0.10.0 export, recipe `convert/llama_int4_b32_emb8.json`, cache 4096, prefill 128, CPU torch 2.14.1 | `convert/convert.log`, `convert/pip-freeze-after-tf.txt` |
| GPU | RTX 3060 12 GB, visible in WSL; WSL 47 GB RAM; 12 cores | `nvidia-smi` inside WSL, 26 Oct |

## Environment (to create after the gate, not now)

- A new venv in WSL: `/mnt/d/MuseTest/tools/train-venv`. **Never install into `convert-venv`** (CPU-only torch that the converter depends on) or `litert-venv`.
- Contents: CUDA build of PyTorch for the 3060 (Ampere, sm_86, bf16 supported), then Axolotl and its dependencies (`transformers`, `peft`, `trl`, `accelerate`, `bitsandbytes` for the QLoRA fallback). **Pin the exact versions at install time and record `pip freeze` in `train/env-freeze.txt`.**
- Skip flash-attention: building it in WSL is slow and fragile, and the config uses PyTorch's built-in attention (`sdp_attention: true`).
- First commands after install: `python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"` and `axolotl preprocess train/salty_lora_v1.yml --debug` to **check that only her replies are trained on** (the masking printout shows which tokens count) and that the rendered text matches the runtime template exactly.

## Why these settings

- **LoRA rank 16 on all attention and MLP layers.** About 24 million trainable parameters (under 1% of the model). That's enough to change voice and habits without reshaping knowledge, and it's the usual starting point for persona tuning.
- **bf16 LoRA before QLoRA.** Training on the exact bf16 weights we later merge into avoids the small mismatch you get from training on a 4-bit copy. Rough memory guess: about 6.4 GB of weights + under 1 GB for the LoRA and optimiser + activations and logits. That should land around 9–11 GB peak with short chats, but this is **UNVERIFIED**. The smoke test measures it. If it doesn't fit: drop `micro_batch_size` to 2 and raise `gradient_accumulation_steps` to 8; if that fails too, QLoRA.
- **2 epochs, learning rate 1e-4.** With 300–600 short chats, more epochs risks her memorising lines (the memorisation check is the guard). Halve the epochs if the eval shows recited lines.
- **Train only on her replies** (`roles_to_train: assistant`). The user lines are context, not things to learn to say.
- **The system prompt is the short one** in `data/system_prompt.txt`. The app must send exactly that at runtime, or the training doesn't line up.

## Order of work after the gate

1. Install the environment. Record versions.
2. **Smoke test:** `build_train.py --allow-proposed` on the seed chats only, 1 epoch, with `max_steps: 10`. Measure peak VRAM (`nvidia-smi --query-gpu=memory.used --format=csv -l 1` in another window) and seconds per step. Update the time estimate in PLAN.md with real numbers. Throw the smoke-test weights away.
3. Shaun reviews and approves seeds; generate and review the 300–600 chats (Day 2); `validate_dataset.py --only-approved` must pass.
4. Real run. Keep the LoRA adapter (small, tens of MB) as the main output.
5. **Quick check before merging (UNVERIFIED path):** the LiteRT-LM engine has a `lora_rank_config` option, so it may be able to load a LoRA at runtime on top of the stock file. Worth checking, because it would mean one 2.6 GB file plus a small add-on instead of a second full model.
6. Merge: `axolotl merge-lora train/salty_lora_v1.yml` writes a full bf16 Hugging Face folder. Copy LICENSE.txt and USE_POLICY.md, and add a NOTICE file (see `LICENCE_NOTES.md`). Check `tie_word_embeddings` is still true.
7. **Put the plain chat template into the merged model's `tokenizer_config.json`.** The converter packs that template into the `.litertlm`, so the salty file would stop asking for JSON function calls by itself.
8. Reconvert with the same command, recipe and cache length as 26 Oct (`convert/convert.log`), to `models/llama-3.2-3b-salty-v1/`. Look into the dropped-last-punctuation glitch in the same run: the odd stop markers like `.<|eot_id|>` come from the conversion.
9. Run the eval (`run_eval.py --arm C-salty-v1`), then `auto_metrics.py`, then a blind sheet with `make_blind.py`. Apply the pass bar in `eval/RUBRIC.md`.

## Risks and unknowns

- **12 GB might be tight** (UNVERIFIED until the smoke test). The fallbacks are above.
- **Axolotl version churn.** Config keys change between releases (`chat_template_jinja`, `roles_to_train`, `train_on_eos`). Confirm against the installed version's docs and `preprocess --debug`, not this file.
- **Template mismatch** between training and runtime would quietly weaken everything. `preprocess --debug` plus one side-by-side render is the check.
- **The data is the real risk, not the GPU.** A 3B model copies its training lines easily. The memorisation check (8-word runs flagged, 12 fail) and blind scoring are the guards.
- **Capability loss.** Small persona LoRAs usually leave knowledge alone, but the stock model already fails the spider-legs question, so watch the capability items closely.
- **WSL file speed:** training data and outputs on `/mnt/d` are slower than the Linux filesystem. That's fine at this size; move the HF cache to the Linux side only if loading is painfully slow.
- **Conversion memory peak 41.7 GB.** Don't train and convert at the same time.
