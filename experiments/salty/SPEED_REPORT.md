# Salty speed report — 29 Oct 2026

## What Shaun felt

After he stopped speaking, she took too long to start her reply.

## Before (Shaun's own mic turns, same day, phone log)

Clock: `EARLY_BEGIN` (her ear decided he had finished) to `VFL_PLAYBACK_START -b1` (her first sound).

| Turn | First token (TTFT) | First token → first sound | Ear-done → first sound |
|---|---|---|---|
| 5 ("Can you swim in the tank?") | 1.94 s | 4.47 s | 6.41 s |
| 6 | 2.21 s | 1.98 s | 4.19 s |
| 8 | 1.34 s | 1.25 s | 2.60 s |
| 13 | 0.90 s | 1.59 s | 2.50 s |

TTFT across the session's completed turns: 0.90–2.66 s (median ~1.94 s).
`VFL_MIND_CADENCE` also showed `voiceYieldMs` 1486–3006 ms per reply and `maxGapMs` up to 2408 ms.

## Cause

GPU contention, new with the 3D tank. The tank's WebGL canvas rendered flat-out on the
same GPU her LiteRT mind decodes on and her Pocket TTS voice synthesises with. The worst
turn's first token arrived at 1.94 s, yet the first `speakStreaming` call only left the
page 3.84 s later: generation kept stalling (`stallCount` 14–33 per reply) while the GPU
was shared three ways. Sampler dials were checked and are already Salty's
(0.6 / 50 / 0.9). Ears endpointing was not the problem: the mind starts on the early
gate before the final transcript lands.

## Change (one file, Salty-only)

`app/public/salty-tank.mjs`: while a turn is under way and she is not yet making sound,
the 3D canvas is paused (`setPaused(turn && !speaking)`). She holds her pose; the GPU
belongs to her mind and voice. The moment her voice starts, rendering resumes, so her
mouth still animates while she talks. No native code, no dial changes, Gemma path
untouched (the tank only exists when the Salty mind is loaded).

## After (4 typed boot-gate turns, fresh install of the fixed build)

| Turn | TTFT | First token → first sound |
|---|---|---|
| 1 | 1.68 s | 0.85 s |
| 2 | 0.96 s | 0.75 s |
| 3 | 0.95 s | 0.85 s |
| 4 | 1.05 s | 0.86 s |

Warm TTFT ~1.0 s; first spoken chunk now leaves the page ~0.35 s after the first token.
`voiceYieldMs` fell to 460–1915 ms and `maxGapMs` to 400–942 ms on these turns.
Typed turns skip her ears, so the like-for-like mic figure Shaun will feel is roughly:
endpoint remainder + ~1.0 s (think) + ~0.8 s (voice start). UNVERIFIED as a mic median —
needs Shaun's next conversation to confirm (below).

## Verification

- APK SHA-256 `5b12684cc5f12a4fe6a374cecf989b29b9eea018f4a15efad0fbee2ea6b68f46`
  (`-PvfOldRewindEngine -PvfMetaId`, release distribution web build).
- Boot gate on .meta: install, launch, boot (0 document JS errors), mind, turn,
  darkvoice — GREEN.
- `salty_mind_test`: OK (23 mutations). Tank screenshot after the turns: normal.
- Battery 33–37 °C throughout. Protected apps unchanged (local 2026-08-14 21:10:51,
  .qual 2026-10-25 10:45:59).

## Not done / proposed

- Confirm with Shaun's voice: median ear-done → first sound over 6+ of his turns,
  same kind of test as before. If TTFT still bites, the next lever is native-side
  (proposal only, engine is Claude Code's): prompt prefix reuse was 43%
  (`promptLcp=283/646`) on the worst turn — the sliding history window makes the
  prompt diverge, so prefill redoes work each turn. JS-side history changes would
  trade away her memory of the conversation and were not made.
