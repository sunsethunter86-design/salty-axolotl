# MUSEick — build and test log

Branch `museick/studio`, cut from `2439971` (the same commit as `main` and `origin/main`). Nothing
is committed or pushed. Device: ASUS ROG Phone 8 Pro (ASUS_AI2401_D) over wireless adb
`PHONE_IP:5555`, package **`com.veridity.flow.local.meta`** only. The protected
`com.veridity.flow.local` was not touched.

## Safeguards (3 Nov, before any edit)

- Git state was recorded in `D:\MuseTest_museick_safety_20261103\git_status_before.txt`: branch
  `salty/swim-eat-quirks` at `2439971`, 0 tracked changes, and 31 untracked files (21 entries as
  git groups them).
- Every untracked file was hashed (`untracked_sha256.txt`) and copied (`untracked_copy.tar`,
  98 MB) to that folder. None were moved, staged or edited.
- The installed `.meta` APK was pulled from the phone before the first install
  (`meta_installed_before_museick_20261103.apk`, sha256 `05da99c7…5808`). It is byte-identical
  to the 12:16 local build. Reinstall it with `adb install -r` to go back; app data is kept.
- The public repo `D:\salty-hackathon` was not touched (`main` at `fffa45d`). The exporter's
  allowlist now names the MUSEick files, but the export was **not** run.

## Desktop checks

- `node app/scripts/museick_test.mjs`: **OK**. It covers 150 compositions (10 styles × 5 moods ×
  3 seeds), all valid and 30–75 s long, with lead and bass always in key and chords in key apart
  from a minor V's leading tone. It also checks the competition brief, six revision phrases that
  each change the notes, validator repairs, Salty's title and push, negation, note length, and
  four broken songs caught.
  - The test found three real bugs, all fixed:
    1. Power chords on a diminished degree left the key.
    2. Very high lead notes were clamped onto a wrong pitch.
    3. "wouldn't" wasn't treated as a negation.
- Existing suites, unchanged and passing:
  - `salty_mind_test`: 28 mutations caught.
  - `helpline_guard_test`: OK.
  - `node --test` on care, life, memory and moods: 29/29.
  - `stop_armed_tank_leg_test`: 6/6.
- Offline solo renders were used to balance the mix (RMS per track). Before trimming, the lo-fi
  sub bass sat 9 dB over its drums and the pluck sounds 6 dB under target. Per-sound trims are
  in `museick-audio.mjs` (`SOUND_GAIN`).

## Builds on the phone

Each build was: `npm run capacitor:sync:release:distribution`, then `gradlew
:app:assembleDistributionQualification -PvfMetaId -PvfMetaHex`, then `device-lab/boot-gate.mjs
… --legs install,launch,boot,mind` (`install -r`, data kept). Logs are in the safety folder.

| Build | Change | Boot gate |
|---|---|---|
| 1 | first MUSEick build | GREEN: 0 document JS errors, `:litertmind` /health 200, engine rewind-llama |
| 2 | animation loop fixed (idle cost) | GREEN |
| 3 | lights and visualiser made transform/opacity only | GREEN |
| 4 | old-message fix; lights hold while she speaks | GREEN |

The only boot note was the 2 "safe area CSS" eval errors. They come from Capacitor's bridge, were
there before MUSEick, and the gate excludes them.

## On the phone: function (driven over adb taps and CDP, 3 Nov 17:26–17:46)

| Check | Result |
|---|---|
| MUSEick button on the main screen | ✅ top centre, real tap (`adb input tap`) opens the room |
| Dedicated room, Salty present | ✅ her 3D body renders in the booth window; ‹ Tank puts her back in her tank (checked in the DOM) |
| Competition brief → Salty directs | ✅ Her real reply on the NPU: *"\"Echo Chamber\" - I'd push for a bigger chorus, a soaring, anthemic hook that hits right after the dark drop…"* Title “Echo Chamber” is credited to her, and so is her bigger-chorus push. Text arrived within 5 s and playback started when she finished speaking (~15 s). |
| Four tracks, playback, sections | ✅ 4 lanes × 5 sections, playhead, clock, section ribbon |
| Revision while playing | ✅ "Make the chorus more powerful": the drop changed at once (boost 1 → 2). Her reply: *"…the chorus is now a bloody wall, with the hook hitting right after the drop…"* |
| Her voice over music | ✅ VFLVoice utterances during that reply: **underruns 0, starves 0**. The one `underrunsAtStop` is the end-of-stream drain each utterance logs. Thinking 180 ms after the tap, her voice started 4.65 s after. |
| Ducking | ✅ `ducked` true while she spoke, false afterwards |
| Mic open | ✅ studio 🎙 → Veridity's mic listening → music paused, "Listening — music paused" shown; mic closed → music resumed |
| Leave and re-enter | ✅ song, title and lanes restored; her canvas went back to the tank and returned to the booth |
| Save / new / reopen | ✅ "Saved “Undertow Run”" → New song (empty) → reopened from ♫ |
| Export WAV | ✅ ~30 s render → `Documents/MUSEick/MUSEick-Undertow_Run.wav`: 53.7 s, 44.1 kHz stereo 16-bit, peak −0.6 dBFS, RMS −12.7 dBFS, 0 clipped samples |
| Works offline | ✅ by design: no fetches. CSP is unchanged and the studio makes no network requests. |

**Bug found on the phone and fixed (build 4).** After an app restart, her boot prewarm carried
the conversation from before the restart. The studio's lazy note path read its newest message (an
old brief) as a new one and replaced the song ("Undertow Run", log: "Salty's mind didn't
answer…"). Now only a message added to the log after the studio opened counts. Verified on
build 4: reopening after boot kept the song.

**Salty misreading found on the phone and fixed.** Her phrase "the dark drop" was read as "make the
melody darker". Her mood pushes must now be comparatives ("darker"). Her exact reply is now a test
case.

## On the phone: performance

Method: `top -p <app pid>`, 5 × 4 s average of the app process (100% = one core of eight), plus
`dumpsys gfxinfo` over the same window. Salty's 3D body is rendering in every row, in the tank or
in the booth. The readings are noisy (±10%) because her own render rate changes between 30 and
60 fps.

| Condition | Build | App CPU | Frames: janky / p50 / p90 |
|---|---|---|---|
| Tank only (rest) | 1 | ~45% | 0.07% / 23 ms / 30 ms |
| Studio playing | 1 | ~90% | 0.05% / 21 ms / 25 ms |
| Tank only (rest) | 2 | 54% | 0.08% / 25 / 32 |
| Studio idle | 2 | 46% | 0% / 23 / 26 |
| Studio playing | 2 | 95% | 0% / 23 / 26 |
| playing, visualiser hidden | 2 | 77% | 0% |
| playing, visualiser + glow + lights + meters hidden | 2 | **46%** (= idle) |  |
| Tank only (rest) | 3 | 63% | 0% / 17 / 25 |
| Studio idle | 3 | 49% | 0% / 23 / 27 |
| Studio playing | 3 | 78% | 0% / 23 / 26 |

- **The music itself costs almost nothing.** With the room's lights hidden, playing measured the
  same as idle. Per thread while playing, the app's audio threads were under 1%, and the cost was
  in `Chrome_InProcGpu`, `RenderThread` and `VizWebView`: drawing.
- **Build 1's room was expensive to draw.** It cost ~70% idle: the clock was rewritten every frame
  and every light flash forced a layout. Playing then added ~49%: a 30 fps canvas visualiser and
  box-shadow lights plus a full-room glow repainted on every note. Builds 2 and 3 fixed this: idle
  is now at tank level, and playing adds ~29%.
- **Memory (build 1, playing):** total PSS 2.03 GB, the same order as the tank, since her mind and
  voice dominate. The mind process (`:litertmind`) was unchanged at 563 MB RES.
- **Audio output latency** reported by Web Audio (`baseLatency + outputLatency`): 0.25 s on the
  phone with `latencyHint: "playback"`. That doesn't matter here: every note is scheduled ahead on
  the audio clock, so the beat is steady and only button-to-sound response has this delay.

### Sustained playback (8 samples over about 13 min, loop on, build 4, phone on AC power at 100%)

Corrected 4 Nov: first logged as "8 min, sampled once a minute"; the timestamps in `perf/sustained.txt` show otherwise. `measure.sh` in the safety folder; raw data in `perf/sustained.txt`.

| Minute | App CPU | Janky frames | Skin °C | Battery °C | CPU4 °C | GPU °C |
|---|---|---|---|---|---|---|
| 1 | 85% | 0 | 42.7 | 41.7 | 60.6 | 59.0 |
| 2 | 93% | 0 | 42.9 | 41.7 | 61.4 | 59.8 |
| 3 | 79% | 0 | 43.1 | 41.8 | 61.0 | 59.8 |
| 4 | 79% | 0 | 43.3 | 42.0 | 61.7 | 59.8 |
| 5 | 85% | 0 | 43.5 | 42.2 | 62.9 | 60.6 |
| 6 | 84% | 1 (0.08%) | 43.8 | 42.4 | 62.9 | 61.0 |
| 7 | 80% | 0 | 44.0 | 42.6 | 62.9 | 61.0 |
| 8 | 86% | 1 (0.08%) | 44.2 | 42.8 | 62.5 | 60.2 |

- The loop was still playing at the end, with no stall.
- Skin temperature rose +1.5 °C in ~12 min, which is slow and steady.
- The phone was already warm from an hour of builds and installs, and it was on AC power at 100%.
  An unplugged run is still owed.
- **Tank-only comparison (incomplete).** Straight afterwards, the tank alone measured 68–84% CPU
  at skin ~45 °C for 3 minutes. That is no cooler than the studio playing, since her swims cost
  more than a still booth. Then the screen timed out: nobody had touched it for ~16 min, and the
  app stopped drawing. The other 5 minutes only show the phone cooling to 40.3 °C. A same-length
  tank baseline is still owed.

### Final build (5) on the phone, 18:08

A second brief by CDP: *"Make me a dreamy underwater synthwave song with a glassy melody"*.
- Her reply: *"\"Glass Reef\". I'd push for a bigger chorus, something big and soaring that catches
  the listener in the gut, and then lets them sink back down into the dream."*
- Title “Glass Reef” (hers), bigger chorus (hers). "the dream" correctly made no change.
- Playing at 15 s, ducked while she spoke.
- **Note:** she chose "a bigger chorus" in both briefs. The note lists that option last, which may
  bias her. Worth trying a different order, or not listing options, after the competition.

## Not yet tested on the phone (owed)

- A spoken brief, i.e. his voice through the ears path while the studio is open. The words reach
  the studio by the same log hook as typed ones, but this was not exercised on the device.
- A judgement by ear of the mix on the phone speaker: levels were balanced by measurement, not by
  listening.
- A long session with real conversation and music (thermals unplugged, battery drain).
- Salty's conversational latency with no music, for a fair comparison. The one revision measured
  with music had her voice start at 4.65 s.

---

# Pass 2 (3 Nov, evening): creative direction, wording, composition, polish

Same branch, nothing committed. Starting state was recorded in
`D:\MuseTest_museick_safety_20261103\git_status_pass2_start.txt`; build 5's APK and source were
backed up before any change (`meta_museick_build5_20261103.apk`, `pass2_start_src/`).

## What the tests cover now (`app/scripts/museick_test.mjs`, all OK)

- **Requests vs not:** 20 request phrasings, including the eight in the brief, chained requests,
  "what if…?" and "can you…?", must each produce their op.
- **No change:** 12 non-requests must change nothing: praise ("the dark drop sounds good", "I love
  the heavier drums"), questions about the song ("should the drums be heavier?"), negations, and
  "if… it would be too much".
- **Measurable change:** 19 ops × 6 songs, and every accepted revision must change the notes or
  their timing. Specific checks:
  - "less busy" drops ≥ 8% of the notes;
  - tension leaves a silent beat with nothing ringing into it;
  - the breakdown has no drums in its first half;
  - the countermelody and harmony stay in key;
  - "stronger hook" repeats note for note;
  - walking bass uses passing notes;
  - new chords give a different progression;
  - the atmosphere wash plays;
  - "heavier" at full weight still changes something, and says so.
- **Validity:** every style with every move switched on is valid, in key and ≤ 90 s, and old
  saved songs open with the new moves off.
- **Diversity:** 60 briefs (10 styles × 6 seeds):
  - 14 different ideas were offered;
  - the most frequent took 16% of offered slots (limit 20%);
  - the first-position and last-position options are not dominated by one idea (limit 30%);
  - ideas she already used aren't offered again;
  - every idea label reads back as its op from her reply;
  - the note no longer ends on "a bigger chorus".
- **Her real phone replies are regression cases:** "Echo Chamber", "Neon Graveyard", "a few
  spare pads", "push the break… nothing but the hook and the pads", and two offers kept in her
  order.
- **Seen red** (mutations on a copy outside the repo), all caught:
  - every sentence treated as a request: 10 failures;
  - a fixed idea menu that ignores the song: 4 failures;
  - tension without the silent beat: 2 failures;
  - countermelody a semitone out of key: 11 failures.
- **Existing suites unchanged and passing:**
  - `salty_mind_test`: 28 mutations caught;
  - `helpline_guard_test`: OK;
  - care, life, memory and moods: 29/29;
  - `stop_armed_tank_leg`: 6/6.

## Audio (offline renders in the desktop harness, 22.05 kHz; measured, not listened)

| Render | Peak | RMS | L−R | Clipped | Last 0.25 s |
|---|---|---|---|---|---|
| Competition brief, no new moves | −1.0 dB | −14.1 dB | −0.01 dB | 0 | silent |
| Same, every move on + dramatic ending | −0.5 dB | −14.1 dB | −0.25 dB | 0 | silent |
| Lead + countermelody + harmony only | −1.5 dB | −18.1 dB | −1.72 dB | 0 | silent |
| Drums + bass only | −0.6 dB | −14.4 dB | −0.01 dB | 0 | silent |

The new layers don't raise the overall level, the stereo stays balanced, and the 4 s tail lets
the final hit finish. Solo renders still pass through the glue compressor and limiter, so they
are post-compression levels.

**Phone export (build 7):** "Neon Graveyard", 68.0 s, 44.1 kHz stereo 16-bit, peak −0.3 dBFS,
RMS −15.5 dBFS, 0 clipped samples. Rendered in 40 s, with the counter shown during the render.

## Phone (builds 6–9; boot gate GREEN on every one; build 9 had 0 boot notes)

| Check | Result |
|---|---|
| Install state before each install | `.meta` hash matched the expected build; protected `com.veridity.flow.local` last updated 14 Aug (untouched) |
| Room transition | real tap → booth with her canvas: ~0.55 s including adb/CDP; re-enter ~0.8 s, song restored |
| Brief 1 (build 6) | Offered: countermelody / breakdown / bigger drop. **She picked the countermelody** and argued for it ("Neon Graveyard"). Found: a sentence after it was read together with it → per-sentence reading (fixed, regression case added) |
| Revision (build 6) | "More tension": build 8 bars, 4 clips glowed; her voice started 4.4 s after the tap; **7 utterances, 0 underruns, 0 starves**, margins ≥ 1.8 s. Found: she narrated the suggested ideas as done → "Nothing else changed" + offer as a question (fixed) |
| Revision (build 7) | "Stronger hook": no false claims; she offered the breakdown in her own words ("a few spare pads") → paraphrase added (fixed) |
| Brief 2 (build 8) | "Underwater Paradise": she pushed "the break… nothing but the hook and the pads" (the breakdown, not yet recognised: logged honestly as "kept the studio's draft") → paraphrase added (fixed) |
| Revision + her idea (build 8) | "Less busy": 6 clips changed. She asked "breakdown… or a catchier hook?" → button. **Real tap on the button** → stronger hook applied, credited "Salty's idea; you said yes", and she reacted. **9 utterances, 0 underruns, 0 starves** |
| Save / export | ✅ (build 7, above) |
| Memory | total PSS 2.02 GB while playing (unchanged from pass 1) |

### CPU and heat (app process, 100% = one core of eight; ±10% noise)

| Condition | App CPU | Janky | Skin °C |
|---|---|---|---|
| Build 7: studio idle | 49% | 0.08% | 37.5 |
| Build 7: studio playing | 56% | 0.08% | 37.7 |
| Build 7: tank only | 65% | 0% | 38.0 |
| **Build 9: studio playing, 8 samples over about 7 min, loop** | 73–86% | 0–0.33% | 42.3 → 43.0 (+0.7 °C) |
| **Build 9: tank only, 4 samples over about 3½ min, straight after** | 67–79% | 0–1.8% | 43.1 → 43.3 |

The playing studio now costs about the same as the tank and warms the phone just as slowly. The
loop was still playing at the end of the run. A wake key-press at each sample kept the screen
on, which pass 1's baseline lacked. (Corrected 4 Nov: first logged as 8 and 4 min; each sample
took about 52 s, per the timestamps in `perf/sustained_pass2.txt`.)

**Not unplugged:** the phone was on AC power at 100% for every run. An unplugged run needs
someone to pull the cable.

## The final build, 4 and 5 Nov

- **The music broke up during her long replies.** The owner heard it in the demo video and on the phone. `AudioContext.playbackStats` counted 53 missed deadlines and 1.13 s of silence in two turns, on the 21 ms buffer that `latencyHint: "playback"` gave. With `latencyHint: 0.35` (171 ms) the same kind of turns missed none, over three turns.
- **The music cut in and out under her voice.** It followed each burst of her voice, so it swelled in every gap. It now dips once per turn. On the phone, a studio take logged one dip and one return for each turn.
- **Her window changed size in one frame** when the "Try it" button came and went, because the button added a row. The button now takes the chips' row.
- **The studio was redesigned** (line icons, no emoji or neon, one amber accent, tracks laid out in rows, a new MUSEick logo). The room's 153 sequence checks pass on the final code. The look itself was judged by the owner, not by a test.
- **Boot gate GREEN** on the final APK, sha256 `612f3701…8472`.

## Still owed

- An unplugged sustained run, and battery drain.
- A logged test of a spoken brief through the mic on the device. On 5 Nov the owner reported speaking to the studio by mic on the final build, and that it worked well, but there's no log of it.
- Judging the mix on the phone speaker by ear.
- Her replies vary with every turn, so new paraphrases will turn up. Each one found on the phone
  so far is now a test case.
