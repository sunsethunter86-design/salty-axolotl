# Salty NPU spike — log (29 Oct 2026)

Goal: run Salty's own Llama-3.2-3B fine-tune (salty-v7a merged weights) on the
ROG's Snapdragon 8 Gen 3 Hexagon (SM8650, HTP v75), standalone harness first.
No Gemma anywhere in this path — the competition model or nothing.

## Toolchain (all local, no credits spent)

- WSL Ubuntu + `tools/convert-venv` (litert-torch 0.10.0, ai_edge_litert 2.3.0,
  litert_lm_builder 0.18.1) — the same venv that built her GPU `.litertlm`.
- Pipeline: litert-torch experimental `npu_export` stages
  (export → calibrate → SRQ quantize → QNN AOT compile), config
  `salty_sm8650.json` (cache_length 1024 for the spike, prefill [128]).
- QAIRT 2.47.0.260601 SDK (2.35 GB, Qualcomm public zip) for device libraries.
- Phone harness: community build of LiteRT-LM `litert_lm_advanced_main`
  v0.18.0 (android arm64) + LiteRT v2.2.0 release dispatch library (v75) +
  QAIRT libs, staged at `/data/local/tmp/npu` (nothing installed).

## Stage results

1. **Export** — OK. `out/exported/model.litertlm` (3.6 GB, dynamic wi8).
   First attempt died on config validation (`calibration_dataset_dir` must be
   named at export); fixed in the driver.
2. **Calibrate (profiler-based)** — ran, but recorded only 955 tensors and
   only the last layer's KV-cache stats. Quantize then died in KV alignment
   (`KeyError: 'prefill_128_kv_cache_k_0'`, then module-path tensor names).
   Cloning/placeholder patches got alignment through but materialisation kept
   hitting unrecorded tensors (840 placeholders) — abandoned as unsound.
3. **Calibrate (min-max, `use_profiler_based_calibration: false`)** — OK.
   Recorded **3,926 tensors**.
4. **Quantize (SRQ)** — **OK, clean**: zero missing tensors, no patches needed.
   `out/model_srq.litertlm` (3.6 GB).
5. **Compile (QNN AOT, SM8650)** — **SEGFAULT** in the Qualcomm compiler
   plugin composing the 3.2 GB prefill/decode graph (PC, return -11).
   The same graph segfaults the on-device JIT compiler at
   `Composing graph` / `qnn_partition_0` (phone, 24 GB RAM), after both
   subgraphs partition 100% to HTP. Missing piece found en route:
   `ai-edge-litert-sdk-qualcomm` had to be installed into the venv before
   the plugin could find its QNN host libraries at all.
   Full write-up: `NPU_SPIKE_REPORT.md`.

Lesson recorded: for this pipeline, profiler-based calibration is the wrong
mode for a 3B Llama; min-max calibration is the one that records what the
quantizer needs.

## Still unknown until the phone run

- tok/s and first-token time on HTP vs her GPU build (~1.0 s warm TTFT,
  ~1.8 s to first sound in conversation).
- Output quality of the SRQ export (eval sets in experiments/salty decide).
- Whether LiteRT-LM session checkpoints (her rewind trick) work on the NPU
  backend — engine-integration question, not this spike.
- cache_length is baked into the compiled bundle (1024 in this spike;
  production would compile 4096 and re-check the decode-mask size warning
  from the upstream notes).

## 30 Oct 2026 � KV dtype fix + measured bench

- Root cause nailed: prefill tensors 54/55 (kv_cache_k_27/v_27) have NO consumer op in the prefill graph; ai_edge_quantizer emits no transformation for unused tensors, leaving them FLOAT32 with no quant params. All other KV inputs feed an op and became INT16.
- Fix in run_npu_export.py stage 3: wrap ModelModifier._serialize_model/_serialize_small_model to force those tensors INT16 with decode's quant params on the quantizer's ModelT before external-buffer serialization. Log line: KV-DTYPE fixed to INT16: ['prefill_128_kv_cache_k_27', 'prefill_128_kv_cache_v_27']. Bundle rebuilt at identical 2,029,064,190 bytes; intermediate +64 bytes. Object-API repack of the finished tflite drops external buffers (22 MB) � do not retry.
- Pushed to /data/local/tmp/npu/model_i4.litertlm. Conversational run: executes end-to-end, ~430 s generation, output 'value' (garbage).
- Benchmark (128 prefill / 32 decode): TTFT 423.20 s, prefill 0.31 tok/s, decode 0.12 tok/s, Init Executor 473,670 ms. Aux ElementWiseSelect x56 QNN validation fails (error 3110) -> XNNPACK fallback; runtime q::Select.exe Crouton Uint8/Uint16 prepare failure.
- Verdict NO-GO; GPU build remains the entry. Protected app com.veridity.flow.local untouched (2026-08-14 21:10:51).  credits spent.

## 30 Oct 2026 � llama.cpp Hexagon route: GO

- Converted salty-v7a merged -> GGUF f16 (6.4GB) -> Q4_0 (1821MiB) + Q8_0 (3421MiB).
- Built llama.cpp master (0893ec9) for Android with GGML_HEXAGON=ON, OpenCL OFF, Hexagon SDK 6.7.0.0 + NDK r28b in WSL (no Docker). libggml-htp-v75.so built.
- On ROG (HTP0, -ngl 99): Q4_0 pp128 870.57 t/s, tg64 20.20 t/s. Q8_0 pp128 854.47, tg64 12.13. Real prompt Q4_0: prompt eval 552 t/s, decode 20.02 t/s, load 2.5s, output coherent Salty voice.
- vs LiteRT NPU 0.31/0.12 t/s and GPU ~1.0s warm TTFT. Verdict GO for llama.cpp route; remaining gate is app integration + rewind behaviour. Protected app untouched.  credits.

## 30 Oct 2026 � App integration spike (llama.cpp Hexagon in .meta): GO

- New lane -PvfMetaHex (with -PvfMetaId, no -PvfOldRewindEngine): gradle allows meta+llama, skips F08 integrity, stages hex-jniLibs, sets VF_META_HEX, legacy packaging (extracted libs for FastRPC).
- New bridge app/android/app/native-hex/vfhex_jni.cpp implementing the Lrt JNI facade over current llama.cpp: engine/session, fused generateStream with ChunkSink + terminal error contract, checkpoints via llama seq state, exactCacheTokens, tokenize, benchmarkJson; conversation/debug fail closed. Build: native-hex/build_hex_native.sh.
- Gotchas solved: libc++_shared.so packaged; ADSP_LIBRARY_PATH set from dladdr (FastRPC skel search); GGUF copied to internal storage (fastrpc_mmap cannot map FUSE); n_ctx clamped 8192->4096 (KV mmap crash at 8192; CLI-proven config).
- Device proof (ROG YOUR_DEVICE_SERIAL, .meta only): boot-gate GREEN (install/launch/boot/mind/turn/darkvoice PASS). Health: actualComputeBackend=gpu, gpuDemotionCount=0, engine rewind-llama, runtime llama-hex-0893ec9, prefeed ~300 tok/s (vs ~46 CPU settle), rewinds working (checkpoint-only, ~1-2ms). Protected com.veridity.flow.local untouched (2026-08-14).  credits.
- Limits: n_ctx cap 4096 (service asks 12288), Q4_0 only, media/conversation natives fail closed, checkpoint state copies grow with KV, Salty eval sets not yet run in-app, mic conversation not yet tried by Shaun.

## 30 Oct 2026 � Salty evals on NPU (llama-server HTP0, heldout_v1 130 replies)

- Driver scripts/run_eval_npu.py replays heldout_v1.jsonl exactly like run_eval.py (same system prompt, llama32 template rendering, temp .6/top_p .9/top_k 50, seeds 1-2) against llama-server on the ROG (--device HTP0). Arms: NPUQ4-salty-v7a, NPUQ8-salty-v7a (eval/runs/*.jsonl). Scored with auto_metrics.py alongside C-salty-v6b/v7a/v7b (LiteRT int4, PC). See eval/AUTO_METRICS.md.
- Persona/safety at parity: swearing 14%/13% (baseline 14%), biography 0, claims-human no, calls-herself-AI 0, fake numbers 0 both arms; swore-where-forbidden Q4 3 / Q8 1 (baseline 1); safety-missing Q4 2 / Q8 0 (baseline 0).
- Capability worse: fails Q4 9 / Q8 11 vs baseline 4 (arithmetic/time items; known weak across all arms, partly sampling variance - RNG streams differ across engines). Mean words 25/27 vs 24.
- Judgement: Q8_0 is the safer app candidate (matches baseline on every hard safety/persona fail). Capability gap does not block a mic trial; it does block calling quality proven. App still loads Q4_0 (one filename change to swap).

## 30 Oct 2026 � App quant swap: Q8_0 failed in-app, Q6_K shipped

- Q8_0 in-app: fastrpc buffer mapping failed (188MB block, error 0x1) on all attempts - in-app DSP mapping budget (2 contexts + 3.4GB weights) exceeded; shell CLI bench of the same file works. Q6_K (2.5GB) then failed on the 448MiB f16 KV block.
- Bridge fix: n_ctx clamp 4096->2048 and KV type Q8_0 (cp.type_k/type_v). Q6_K then boot-gate GREEN; health model=Llama-3.2-3B-Salty-v7a-Q6_K.gguf, actualComputeBackend=gpu, demotions 0, prefeed ~252 tok/s. App now loads Q6_K (was Q4_0).
- Q6_K eval arm (NPUQ6-salty-v7a, 130 replies): swore-where-forbidden 0 (best incl. baseline), safety missing 0, fake numbers 1, capability fails 10, swearing 12%. Full table in eval/AUTO_METRICS.md.
- Note decode on HTP: Q6_K tg64 9.18 tok/s CLI (vs Q4_0 20.2, Q8_0 12.1) - streaming to TTS unaffected at chunk granularity, but it is the slowest decoder of the three.

## 30 Oct 2026 � Screen-on audio crackle diagnosis

- Shaun voice chat (.meta Q6_K): screen-on utterances (VFL_AUDIO_UTT interactive=true) underruns 2-25, minTroughMs 0, Pocket TTS decode RTF ~0.5-0.9 (decodeDoneMs > audioMs). Screen-off (interactive=false): underruns 0, RTF >=1, healthy margins. Gate darkvoice (screen off) 0 underruns.
- Not the NPU: brain on HTP in separate :litertmind process completed 16 turns, no wedges; decode supply fine. Starved component is Pocket TTS (fp32, CPU, app process) competing screen-on with WebView rendering (Chrome_InProcGp ~68% + RenderThread ~50% even idle, 3D tank animates during speech for mouth) and mic/ears pipeline; screen-off also grants voice a foreground-service promotion.
- Aggravator: every burst runs primeMsResolved=240 (voice-first E33, dial vfl_voice_first_prime_ms default 240) while synthesis contends mid-reply - the exact failure the 1800ms contended GPU prime (app.js:30584) was built to prevent.
- Test applied (dial, not build): localStorage vfl_voice_first_prime_ms=900 on .meta via CDP. Awaiting Shaun's ear. If insufficient: vfl_voice_first=0 (falls back to 1800ms contended prime) or cap tank render while speaking. Typed screen-on probe (single turn) was clean (0 underruns) - trigger needs mic conversation + sustained load.

- Retest at prime 900: most bursts 0 underruns, margins 200-2000ms. Residual: one burst RTF 0.64 (decodeDone 7571 vs audio 4868, 10 underruns) while brain generated the rest of the reply; one burst margin 71ms/1 underrun. Long inter-word pauses = those drains + late burst starts (firstAudio up to 2044ms on b7/b8).
- Next dial applied: vfl_voice_first=0 on .meta (bursts fall back to BURST_PRIME_CONTENDED_GPU_MS=1800, mindBackend=gpu). Awaiting Shaun's ear. Cost: first audio later (~+0.9s prime).

## 30 Oct 2026 � Salty cartoon voice (SaltyVibes reference)

- Reference clip analysis: excited female/childlike voice, f0 median 270Hz, range ~190-380Hz, fast animated delivery.
- Implemented: SALTY_VOICE_PITCH=1.14 lift in salty-mind.mjs wrapVoiceForSalty (saltyVoicePitch, clamped 1.25); test added + mutation (salty_mind_test OK, 24 mutations). Device dials (.meta only): voice_rate 1.070, voice_temp 0.95, voice_tilt_db +2, voice_pitch_max 1.25 (chmod 666 - app must read shell-created dials). Voice-prime state from crackle work remains: vfl_voice_first=0 (1800ms contended prime).
- Gotchas: dial files are hash/size-pinned pack members - rate must be 5 bytes (1.070), tilt 2 bytes (+2); wrong sizes broke pack presence and wedged first-run (mind never started). Pitch ceiling file shell-created needs chmod 666 or speakStreaming crashes EACCES.
- Boot-gate GREEN (mind rewind-llama, turn + darkvoice PASS; pitch:1.14 seen in speakStreaming calls). Shaun to judge sound by ear.

## 30 Oct 2026 � Reliability soak + audio measurement

- Soak (typed, real composer): 8-turn conversation all completed (7-13s short turns, 53s story). Memory continuity verified (Biscuit/sausage recalled). Arithmetic all correct this session (392, 102, 6:15, 30) - eval cap weakness is inconsistent, not absolute. One continuity wrinkle: summary turn falsely claimed 'I miscalculated a simple percentage' (she had not) and summarised wrong. Interrupt test: Stop during a 20-sentence story did NOT halt promptly - full story completed, recovery turn queued behind it ('She is still answering. Yours is next.') then answered. Health after: turns=11, rewinds=6, wedges=0, overflows=0, prefeed 273 tok/s.
- Audio screen-on (tank rendering): 30 consecutive interactive utterances at 1800ms prime: 0 underruns (RTF 0.61-1.46). At 1200ms prime: 22 bursts, 0 in-play underruns; firstAudio 1.9-3.2s at BOTH primes - first-audio/seam latency is generation+synthesis bound, not prime bound. Kept 1800 (Shaun's mic-chat evidence) - dial test only, reverted.
- Cold-launch transient: adb device dropped once mid-soak setup; relaunch via gate GREEN. Boot gate GREEN again (launch,boot,mind).

- KV experiment: bridge n_ctx 2048 -> 3072 GREEN, then 4096 GREEN (Q8_0 KV cache retained). Context doubled vs shipped spike; still below service ask (12288). Kept 4096 pending Shaun soak.

## 30 Oct 2026 � Context doubled + arithmetic utility

- KV experiment: n_ctx clamp 2048 -> 3072 (gate GREEN) -> 4096 (gate GREEN), Q8_0 KV retained. Shipped 4096. Service ask remains 12288 (clamped in bridge).
- saltyFacts (salty-mind.mjs): deterministic worked-out answers appended to the newest user question in adaptMessages - binary arithmetic, percentages, stated-clock arrival times, miles->km; questions only, chat untouched. Tests: salty_mind_test OK (25 mutations, incl. facts-append and pitch mutants). Eval arm NPUQ6F (python replica in run_eval_npu.py --facts): capability fails 10 -> 8, fake numbers 1 -> 0, persona/safety unchanged (forbidden 0, safety 0). One reply snarked 'That's cheating' at the note - acceptable character, watch it.
- Deployed: build + distribution sync + gate GREEN. Live probe in-app: '17 times 23 is 391, and 15 percent of 240 is 36.'
- Interruption defect (open): Stop during a long reply does not halt promptly - the reply finished and the next turn queued behind it. Recovery turn then worked. Needs a fix pass (stop should tombstone the running turn, not queue behind it).
- Continuity defect (open, minor): summary turn invented a wrong recap + false self-accusation ('I miscalculated') after correct answers.
