# MUSEick — demo script (about 2½ minutes)

**Before recording:** charge the phone, set the volume to about 70%, and open the app on the
`.meta` build so Salty is in her tank and awake. In MUSEick open the song list (top right) → New song, so the studio
starts empty, then tap Tank. Her replies are generated live, so they differ every take. Do
two or three takes and keep the best.

| # | On screen | Do / say | What the audience should see |
|---|---|---|---|
| 1 | Salty in her tank | Let her swim a few seconds. | Her own life: the 3D model, her moods, the tank. |
| 2 | Tank | Tap **MUSEick** (top centre). | The studio opens; she moves into the booth window. |
| 3 | Empty studio | Type a distinctive brief, e.g. *"Make me a moody synthwave track about swimming through a neon shipwreck at midnight."* | Four tracks appear at once, and the log shows the three ideas the studio offered her. |
| 4 | "Salty is directing…" | Wait ~5 s. | She names it in her own voice and argues for one idea ("I'd push for the countermelody…"). The title becomes her name for it. |
| 5 | Music starts | Let it run into the Build and the Drop. | Playhead, section ribbon, meter bridge. The clips she changed are outlined when her idea lands. |
| 6 | Playing | Tap **More tension** (or say *"build more tension before the drop"*). | The Build grows 4 bars, the beat before the drop goes silent, the changed clips are outlined, and the confirmation says how many changed. The music dips under her turn while she reacts. |
| 7 | Her offer | She asks if you want to try something next; a **Try Salty's idea** button appears. Tap it. | Her idea goes in, and the log says *Salty's idea; you said yes*. |
| 8 | Lanes | Tap a Drums clip in the Drop, toggle a few steps, then Done. Mute Bass, solo Lead, change a sound. | Full manual control: every button is real. |
| 9 | Song list | Save this song. | "Saved “…”". |
| 10 | Song list | Export WAV. | The render counter ("Rendering… 12 s (song 64 s)"), then "Saved … to Documents/MUSEick". |
| 11 | Director's log | Open it. | Who decided what: You, Salty, Studio. Nothing is faked. |
| 12 | Tank | Back to the tank. | She swims home. |

## What to say (all measured or true; don't go further)

- **What it is:** Salty's own studio. You talk, she directs, and the studio composes four tracks
  you can play, change and keep.
- **How Salty takes part:** her fine-tuned Llama 3.2 3B, running on the phone's Hexagon NPU,
  answers in her own words.
  - For a new song, the studio offers her three ideas that fit it. She picks one and argues for
    it, or brings her own.
  - After each change, she offers what to try next, and you decide.
  - The log credits every decision to whoever made it.
- **Why it's local:** her mind, her voice and every instrument run on the phone. Nothing is sent
  anywhere: no samples, no cloud music model, no account.
- **How it fits the hardware:**
  - The NPU stays hers alone, with no second model.
  - Her 3D body renders on the GPU in the booth window.
  - Composing takes milliseconds.
  - Her voice had no underruns while music played (TEST_LOG.md).
- **Why it's different:** you don't start from presets and loops. You describe a song, and an AI
  character with her own opinions runs the session with you. You can still take every track over
  by hand.

**Don't claim:** that Salty writes the notes (the studio's rules do); that she hears the music
(she doesn't); that the mix has been judged by ear; any figure that isn't in TEST_LOG.md.
