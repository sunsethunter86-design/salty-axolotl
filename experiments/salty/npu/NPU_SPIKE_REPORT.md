# Salty on the NPU — spike report (29 Oct 2026)

## Verdict (30 Oct 2026, updated after the llama.cpp Hexagon spike)

**GO — via llama.cpp's ggml Hexagon backend, not LiteRT.** Salty's own
Llama-3.2-3B, converted to GGUF and run on the ROG's HTP v75 with
llama.cpp (`libggml-htp-v75.so`), measured on-device:

| llama.cpp on HTP0 | Prefill pp128 | Decode tg64 |
|---|---|---|
| salty-v7a Q4_0 (1.78 GiB) | **870.57 ± 12.86 tok/s** | **20.20 ± 0.11 tok/s** |
| salty-v7a Q8_0 (3.18 GiB) | 854.47 ± 17.67 tok/s | 12.13 ± 0.03 tok/s |

Real-prompt check (Q4_0): prompt eval 552 tok/s (53 tokens in 96 ms),
decode 20.02 tok/s, model load 2.5 s — and the output is coherent and in
her voice ("I love the way the light plays off the water, and the little
shrimp that dart around in the morning. It's my own little underwater
world, right here at home."). Against the GPU build's ~0.95–1.05 s warm
first-token, NPU prefill of a typical prompt is ~0.1 s. Artifacts:
`gguf/salty-v7a-Q4_0.gguf`, `gguf/salty-v7a-Q8_0.gguf` (source
`gguf/salty-v7a-f16.gguf`), build in `tools/llama.cpp/pkg-android`,
logs `gguf/bench_htp.log`, `gguf/gen_q40.log`. Remaining gate is app
integration: llama.cpp replaces the LiteRT-LM engine, so her
rewind/checkpoint behaviour and the app's engine switch need re-proving
there. The LiteRT NPU route below stays NO-GO.

---

## Previous verdict (LiteRT route, superseded)

**NO-GO for shipping LiteRT NPU. She now executes end-to-end on the phone, but the
measured speed is unusable and the output is garbage.** The KV dtype fix
(below) removed the warmup blocker: the fixed bundle composes, warms up,
and generates. The CLI's own benchmark mode then measured:

| Metric (NPU harness, JIT) | Measured | GPU build today |
|---|---|---|
| Time to first token | **423.20 s** | ~0.95–1.05 s warm |
| Prefill (128 tokens) | 6m54.7 s — **0.31 tok/s** | — |
| Decode (32 tokens) | 4m31.9 s — **0.12 tok/s** | conversational |
| Init Executor (QNN JIT compile) | 473,670 ms (~474 s) | n/a (prebuilt) |

A plain conversational run (`--max_output_tokens=64`) took ~430 s in the
generation phase and produced a single garbage token sequence:
`Captured model output: value`. These are not Hexagon-class numbers; the
log shows why (next section). Her GPU build remains the competition entry.

## What was proven (all with her 3B Llama, no Gemma anywhere)

| Stage | Result |
|---|---|
| Export (HF → .litertlm, split cache) | OK — `out/exported/model.litertlm` |
| Calibrate (min-max mode, 24 Salty prompts) | OK — 3,926 tensors recorded |
| Quantize (static-range, SRQ) | OK, clean — `out/model_srq.litertlm`, zero workarounds |
| Compile (QNN AOT on PC, SM8650, wi8) | **SEGFAULT** in `libLiteRtCompilerPlugin_Qualcomm.so` (return -11, no message) |
| Compile (JIT on the phone, wi8) | **SEGFAULT** at `Composing graph`, entry `qnn_partition_0` |
| Export+quantize (channelwise int4) | OK — `out_i4/model_srq.litertlm`, 2,029,064,190 bytes |
| Compose (phone, int4) | OK — both prefill and decode graphs compose |
| Run on NPU (int4, pre-fix) | Blocked at warmup: `Custom allocation is too small for tensor idx: 54` |
| KV dtype fix at quantize source | OK — `KV-DTYPE fixed to INT16: ['prefill_128_kv_cache_k_27', 'prefill_128_kv_cache_v_27']`; all 56 prefill KV inputs INT16, scales copied from decode (k 0.00052364, v 0.00017704); bundle rebuilt at identical 2,029,064,190 bytes |
| Run on NPU (fixed) | Executes end-to-end; output garbage (`value`); bench 0.31 / 0.12 tok/s — see Verdict |

## Why the measured run is slow and wrong (from `bench_fix.log` / `bench_bm.log`)

- The aux cache-update model fails QNN validation on all 56
  `ElementWiseSelect` ops (`prefill_cache_update_128_*` /
  `decode_cache_update_*`, QNN error 3110, SFIXED_POINT_16 tensors).
  The Qualcomm plugin applies 0 partitions to aux; it falls back to
  XNNPACK CPU (`TfLiteXNNPackDelegate` partitions for embedder/rope/aux).
- At execution, an HTP graph fails to prepare:
  `graph_prepare.cc: could not create op: q::Select.exe` with mismatched
  Crouton inputs (QUint8 vs QUint16) — printed right before the captured
  output in both runs.
- Process behaviour matches a fallback-dominated run: ~93% CPU,
  ~14 min CPU time for one 64-token conversation.
- Benchmark profiler summaries are unimplemented for this backend
  (`GetProfileSummary not implemented for backend: LiteRT NPU Compiled
  Model`); the BenchmarkInfo numbers above are the CLI's wall-clock
  turn timings, which are the honest end-to-end figures.

Toolchain: existing `tools/convert-venv` (litert-torch 0.10.0) under WSL,
QAIRT 2.47.0.260601, LiteRT v2.2.0 v75 dispatch library, LiteRT-LM v0.18.0
CLI harness in `/data/local/tmp/npu` (nothing installed; her app untouched).

## Failure signature (for whoever picks this up)

- Partitioning succeeds: both subgraphs partition 100% to HTP
  (1369 and 1264 ops, one partition each). The crash is in QNN graph
  *composition* of the first partition.
- Log line at crash: `Starting QNN Compilation for 2 subgraphs,
  soc_model=(null)`, then `Creating context handle` → `Composing graph` →
  segfault. Plugin reports SDK v2.47.0.260601114230, matching the libraries.
- Same crash class on the PC AOT plugin against
  `Section0_TFLiteModel_tf_lite_prefill_decode.tflite` (3,235,437,872 B).
- Upstream notes document a sibling crash family in this plugin: the
  "MHA optimization (fast vlm decode)" pass dying on multi-KV-head decode
  graphs, and a ~3.67 GB per-graph allocation ceiling. Llama-3.2-3B has
  8 KV heads; her spike config used cache_length 1024, prefill [128].

## Things tried that did NOT work (don't repeat)

- Profiler-based calibration: records only 955 tensors / last-layer KV stats;
  quantize dies in KV alignment. Min-max calibration is the correct mode.
- Placeholder/cloned KV stats to force alignment through (840 fake entries):
  unsound, abandoned. The clean run needed none of it.
- CPU backend on the SRQ bundle: the stock executor rejects the NPU-shaped
  (split-cache) bundle ("Input tensor not found"). SRQ quality is therefore
  still UNVERIFIED — calibration generations from the pre-SRQ export were in
  Salty's voice ("Not much, just hanging around. You?").

## Int4 allocation blocker — root cause (verified in the shipped flatbuffer)

The prefill subgraph declares 56 KV-cache inputs (28 layers × K/V).
54 are INT16. Exactly the last layer's pair —
`prefill_128_kv_cache_k_27` / `prefill_128_kv_cache_v_27`
(tensors 54/55) — is FLOAT32, while carrying the same 2,097,152-byte
static size override as the INT16 tensors (i.e. the INT16 byte size).
Neither tensor is consumed by any op; KV cache is threaded through state
buffers, and the decode subgraph is uniformly INT16. The executor
allocates buffers at the compiled graph's INT16 size, then rejects them
as too small for the declared FLOAT32 tensors:
`Failed to allocate tensors` → `Custom allocation is too small for tensor idx: 54`.
This is an export/quantize-side dtype inconsistency for unused graph
inputs, not a device, harness, or QNN fault. A hand byte-patch cannot fix
it (FLOAT32 is the flatbuffer default — the type field is absent), and an
object-API repack drops the external weights (422 MB stub; discarded).

## The KV dtype fix (applied, 30 Oct 2026)

In `run_npu_export.py` stage 3, `ModelModifier._serialize_model` /
`_serialize_small_model` are wrapped so that, on the quantizer's own
model object just before its external-buffer serialization, every
FLOAT32 prefill KV-cache tensor with an INT16 decode counterpart is
forced INT16 and given a deep copy of the decode tensor's quantization
parameters. Patching at this point (not the file bytes) is what keeps
the 1.6 GB of external weight buffers intact — an object-API repack of
the finished `.tflite` drops them (22 MB stub; verified, do not retry).
Root cause of the original defect: tensors 54/55 have no consumer op
in the prefill graph (every other layer's KV input feeds an op), so
ai_edge_quantizer never emits a transformation for them.

Rebuild: `NPU_OUT=out_i4 NPU_CFG=salty_sm8650_i4.json python
run_npu_export.py 3` (log `stage3_i4_fix.log`). Pushed to
`/data/local/tmp/npu/model_i4.litertlm`; logs `bench_fix.log`,
`bench_bm.log` kept alongside this report.

## llama.cpp Hexagon route — how it was built (30 Oct 2026)

- Source: `tools/llama.cpp` (ggml-org master, build 0893ec9). No Docker
  on this machine, so the `--no-docker` native path was used in WSL.
- Toolchain (all public, no Qualcomm account): Hexagon SDK 6.7.0.0
  Linux amd64 tarball from `snapdragon-toolchain/hexagon-sdk` GitHub
  releases; Android NDK r28b Linux from Google. Gotchas: the local
  `D:\lcbuild\ndk` is a Windows NDK (unusable in WSL), and Python
  `zipfile` extraction broke NDK symlinks/exec bits — restored with
  `gguf/fix_symlinks.py` (35 links). Hexagon SDK tarball extracted
  cleanly with tar.
- Conversion: `convert_hf_to_gguf.py` on `salty-v7a/merged` → f16
  GGUF (6.4 GB, 255 tensors), then host `llama-quantize` → Q4_0
  (1,821 MiB) and Q8_0 (3,421 MiB). Exact weights, no Gemma.
- Build: preset `arm64-android-snapdragon-release` with
  `-DGGML_OPENCL=OFF` (OpenCL SDK not needed), `GGML_HEXAGON=ON`;
  script `gguf/build_android.sh`. Produced `libggml-htp-v75.so` among
  v73–v85 skels.
- Device run: package + GGUFs pushed to `/data/local/tmp/llama.cpp`
  and `/data/local/tmp/gguf` (nothing installed). `llama-cli
  --list-devices` shows only `HTP0: Hexagon` (OpenCL off, so no GPU
  device in this build). Bench: `llama-bench --device HTP0 -ngl 99
  -p 128 -n 64`; generation: `llama-completion --jinja`. Arch v75
  confirmed in log (`Hexagon Arch version v75`).

## App integration spike — DONE, GO (30 Oct 2026)

The integration spike ran the same day and passed. Summary (full log in
`SPIKE_LOG.md`):

- New lane `-PvfMetaHex` (with `-PvfMetaId`, no `-PvfOldRewindEngine`):
  meta+llama allowed, F08 integrity skipped, `hex-jniLibs` staged,
  `VF_META_HEX` set, legacy packaging on (extracted libs for FastRPC).
  Ordinary `.meta` LiteRT behaviour is unchanged.
- New bridge `app/android/app/native-hex/vfhex_jni.cpp` implements the
  `Lrt` JNI facade over current llama.cpp: engine/session, fused
  generateStream (ChunkSink + terminal error contract), checkpoints via
  llama seq-state, exactCacheTokens, tokenize, benchmarkJson.
  Conversation/media and debug natives fail closed.
- Gotchas solved on the way: `libc++_shared.so` packaged;
  `ADSP_LIBRARY_PATH` set from `dladdr` (FastRPC skel search); GGUF
  copied to internal storage (`fastrpc_mmap` cannot map FUSE); context
  clamped 8192→4096 (KV mmap crash at 8192; CLI-proven config).
- Device proof (ROG, `.meta` only): **boot-gate GREEN** (install /
  launch / boot / mind / turn / darkvoice all PASS). Health:
  `actualComputeBackend: "gpu"`, `gpuDemotionCount: 0`, engine
  `rewind-llama`, runtime `llama-hex-0893ec9`, in-app prefeed
  ~300–340 tok/s (vs ~46 tok/s on the CPU-settled fallback), rewinds
  working (checkpoint-only, ~1–2 ms), darkvoice first audio ~1.24 s.
  Protected `com.veridity.flow.local` untouched.

Known spike limits: context cap 4096 (service asks 12288), Q4_0 only,
media natives fail closed, Salty eval sets not yet run in-app, no
real mic conversation yet. Those gate a shipping decision, not the
route: the llama.cpp Hexagon engine is now the NPU candidate.

## Recommended next moves, in order

1. **Run the Salty eval sets in-app** on Q4_0 (and Q8_0 via a dialled
   model name if wanted) against the GPU baseline, then a real mic
   conversation with Shaun. Only a quality pass makes this the
   competition configuration.
2. Thermals/battery soak on the ROG during a real conversation, and
   first-token in-app (bench implies ~0.1 s prefill for a typical
   prompt vs ~1.0 s GPU warm TTFT — verify through the real chain).
3. The LiteRT fix-the-aux-path route is parked: only revisit if
   llama.cpp integration hits a hard blocker. Her current GPU build
   stays the competition entry until the NPU build passes evals in-app.

## Cost so far

$0 of the Claude credits. One afternoon of PC/phone time. All artifacts and
scripts kept in `experiments/salty/npu/` (`SPIKE_LOG.md` has the blow-by-blow).
