# Salty

**A foul-mouthed, warm, funny cartoon axolotl who lives in a little aquarium on your phone, and thinks entirely on it.**

Built with Llama. Built for the Meta Global AI Developer Hackathon (Indie track), 27 Oct – 4 Nov 2026.

Salty is a fine-tuned **Llama 3.2 3B Instruct** (`Llama-3.2-3B-Salty-v7a`) running on the **Hexagon NPU** of an ASUS ROG Phone 8 Pro (Snapdragon 8 Gen 3) through llama.cpp's ggml Hexagon backend. She hears you, thinks, talks back in her own voice, reacts with her whole body to what you tell her, and remembers you the next time she wakes up, all in a 3D tank where she swims laps and snaps up the bloodworms you drop her. No server, no account, no cloud: nothing you say to her leaves the phone.

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
- **She remembers you:** short notes kept only on the phone, taken from *your* words by plain rules (your dog's name, your partner, where you live, what you love, and your own sentence from moments that moved her), never written by her model. They join her prompt once per session, so her engine's persona checkpoint holds, and when you ask about something personal the page tells her what she does or doesn't know, so she says "you haven't told me" instead of inventing (before that fix she named a cat that didn't exist "Muffin"). A 🐚 card shows every note, with forget-one and forget-everything. Tested across a cold restart on the phone. ([app/public/salty-memory.mjs](app/public/salty-memory.mjs))
- **She needs you:** a Tamagotchi-style care loop where her feelings reach her mind. Hunger and loneliness grow in real time, also while the app is closed (kept on the phone). The 🪱 button drops six wriggling 3D bloodworms; she turns her head to the nearest, leans in and snaps each one up, then wiggles. Feed her three times in an hour and she's stuffed. At rest her face sulks or looks hungry. On your next message the page gives her a short cue about how she feels, so the Llama on the phone says it in her own words, cheeky and never cruel. Tested after a simulated 20 hours of neglect: *"Twenty hours, and not a single bite. The council, by the way, has been informed."* Then fed: *"Bloodworms. The perfect snack. I'm stuffed, I'm content, and I still haven't told you how much I missed you."* ([app/public/salty-care.mjs](app/public/salty-care.mjs); cue wording tested against her own GGUF with [experiments/salty/npu/care_prompt_lab.mjs](experiments/salty/npu/care_prompt_lab.mjs))
- **She speaks first:** come back after a couple of hours and she greets you before you say a word, from a cold start or when you switch back to the app. How cheeky or warm she is depends on how long you were gone and whether she's hungry, and she may ask about something she remembers. Tested on the phone: *"Eight hours. I've been holding on to your words. How's Biscuit?"* The greeting goes through the host app's normal turn pipeline (a hidden stage cue in place of your words), so there's no side door to her mind.
- **Live captions:** your words and hers at the top of the tank as she speaks, for watching muted and for anyone who can't hear her.
- **She reacts with her body:** outrage, sympathy, celebrate, sleepy and wave moves play the moment your words land, before she answers ("my dog nicked a sausage" → outrage, "rough day" → sympathy, "I got the job" → celebrate). Plain rules on your words; anything unclear plays nothing. ([app/public/salty-moods.mjs](app/public/salty-moods.mjs))
- **Her own life in the tank:** every so often she pushes off the sand and swims laps of the whole tank, turning through facing you, banking into turns, passing along the glass, then lands somewhere a little new. On a portrait phone the close-up only shows the middle of the tank, so the view pulls back to the whole room while she's out and pushes in again as she comes home. Between swims, a quirk every few seconds: she looks around, tilts her head, blows a bubble and watches it rise, hiccups, yawns, peeks at the glass, swims up to gulp air at the surface like a real axolotl, scoots to a new spot. Her moods show too: sulking, she turns her back on you; hungry, she looks up for food; at night she's drowsier. Talk, type or tap and she drops it and comes home to face you. All procedural on top of her rig's animations: a steering swimmer, head aiming held to angles that keep her face to you, suction feeding. On the phone a full swim runs at 60 fps with no dropped frames. ([app/public/salty-life.mjs](app/public/salty-life.mjs); phone frames: [salty-rig/look/life/sheet.png](salty-rig/look/life/sheet.png))
- **MUSEick, her music studio:** describe a song and four tracks appear, synthesised on the phone with no samples. Salty names it and pushes an idea; the studio's rules write the notes, and she can't hear the music. Change it by talking, undo anything, and ordinary conversation leaves the song alone. ([app/public/museick](app/public/museick), [docs/museick](docs/museick))
- **Her tank:** a three.js aquarium with a rigged 3D Salty whose mouth follows her real voice level and syllables, and who blinks. She keeps moving while she thinks, because her mind is on the NPU and not the GPU the tank draws with. While she's up, the host app's hidden home screen stops animating underneath her (idle CPU 89% → 32% for the app process, measured), and she launches straight into her tank with her own icon and splash. ([app/public/salty-tank.mjs](app/public/salty-tank.mjs), [app/public/salty-tank-3d.mjs](app/public/salty-tank-3d.mjs))
- **Her body:** a Blender pipeline from a Meshy base mesh to feathery gills, skin, eyelids, lashes, mouth and teeth, a 23-bone rig and her animations. ([salty-rig](salty-rig))
- **Her voice:** Pocket TTS shaped to a brighter, quicker cartoon voice (pitch ×1.14).

Timeline note: the style spec, eval rubric and held-out prompts were drafted on the evening of 26 Oct Adelaide time, a few hours before the kickoff stream (12:00 PM ET, 26 Oct). Training, the NPU bridge, the app integration, the tank and her 3D body were all built after kickoff.

## Repository map

| Path | What |
|---|---|
| `app/public/` | Salty's web layer inside the app, her tank assets, and licences |
| `app/scripts/` | Tests: `salty_mind_test.mjs` (mutation-tested), `salty_memory_test.mjs`, `salty_moods_test.mjs`, `salty_care_test.mjs`, `salty_life_test.mjs` (her swims, dinner and quirks on a simulated clock), `helpline_guard_test.mjs`, `museick_test.mjs`; `push_salty_dials.ps1` |
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
node scripts/museick_test.mjs
node --test scripts/salty_memory_test.mjs scripts/salty_moods_test.mjs scripts/salty_care_test.mjs scripts/salty_life_test.mjs
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
- Her memory only keeps what its rules recognise, so plenty of what you say isn't kept. She can still fill small gaps in conversation (she called the dog "she" without being told). Notes you add reach her prompt from the next session; in the same session she has the conversation itself.
- Her sampler runs with a fixed seed, so the same conversation gets the same reply. That's handy for retakes, but she can repeat herself if you repeat yourself. She also sees the last few turns from before a restart and sometimes brings an old line back.
- Inside the host app, the exact sentence "What do you remember about me?" is caught by the host's own memory command, which answers in its own voice. Any other phrasing ("Hey Salty, what do you remember about me?") reaches her.
- MUSEick reads words by English rules, so a phrasing it doesn't know changes nothing. Its spoken path hasn't been tested with a person speaking.
- She is an AI and can be wrong; she swears and is not meant for children. See [app/public/licenses/SALTY_NOTICES.txt](app/public/licenses/SALTY_NOTICES.txt).

## Licences and credits

- **Llama 3.2** is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved. Licence, Acceptable Use Policy and Notice: [app/public/licenses](app/public/licenses).
- **llama.cpp / ggml** (MIT), **three.js** (MIT), **Pocket TTS** by Kyutai and **VCTK** voice material (CC BY 4.0), **Neonderthaw** font (SIL OFL 1.1).
- **3D base model** created with Meshy, CC BY 4.0, heavily modified in Blender.
- **Room, reef and early clips** generated with Google Gemini, then cut out and edited.
- The demo video's second voice is **MOSS-TTS** (Apache 2.0), from a CC0 clip in Kyutai's `tts-voices`.

Full credits: [app/public/licenses/SALTY_NOTICES.txt](app/public/licenses/SALTY_NOTICES.txt).
