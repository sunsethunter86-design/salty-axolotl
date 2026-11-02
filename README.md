# Salty

**A foul-mouthed, warm, funny cartoon axolotl who lives in a little aquarium on your phone, and thinks entirely on it.**

Built with Llama. Built for the Meta Global AI Developer Hackathon (Indie track), 27 Oct – 4 Nov 2026.

Salty is a fine-tuned **Llama 3.2 3B Instruct** (`Llama-3.2-3B-Salty-v7a`) running on the **Hexagon NPU** of an ASUS ROG Phone 8 Pro (Snapdragon 8 Gen 3) through llama.cpp's ggml Hexagon backend. She hears you, thinks, talks back in her own voice and animates in a 3D tank. No server, no account, no cloud: nothing you say to her leaves the phone.

She was built with **Muse Code on Muse Wonder 1.0** through the Meta Model API (2,311 calls during the hackathon; see [docs/MUSE_CODE_EVIDENCE.md](docs/MUSE_CODE_EVIDENCE.md)).

## Meta models used

| Model | How |
|---|---|
| **Muse Wonder 1.0** (Meta Model API, via Muse Code) | The coding agent that planned, researched and built much of Salty during the hackathon |
| **Llama 3.2 3B Instruct** (Meta open weights) | Her mind: LoRA fine-tuned for her personality, quantised to Q6_K GGUF, run on the phone's NPU |

## What was built during the hackathon

Everything in this repository. Salty lives inside **Veridity Flow**, an existing private Android companion app by the same author; Veridity itself is not included and was not built for this event. Salty is a separate lane of it (package `com.veridity.flow.local.meta`) that only appears when her mind is loaded. The default app and its own model are untouched.

New for the hackathon:

- **Her personality fine-tune:** a style spec, a held-out eval of 65 prompts plus identity and looks probes, with automatic metrics and blind scoring, LoRA training runs v1–v7b, and the v7a pick. ([experiments/salty](experiments/salty))
- **Her mind on the NPU:** a JNI bridge from the app's engine interface to llama.cpp's ggml Hexagon backend, with streaming tokens, ~1 ms conversation rewind (sequence checkpoints), exact cache accounting and a 4096-token context on a DSP mapping budget. Measured on the phone: 871 tok/s prefill and 20 tok/s decode at Q4_0 in a bench; 9 tok/s decode in the app at the Q6_K quality pick. ([app/android/app/native-hex](app/android/app/native-hex), [experiments/salty/npu](experiments/salty/npu))
- **Her conversation layer:** prompt assembly, a sliding history window that keeps prefill reuse high, background-job deferral, a deterministic helper so she never does sums in her head (`saltyFacts`), and a helpline guard that removes invented emergency numbers. ([app/public/salty-mind.mjs](app/public/salty-mind.mjs), [app/public/helpline-guard.mjs](app/public/helpline-guard.mjs))
- **Her tank:** a three.js aquarium with a rigged 3D Salty whose mouth follows her real voice level and syllables, moods, blinking, an idle swim, and a GPU pause while she thinks so rendering never starves her mind. ([app/public/salty-tank.mjs](app/public/salty-tank.mjs), [app/public/salty-tank-3d.mjs](app/public/salty-tank-3d.mjs))
- **Her body:** a Blender pipeline from a Meshy base mesh to feathery gills, skin, eyelids, lashes, mouth and teeth, a 23-bone rig and her animations. ([salty-rig](salty-rig))
- **Her voice:** Pocket TTS shaped to a brighter, quicker cartoon voice (pitch ×1.14).

Timeline note: the style spec, eval rubric and held-out prompts were drafted on the evening of 26 Oct Adelaide time, a few hours before the kickoff stream (12:00 PM ET, 26 Oct). Training, the NPU bridge, the app integration, the tank and her 3D body were all built after kickoff.

## Repository map

| Path | What |
|---|---|
| `app/public/` | Salty's web layer inside the app, her tank assets, and licences |
| `app/scripts/` | Tests: `salty_mind_test.mjs` (mutation-tested), `helpline_guard_test.mjs`; `push_salty_dials.ps1` |
| `app/android/app/native-hex/` | `vfhex_jni.cpp` (llama.cpp Hexagon bridge) and its build script |
| `experiments/salty/` | Style, training configs and scripts, eval set, recorded runs and scores, NPU research and reports |
| `salty-rig/` | Blender scripts for her 3D body, the Meshy base and the exported animated model |
| `salty-video/` | Tools for her earlier video clips and the tank background |
| `docs/` | Muse Code evidence; model file hashes (`ASSETS.md`) |
| `EXPORT_MANIFEST.txt` | Every file in this repo, with its size, as exported from the private tree |

Run the tests (Node 20+):

```bash
cd app
node scripts/salty_mind_test.mjs
node scripts/helpline_guard_test.mjs
```

## What is not here, and why

- **Veridity Flow itself** (the host app, its native voice and engine code, build files): private, pre-existing.
- **Model weights** (`.gguf`, safetensors): too large for git. Hashes are in [docs/ASSETS.md](docs/ASSETS.md).
- **Most of her training chats:** 524 chats trained v7a. 49 are the author's own: they are included, with one more he rejected, in [experiments/salty/data/candidates](experiments/salty/data/candidates). The other 475 were written with an AI assistant and are kept private. [experiments/salty/PROVENANCE.md](experiments/salty/PROVENANCE.md) records the sources.
- **Blender source files** (`.blend`, ~150 MB) and third-party runtime binaries (LiteRT, Qualcomm).
- Device serials and network addresses in scripts are replaced with `YOUR_DEVICE_SERIAL` / `PHONE_IP`.

## Honest limits

- She is a 3B model: word problems and clock questions are her weak spot (the sums helper covers arithmetic only).
- Pressing Stop during a long spoken reply doesn't halt her promptly yet.
- First audio on later sentences can lag 2–3 s (generation-bound).
- She is an AI and can be wrong; she swears and is not meant for children. See [app/public/licenses/SALTY_NOTICES.txt](app/public/licenses/SALTY_NOTICES.txt).

## Licences and credits

- **Llama 3.2** is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved. Licence, Acceptable Use Policy and Notice: [app/public/licenses](app/public/licenses).
- **llama.cpp / ggml** (MIT), **three.js** (MIT), **Pocket TTS** by Kyutai and **VCTK** voice material (CC BY 4.0), **Neonderthaw** font (SIL OFL 1.1).
- **3D base model** created with Meshy, CC BY 4.0, heavily modified in Blender.
- **Room, reef and early clips** generated with Google Gemini, then cut out and edited.

Full credits: [app/public/licenses/SALTY_NOTICES.txt](app/public/licenses/SALTY_NOTICES.txt).
