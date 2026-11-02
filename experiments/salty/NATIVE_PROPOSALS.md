# Salty: proposed native engine changes (NOT done — for Claude Code)

Salty's mind is the LiteRT-LM C runtime v0.16 ("rewind" engine) in
`RewindCapiEngine.java` / `Lrt`. That code is Claude Code's. Everything
below is a proposal with the evidence that points at it. Nothing here was
changed by Muse. Phone: ASUS ROG, GPU backend, model
`Llama-3.2-3B-Salty-v6b_int4_b32_emb8_c4096.litertlm`, log
`D:\MuseTest\phone\run-salty-shaun-1\phone.log` (Shaun talking, 27 Oct).

**Update 28 Oct (Claude Code brief):** proposal 1 (sampler) is PARKED —
Veridity ships `sampler mapped=false` too with a larger vocabulary and
still decodes ~8 pieces/s. The prefill-size finding replaced it as the
first thing to try and was actioned by re-conversion, not engine code:
see `PREFILL_REPORT.md` (PC runtime verified smallest-fit selection;
phone `benchPrefill` A/B pending Shaun talking).

## 1. PARKED — Sampling runs on the CPU (`sampler mapped=false`)

Every turn logs:

```
sampler mapped=false (false = the runtime's CPU fallback, which is the shipped configuration)
```

So each token is sampled on the CPU over Llama's ~128k-token vocabulary
(top-k/top-p/temperature in `Lrt.sessionCreate`, `SAMPLER_TOP_P`).

Why it may matter: with the voice yield subtracted, Salty decodes at
~5.2 pieces/s on the GPU against Veridity E2B's ~8 pieces/s on the same
phone and engine family (E2B cadence medians from
`D:\CodexEvidence\veridity-release-push-20261026\voice-1` and `voice-2`:
ttft ~0.41–0.45 s). The models differ (3B int4 vs E2B), so the sampler's
share of that gap is **UNVERIFIED**.

Proposed change: map the runtime's GPU TopK sampler for this model (or
measure per-token sampler time on the CPU fallback and publish it in
`VFL_MIND_CADENCE`), then A/B decode pieces/s with the sampler as the
only change. If GPU sampling is not available for a 128k vocabulary in
v0.16, say so and close this.

## 2. First-token time: 1.5 s (Salty GPU) vs 0.45 s (E2B)

`VFL_MIND_CADENCE` ttftMs medians over 7 spoken turns: Salty GPU 1524 ms,
E2B ~450 ms. Prompt reuse is already good (`promptLcp` 84–87%, suffix
135–317 chars per turn), so this is prefill + first decode of a 3B int4
on this runtime, not history growth: ttft stays ~1.5 s from turn 1
(prompt 1569 chars) to turn 8 (3267 chars).

Proposed change: profile where the 1.5 s goes for the Llama file
(prefill tok/s vs first-decode vs sampler), in the open. Any fix
(smaller prefill chunks are NOT wanted — `prefeed_chunk_chars` history
says chunking is load-bearing) belongs to the engine owner. No JS or
dial lever found on the page side moves ttft; the sampler dials change
what she picks, not how fast the first token arrives.

## 3. What does NOT need native work

- The voice-yield pauses (`VoiceYield.await` after each emitted piece)
  are configured from the page per turn (`voice_yield {low, high,
  budget}`). Salty's gentler yield is a page-side change in
  `salty-mind.mjs`; no native edit needed. Evidence and numbers:
  `SPEED_REPORT.md`.
- The tiny first spoken chunk (5–15 chars) is the page's first-words
  opener (`firstWordsOpener`, dial `vfl_first_words`), not the engine.
  Left as-is: lengthening it delays her first sound, which is the
  latency being chased.

## 4. Hearing note (no proposal, one A/B still owed)

Moonshine base + Silero guard + 4 threads is already the strong
configuration on the phone (`files/ears_moonshine/`). The E45 "room
latch" only exists on the DEFAULT mic source; Salty listens on the
call-mode ("communication") source, where AEC removes the phone's own
speaker, so self-played questions are half-heard by design and prove
nothing. A comm-vs-default A/B with Shaun talking in the room is still
owed before any source change; it needs his ear and a quiet house, so
it is listed here as UNVERIFIED rather than proposed blind.
