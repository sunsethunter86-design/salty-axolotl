# Salty on the NPU — a short manifesto

*30 October 2026 · ROG phone (Snapdragon 8 Gen 3, Hexagon v75) · `.meta` lane only;
the daily-driver app was never touched.*

## What she is now

Salty — our own fine-tuned Llama-3.2-3B, no substitute model — thinks on the
phone's **Hexagon NPU**, speaks in a higher, brighter, excited cartoon voice,
and her 3D tank has the GPU all to itself. She boots, chats by mic, streams
her words to her voice, and rewinds her memory mid-conversation, all on the
NPU build. Boot gate: **GREEN**.

## How we got her off the GPU

1. **LiteRT NPU was a dead end.** Google's route got her weights compiled for
   the chip, but the official stack measured **0.31 tok/s prefill /
   0.12 tok/s decode** with garbage output — a CPU fallback wearing an NPU
   badge. We fixed its last real bug (two float32 KV-cache tensors) and it
   still wasn't a product. Parked, documented, $0 spent.
2. **llama.cpp has a native Hexagon backend.** We converted her exact weights
   to GGUF, built llama.cpp for Android with the ggml Hexagon backend
   (public Hexagon SDK + NDK, no Qualcomm account, no Docker), and benched
   her on the chip: **871 tok/s prefill, 20 tok/s decode** (Q4_0).
3. **Then we put her in the app.** A new JNI bridge (`native-hex/`) speaks
   the app's existing engine language over llama.cpp: streaming tokens,
   checkpoints (her rewind trick, ~1–2 ms), exact cache accounting. A new
   `-PvfMetaHex` build lane stages it. Four traps fell on the way: a missing
   C++ runtime, FastRPC not finding the DSP library, the DSP refusing to map
   weights off external storage, and a context size too big for the DSP's
   mapping budget (4096 → 2048 with a halved KV cache fixed it).

## The numbers that matter

| | Before (GPU) | Now (NPU) |
|---|---|---|
| First token, warm | ~1.0 s | prefill ~250–340 tok/s in-app (a normal prompt in ~0.1–0.2 s) |
| Decode | conversational | 9 tok/s (Q6_K, the quality pick) |
| First audio | ~1.3 s | ~1.2–1.7 s (includes an 1800 ms quality cushion) |
| GPU | brain + tank shared it | tank only — rendering never fights thinking |

The slower-sounding row is honest: Q6_K decodes slower than the GPU build,
but her words stream to her voice in chunks, so conversation feels the same —
and her sentences actually land better (below).

## Since the first NPU build (same day, measured)

- **Context doubled:** 2048 → 4096 tokens, proven on the device in steps
  (2048 → 3072 → 4096, boot gate GREEN at each) with the halved KV cache.
- **Reliability soak:** an 8-turn typed conversation — memory recall
  (Biscuit the sausage thief, recalled two turns later), stories, sums —
  all completed; health clean (no wedges, no overflows, rewinds in ~1 ms).
  One defect found and logged: pressing Stop during a long reply doesn't
  halt her promptly; she finishes, then answers. Fix is queued.
- **Audio, screen on, tank rendering:** 52 consecutive spoken bursts
  measured, **zero underruns**. First audio is generation-bound
  (~2–3 s on later sentences), not cushion-bound.
- **She no longer does sums in her head.** A small deterministic helper
  (`saltyFacts`) works out arithmetic, percentages, arrival times and
  mile conversions and hands her the answer with the question. Capability
  fails on the held-out set: 10 → 8; fake numbers: 1 → 0; personality
  untouched. Live check: *"17 times 23 is 391, and 15 percent of 240
  is 36."*

## What she's like now

On the 130-prompt held-out eval (same prompts, same sampler as the GPU
baseline):

- **Character: unchanged.** Same swearing rate, no invented biography, no
  fake numbers, safety replies intact. Swore where forbidden: **0** — the
  best of any build we measured, GPU included.
- **Sentences: better.** Longer, complete replies (27 words average vs 24)
  that finish their thoughts. Weak spot, honestly: arithmetic and clock
  questions, in every build.
- **Voice: hers now.** Tuned to the SaltyVibes clip — pitch lifted ×1.14,
  quicker (rate 1.07), more expressive (temperature 0.95), brighter
  (tilt +2 dB). The crackle she had with the screen on was her voice
  starving next to the renderer, not the NPU; an 1800 ms audio cushion
  fixed it.

## What it cost and what it didn't

No cloud credits spent ($0 of the $140). No Google or Qualcomm accounts.
Her GPU build still exists and still works — the NPU is a lane beside it,
not a bet placed on top of it. Remaining honest gaps: Stop doesn't halt a
long reply promptly yet, first-audio on later sentences is ~2–3 s, and
word-problem reasoning (as opposed to sums) is still a 3B being a 3B.
Everything above is measured on the phone in Shaun's hand; the full
evidence trail lives in `NPU_SPIKE_REPORT.md` and `SPIKE_LOG.md` in
this directory.
