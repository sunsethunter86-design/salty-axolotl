# Salty prefill re-conversion (27–28 Oct)

Brief from Claude Code: the shipped file has only `prefill_128`, so
every short suffix prefill is padded to 128 tokens — a flat ~0.8 s
floor inside her ~1.2 s first-token time. Re-convert with
`--prefill_lengths=[32,128]`, same v6b weights, same recipe.

## Done

- New script `experiments/salty/train/convert_salty_p32.sh` (original
  `convert_salty.sh` untouched as rollback). Only difference:
  `--prefill_lengths=[32,128]`. Input: the same merged v6b folder
  (`train/runs/salty-v6b/merged`). Conversion EXIT=0 in 1899 s.
- New file `models/llama-3.2-3b-salty-v6b-p32/Llama-3.2-3B-Salty-v6b-p32_int4_b32_emb8_c4096.litertlm`,
  3,001,119,552 bytes, SHA256
  `63002f8379e4b43a971d437c86f96851efc959e2b1aeeeb4f14824c130b6f876`.
  Contains both sizes (117 × `prefill_32`, 117 × `prefill_128` by
  binary scan; the old file has `prefill_128` only). Licence/NOTICE/
  USE_POLICY copied beside it.
- On the phone (`.meta` only): pushed beside the old model,
  `mind_model.txt` now names the p32 file. Old file stays on the phone
  — rollback is pointing the dial back, no re-push. Boot verified:
  `ENGINE ready backend=gpu`, model = p32 file, sampler unchanged
  (`topK=50 topP=0.9 temp=0.6`). Protected apps re-read unchanged
  (`.local` 2026-08-14, `.qual` 2026-10-25). Screen left off.

## Does v0.16 pick the smallest prefill? (was UNVERIFIED)

Verified on the PC's LiteRT-LM 0.16 runtime (`litert-lm benchmark`,
CPU backend — PC numbers are NOT phone numbers):

| Prefill | Old (128 only) | p32 (32,128) |
|---|---|---|
| 20 tokens | 3.24 tok/s, TTFT 6.60 s | **7.60 tok/s, TTFT 3.05 s** |
| 100 tokens | 16.68 tok/s, TTFT 6.41 s | 15.63 tok/s, TTFT 6.83 s |

20-token prefill more than halved in time; 100-token (needs the 128
size) unchanged within noise. So the runtime picks the smallest size
that fits and does not error on several sizes. The phone's rewind
engine is the same runtime family but its own build — the phone
`benchPrefill` A/B is still the deciding measurement.

## Phone, muted typed turns (28 Oct, house asleep)

Same six questions as `run-salty-shaun-4`, typed (volume 0, replies
still synthesised). Typed turns only work after the app has settled
(~90 s after ENGINE_READY; sending during boot prep wedges the page's
turn queue — Veridity typed-path behaviour, not the model). Log:
`phone/run-salty-shaun-5-p32/phone-muted.log`. Route append throughout.

| Turn (question) | benchPrefill | Prefill time | ttftMs |
|---|---|---|---|
| Feeling? | 15tok@24 | 0.63 s | 950 |
| Axolotl story | 25tok@41 | 0.61 s | 1007 |
| Thinking about? | 18tok@28 | 0.64 s | 1013 |
| What else? | 13tok@21 | 0.62 s | 993 |
| Fish tank | (turn 6) | — | 1184 |

Old file, spoken turns: 13–50 tok all ≈ **0.80 s** flat (e.g.
50tok@60). New file: ≈ **0.62 s** for 13–25 tok — the runtime picks
prefill_32 on the phone too, and the floor drops ~0.18 s (~22%), not
to zero: a 32-token graph still runs, plus fixed call costs. Median
typed ttft 993 ms. Underruns 2 events in one utterance, rest 0.
Replies on-topic, in character (same six answers as the spoken run —
same continuing history, so she largely repeated herself, which is
also content-stability evidence across the file change).

## Phone A/B spoken: PENDING Shaun talking

Ear→first sound needs his voice (never self-play). Targets from the
brief were estimates: ttft 0.6–0.7 s is NOT reached on typed turns
(~1.0 s); whether spoken early turns do better, and whether
ear→sound reaches ≤2.0 s, waits for the talking run.

Targets from the brief (estimates, not measured): benchPrefill for
13–50-token suffixes well under 0.8 s, ttft toward 0.6–0.7 s,
ear→first sound ≤2.0 s, replies unchanged (same weights and sampler).

## Phone A/B spoken: DONE (28 Oct, 10:50, Shaun talking)

Same six questions, p32 model, plus the side-jobs fix and the mouth/tank changes. Log: `phone/run-salty-shaun-5-p32/phone-spoken.log`. Measured by Claude Code with one method for all three runs: `EARLY_BEGIN` to the first `VFL_PLAYBACK_START …-b1` line. (Muse's figure for run 4 was 2.39 s; this method gives 2.25 s.)

| Run | Ear → first sound (median, per turn) | First token (median) | Voice underruns |
|---|---|---|---|
| shaun-1 (27 Oct, start) | 2.70 s (1.98–3.14) | 1524 ms | 2/27 utts |
| shaun-4 (27 Oct, sampler + yield) | 2.25 s (1.98–2.46) | 1217 ms | 5/29 utts |
| **shaun-5 (28 Oct, p32 + no side jobs)** | **1.92 s (1.85–2.07)** | **958 ms** | **0/25 utts** |

- **The 2.0 s target is met** on the median, with 4 of 6 turns under 2.0 s.
- `benchPrefill` was 13–25 tokens at ~0.62–0.65 s.
- 6/6 questions were heard word for word.
- 0 background jobs reached her mind.
- Biggest in-reply gap: median ~0.6 s (was ~0.82 s).

**Her words:**
- "Fine, thanks for asking… and I've just won the argument about the pickles on the pizza"
- "Axolotls… we're also the only amphibians that keep their eggs inside them their whole lives. I'm living proof" (biology wrong; that's character)
- "The people who've ever had to read a recipe for Axolotl Surprise Cake…"

**Watch:** this chat continued a long history (prompt 4.4k → 5.9k chars). She brought back "Axolotl Surprise Cake" in 4 of 6 replies. That's the long-chat repetition already flagged for Shaun's decision (a Salty history cap).
