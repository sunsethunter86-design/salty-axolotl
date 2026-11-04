# MUSEick — Salty's music studio

A recording studio inside Salty's tank, with Salty in the control-room window. You describe a song in ordinary words,
Salty directs it, and four tracks you can play, change and save appear in the studio. Everything
runs on the phone: no cloud, no account, no samples downloaded from anywhere.

## Where it lives

| File | What it does |
|---|---|
| `app/public/museick/museick-theory.mjs` | Seeded randomness, scales and modes, chords, voice leading |
| `app/public/museick/museick-plan.mjs` | The song plan and its validator; the rules that read his words (request or description first) and Salty's reply; her idea menu |
| `app/public/museick/museick-compose.mjs` | Plan → editable clips → timed note events, including the arrangement moves; the song check (`validateSong`) |
| `app/public/museick/museick-audio.mjs` | Synthesised instruments, effects, stereo placement, look-ahead scheduler, ducking, offline WAV render |
| `app/public/museick/museick-room.mjs` + `museick.css` | The studio room, timeline, clip editor, songs, export, and Salty's part |
| `app/public/salty-tank.mjs` | The MUSEick button, plus three small hooks (studio note, his words, no swims while in the studio) |
| `app/scripts/museick_test.mjs` | Composer, validator, word rules, ideas, attribution; broken on purpose |

The studio module loads only when the button is pressed, so the tank's start-up is unchanged.

## How Salty takes part (and what she does not do)

1. **His words are read by rules** (`museick-plan.mjs`).
   - Each sentence is first sorted into a request or not. Only a request changes the song.
   - "The dark drop sounds good", "should the drums be heavier?", "don't slow it down" and "if
     the drums were heavier it would be too much" change nothing.
   - A brief makes a new plan straight away. A request changes the plan straight away, and every
     accepted request changes the notes, which the tests check.
2. **The same words then go to Salty as an ordinary turn**, through Veridity's own form, so the
   crisis net still runs first.
   - A short studio note rides on his message by the same route as her care and memory notes
     (`turnNotes` → `adaptMessages`). Her trained system prompt is not touched.
3. **For a new song the studio offers her three ideas**:
   - only ideas this song doesn't have yet, weighted by style;
   - never ones she has already pushed this session;
   - in an order set by the song's seed, so no option always comes last.

   She names the track and says which idea she'd push and why, or offers one of her own.

   This replaced a fixed seven-item list ending in "a bigger chorus", which she picked twice out
   of two on the phone. On the phone since then: the countermelody ("Neon Graveyard") and the
   breakdown ("Underwater Paradise").
4. **After a change she is told only what changed** ("Nothing else changed"), and asked to offer
   two next ideas as a question.
   - An idea she offers becomes a **Try Salty's idea** button. It is applied only if he taps it.
5. **Her reply is read sentence by sentence and clause by clause**:
   - a name in quotes becomes the title;
   - a push becomes a change, credited to her;
   - mood pushes must be comparatives ("darker", not "dark");
   - negated sentences are ignored;
   - she can't mute, solo or change the genre.
6. **The Director's log names who decided each thing:** `You` (rules on his words), `Salty`
   (rules on her words, or her idea he accepted), `Studio` (a default, the idea menu, or a
   fallback). When she picks from the menu, the log says "her pick from the studio's three ideas";
   when she offers something else, "her own idea".
7. **If he asks for more of something already at full strength** (heavier drums at full weight,
   a drop already maxed), the studio makes the nearest real change instead, such as fills or a
   harmony. It says so, and her note tells her to tease him.
8. **If her mind is asleep or silent**, the studio's own draft stands, it gets a studio-made
   title, and the log says so.

Salty never writes notes, JSON or a plan. She writes one or two sentences in her own voice, at
her usual ~9 tokens a second. The studio does everything else in milliseconds.

## Musical identity

- **One hook per song.** The Groove states it (bars 1 and 3, an answer in bar 2, a cadence in
  bar 4), the Drop sings it higher and fuller, the Outro remembers it, and a breakdown carries it
  softly.
  - "Stronger hook" makes it a syncopated motif that comes back note for note.
- **Question and answer.** The second time round an 8-bar section, the phrase ends on the home
  note.
- **Two-bar drum phrasing**: an extra kick every second bar, an open hat every fourth. There are
  three fill shapes (snare run, tom run, kick-snare), at section ends or every four bars with
  "more fills".
- **Arrangement moves** (all off by default; songs saved earlier open unchanged):
  - **Breakdown:** the build opens on pads and the hook alone.
  - **Tension:** the build is 4 bars longer, and the beat before the drop is silent.
  - **Countermelody:** two long notes a bar, stepping through the chord tones, on the left.
  - **Harmony:** the hook doubled a third above.
  - **Atmosphere:** a wash of filtered "deep-sea air" in the intro and outro.
  - **New chord turn:** steps round the mood's progressions.
  - **Walking bass:** passing notes lead into the next chord.
- **Every note stays in the key** (chords apart from a minor V's leading tone), checked across
  every style with every move switched on.

## Hardware split (ROG Phone 8 Pro, Snapdragon 8 Gen 3)

| Unit | Work | Change from Salty without MUSEick |
|---|---|---|
| Hexagon NPU | Salty's Llama 3.2 3B (Q6_K GGUF) | none: no second model, no extra requests |
| Adreno GPU | Her 3D body (in the booth window), the room's compositing | the room's lights and visualiser are transform/opacity only |
| CPU | Composer (ms per change), Web Audio synthesis, her Pocket voice | measured: TEST_LOG.md |

## Sound

Every instrument is synthesised in code from oscillators, filters and one noise buffer. Nothing is
fetched, decoded or shipped as a recording, so no sample redistribution rights are needed and no
dependency was added.

- **Drums:** synthesised kick, snare, clap, hats, crash and toms. Kits: Punchy, Heavy, Club, 808,
  Dusty.
- **Bass:** Dirty, Sub (with a quiet octave partial so a phone speaker can play it), Pluck, 808.
  In styles without the sidechain pump, the bass still dips for the first 40 ms of each kick.
- **Chords:** Warm pad, Synth stabs, Power chords, Electric keys, voice-led. They sit slightly
  left of centre.
- **Lead:** Supersaw, Square, Glass bell, Pluck, slightly right. The countermelody uses a
  contrasting voice further left.
- **Mix:** reverb and delay sends, a sidechain pump for house, techno and synthwave, a glue
  compressor, a limiter, section filter sweeps, a build riser, a drop impact, and a fade or a
  dramatic final hit. Exports carry a 4 s tail.

Her voice comes first. The music dips to 16% once, when her turn starts, stays down through every
gap in her voice, and comes back once, over about 2 s, after she has finished. The studio's lights
hold still meanwhile. The song plays through a 171 ms audio buffer, because a smaller one broke up
while her mind and voice were busy. While the mic is open the music pauses, because her ears' echo reference doesn't include the web page's audio.

**Measured:** levels, clipping, stereo balance and tails (TEST_LOG.md). The owner has listened to it
in the demo video. The mix hasn't been judged on the phone's own speaker.

## Known limits

- The rules are English and keyword-based. A phrasing they don't know changes nothing, and the
  log shows no change. Her paraphrases were extended from her real phone replies, but she will
  find new ones.
- Salty sometimes echoes the note's wording ("…and nothing else changed"), and adds flavour that
  isn't a change ("a sub that moves like a heartbeat"). Only changes in the log are real.
- Editing a clip and then asking for a revision of that track recomposes it, which replaces the
  edits. Undo brings them back.
- WAV export takes ~40 s on the phone for a ~64 s song and is refused while she is speaking.
- Music never plays while the mic is open. A spoken brief has not yet been tested on the device.
