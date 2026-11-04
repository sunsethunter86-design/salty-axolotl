# Muse Code on Salty: evidence for the submission

*Gathered 2 Nov 2026 from Helicon's own session database (read-only copy), Muse's settings and the project notes, and updated 5 Nov from Muse's own session logs. Times are Adelaide (ACDT). Kickoff: Mon 26 Oct 12:00 PM ET = Tue 27 Oct ~02:30 Adelaide.*

## Why this matters

The Participant Guide says a project "must incorporate Meta's models" and lists Muse Wonder (through Meta Model API) and "code faster with Muse Code coding agent". Stage One judging asks whether the project "reasonably used Meta Model API and/or Meta's open-weight models **to build the project** in the Hackathon".

Salty used both:

1. **Muse Code on Muse Wonder 1.0 (Meta Model API)** to build a large part of her, paid with Shaun's Muse subscription and then his $150 Meta Model API credits (now used up).
2. **Llama 3.2 3B Instruct (Meta open weights)**, fine-tuned as `Llama-3.2-3B-Salty-v7a`, running fully on the phone's Hexagon NPU.

Whether (2) alone counts as an eligible open-weights model is still to be confirmed with the organisers: the guide names only Muse Glimmer and Muse Spark Open.

## The record

Source: `%APPDATA%\app.helicon.desktop\helicon.db` (tables `sessions`, `usage`). Muse's configured model: `~/.config/muse/settings.json` -> provider `meta`, model `muse-spark-1.3-contributor`; sessions themselves ran on `muse-wonder-1.0`.

| When (Adelaide) | Session (Helicon title) | Model | API calls | Output tokens |
|---|---|---|---|---|
| 26 Oct 16:01 – 18:15 | Initial greeting and introduction | muse-wonder-1.0 | 82 | 29,143 |
| 27 Oct 00:31 – 01:55 | Upcoming Meta Competition Countdown (pre-kickoff part) | muse-wonder-1.0 | 11 | 3,154 |
| **— kickoff —** | | | | |
| 27 Oct 02:59 – 17:19 | Upcoming Meta Competition Countdown | muse-wonder-1.0 | 282 | 111,757 |
| 27 Oct 03:11 – 03:26 | Git checks (3 short sessions, salty-hackathon / home) | muse-wonder-1.0, muse-spark-1.3 | 10 | 803 |
| 27 Oct 20:44 – 28 Oct 08:10 | Make Salty faster smoother and on-topic | muse-wonder-1.0 | 271 | 111,788 |
| 28 Oct 23:26 – 23:45 | App 3D model loading issue | muse-wonder-1.0 | 75 | 43,738 |
| 29 Oct 11:27 – 11:32 | API Credit Fallback After Meta Subscription | muse-wonder-1.0 | 23 | 8,112 |
| 29 Oct 11:36 – 11:52 | Salty new 3D model and capabilities | muse-wonder-1.0 | 69 | 29,976 |
| 29 Oct 11:55 | Opening greeting with no request | muse-wonder-1.0 | 1 | 39 |
| 29 Oct 12:00 – 30 Oct 19:16 | Verify Salty 3D tank integration and capabilities | muse-wonder-1.0 | 1,220 | 410,165 |
| 30 Oct 19:20 – 31 Oct 00:44 | Continuing Salty work on local PC | muse-wonder-1.0 | 366 | 130,123 |
| 3 Nov 12:49 – 12:54 | Salty on-device music studio design investigation | muse-wonder-1.0 | 34 | 13,484 |
| 3 Nov 13:15 – 13:20 | Clarify Muse subscription versus API usage | muse-wonder-1.0 | 5 | 3,272 |

Totals: 2,449 calls. The 93 before kickoff were planning chats, not shipped code. Of the 2,356 after kickoff, 2,350 ran on Muse Wonder 1.0 and 6 on Muse Spark 1.3 (short checks).

The **2,311** in the README, the video and the submission counts the Muse Wonder calls after kickoff up to 2 Nov (about 846,000 output tokens). The other 39 are the two sessions on 3 Nov: a handover audit and a design plan for MUSEick, then a billing question.

## What Muse was asked to do (from the project's own notes)

- `PLAN.md` (written by Muse: "Muse (me, this assistant)"): the hackathon plan, Llama-on-phone strategy, stop-loss, licence duties.
- `RESEARCH.md`: which Meta models run on a phone, runtimes, rewind, licence.
- `PITCH.md` and `experiments/salty/`: Salty's character, style spec, eval rubric, fine-tune data and training plan.
- `MUSE_PROMPT_SALTY_SPEED.md`, `MUSE_PROMPT_SALTY_TRANSITIONS.md`: Muse jobs on her reply speed and her idle/talk transitions; `experiments/salty/SPEED_REPORT.md` is the speed result.
- `HANDOVER_TO_MUSE_20261029.md`: hand-over to Muse for 29 Oct onwards (API-credit switch, 3D tank integration).
- `experiments/salty/NATIVE_PROPOSALS.md`: proposals Muse wrote for native-side work it was not allowed to change.

## What Muse changed (from its own session logs)

Helicon keeps turns and usage but no shell log (`shell_runs` is empty), and git history was squashed on 30 Oct (`6e00ce9`). Muse's session logs in `~/.local/share/muse/sessions` do keep the record: every `write_file` and `edit_file` call and its result. Checked 5 Nov.

After kickoff, Muse Code changed **136 files**. **66 of them are in this repo today**, with 208 successful changes between them. The other 70 are an early prototype, files in the private host app, project notes, and test and scratch scripts. The count leaves out anything it changed through shell commands, and Claude Code has changed some of these files since.

The main ones:

- **`app/android/app/native-hex/vfhex_jni.cpp`:** the JNI bridge that puts her on the NPU. Muse Code wrote it on 30 Oct, with 16 changes in all. It has had no commits since.
- **`app/public/salty-tank-3d.mjs`:** her 3D tank renderer, with her animations, blinking and a mouth that follows her real voice. Muse Code wrote it, with 39 changes in all, and Claude Code has extended it since.
- **`app/public/salty-mind.mjs`, `app/public/salty-tank.mjs` and `app/scripts/salty_mind_test.mjs`:** her conversation layer and tank, with 48 changes between them.
- **`experiments/salty/npu/`:** the NPU work, including the LiteRT route it tried and parked, the llama.cpp build scripts and `NPU_SPIKE_REPORT.md`.

<details>
<summary>All 66 files</summary>

| File | Changes | Dates (Adelaide) |
|---|---:|---|
| `app/public/salty-tank-3d.mjs` | 39 | 29 Oct to 31 Oct |
| `app/scripts/salty_mind_test.mjs` | 20 | 27 Oct to 30 Oct |
| `app/android/app/native-hex/vfhex_jni.cpp` | 16 | 30 Oct |
| `app/public/salty-mind.mjs` | 15 | 27 Oct to 30 Oct |
| `app/public/salty-tank.mjs` | 13 | 29 Oct to 30 Oct |
| `experiments/salty/npu/NPU_SPIKE_REPORT.md` | 10 | 29 Oct to 30 Oct |
| `experiments/salty/npu/run_npu_export.py` | 8 | 29 Oct to 30 Oct |
| `experiments/salty/npu/repack_dtype.py` | 4 | 29 Oct |
| `experiments/salty/scripts/run_eval_npu.py` | 4 | 30 Oct |
| `experiments/salty/SPEED_REPORT.md` | 4 | 27 Oct to 29 Oct |
| `experiments/salty/NATIVE_PROPOSALS.md` | 3 | 27 Oct to 28 Oct |
| `experiments/salty/npu/SALTY_NPU_MANIFESTO.md` | 3 | 30 Oct |
| `experiments/salty/npu/set_prime.mjs` | 3 | 30 Oct |
| `experiments/salty/npu/stage_device.ps1` | 3 | 29 Oct |
| `.gitignore` | 2 | 30 Oct |
| `app/android/app/native-hex/build_hex_native.sh` | 2 | 30 Oct |
| `experiments/salty/npu/aot_try.py` | 2 | 29 Oct |
| `experiments/salty/npu/aot_try2.py` | 2 | 29 Oct |
| `experiments/salty/npu/extract_qairt.py` | 2 | 29 Oct |
| `experiments/salty/npu/gguf/build_android.sh` | 2 | 30 Oct |
| `experiments/salty/npu/gguf/fix_symlinks.py` | 2 | 30 Oct |
| `experiments/salty/npu/salty_sm8650.json` | 2 | 29 Oct |
| `experiments/salty/npu/SPIKE_LOG.md` | 2 | 29 Oct |
| `experiments/salty/PREFILL_REPORT.md` | 2 | 28 Oct |
| `salty-rig/face.py` | 2 | 30 Oct to 31 Oct |
| `app/public/salty/salty-tank.css` | 1 | 29 Oct |
| `app/scripts/push_salty_dials.ps1` | 1 | 27 Oct |
| `docs/ASSETS.md` | 1 | 30 Oct |
| `experiments/salty/npu/analyze_voice.py` | 1 | 30 Oct |
| `experiments/salty/npu/audio_probe.mjs` | 1 | 30 Oct |
| `experiments/salty/npu/bench_device.ps1` | 1 | 29 Oct |
| `experiments/salty/npu/check_calib.py` | 1 | 30 Oct |
| `experiments/salty/npu/check_kv.sh` | 1 | 30 Oct |
| `experiments/salty/npu/check_qsv27.py` | 1 | 30 Oct |
| `experiments/salty/npu/consumers.py` | 1 | 30 Oct |
| `experiments/salty/npu/delivery_status.mjs` | 1 | 30 Oct |
| `experiments/salty/npu/dump_chat.mjs` | 1 | 30 Oct |
| `experiments/salty/npu/fix_kv_dtype.py` | 1 | 30 Oct |
| `experiments/salty/npu/fix_kv_dtype_tf.py` | 1 | 30 Oct |
| `experiments/salty/npu/gguf/check_abi.sh` | 1 | 30 Oct |
| `experiments/salty/npu/gguf/deps.sh` | 1 | 30 Oct |
| `experiments/salty/npu/gguf/fix_ndk.sh` | 1 | 30 Oct |
| `experiments/salty/npu/gguf/probe_clang.sh` | 1 | 30 Oct |
| `experiments/salty/npu/inspect54.py` | 1 | 30 Oct |
| `experiments/salty/npu/inspect_calib.py` | 1 | 29 Oct |
| `experiments/salty/npu/list_inputs.py` | 1 | 30 Oct |
| `experiments/salty/npu/llama_int4_channelwise.json` | 1 | 29 Oct |
| `experiments/salty/npu/ops54.py` | 1 | 29 Oct |
| `experiments/salty/npu/patch_calib_kv.py` | 1 | 29 Oct |
| `experiments/salty/npu/patch_dtype.py` | 1 | 29 Oct |
| `experiments/salty/npu/peek2.py` | 1 | 29 Oct |
| `experiments/salty/npu/peek_bundle.py` | 1 | 29 Oct |
| `experiments/salty/npu/probe_compile.py` | 1 | 29 Oct |
| `experiments/salty/npu/probe_env.py` | 1 | 29 Oct |
| `experiments/salty/npu/probe_turn.mjs` | 1 | 30 Oct |
| `experiments/salty/npu/reload_page.mjs` | 1 | 30 Oct |
| `experiments/salty/npu/run_plugin.py` | 1 | 29 Oct |
| `experiments/salty/npu/run_plugin2.py` | 1 | 29 Oct |
| `experiments/salty/npu/salty.jsonl` | 1 | 29 Oct |
| `experiments/salty/npu/soak_turns.mjs` | 1 | 30 Oct |
| `experiments/salty/npu/tensor54.py` | 1 | 29 Oct |
| `experiments/salty/npu/tensor54b.py` | 1 | 29 Oct |
| `experiments/salty/npu/tensor54c.py` | 1 | 29 Oct |
| `experiments/salty/npu/tensor54d.py` | 1 | 29 Oct |
| `experiments/salty/train/convert_salty_p32.sh` | 1 | 27 Oct |
| `README.md` | 1 | 30 Oct |

</details>

## How to show it (suggestions)

- Write-up: one short section "Built with Muse Code" naming Muse Wonder 1.0, the dates and call count, and what it worked on.
- Video: 3–5 seconds of the Helicon session list for Salty, then back to Salty.
- Keep the honest split clear: Muse Code (Model API) got her onto the NPU and wrote the bridge and her 3D tank renderer; Llama 3.2 3B (open weights) is her brain on the phone; Claude Code did a large share of the rest, including most of her training chats, her fine-tune runs, her rig, the features from 2 Nov on and MUSEick.
