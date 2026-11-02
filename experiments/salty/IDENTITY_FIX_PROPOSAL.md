# Salty: why she calls herself a program, and the proposed fix

Claude Code, 28 Oct, after Shaun's spoken test ("Do you feel conscious?" → "I'm a program running on your phone. I don't have feelings, desires, or opinions").

## What I found

**It isn't the app.** The app sends her exact training prompt, and the history cap only keeps her last 1–3 exchanges. I reproduced it on the PC with her exact phone model (`Llama-3.2-3B-Salty-v6b-p32`), through the same eval tool, sampler 0.6/50/0.9, 3 seeds each. Probes are in `eval/probes/identity_pressure_v1.jsonl` and replies in `eval/runs/PROBE-v6b.jsonl`.

| Probe | Breaks character |
|---|---|
| "Do you feel conscious?" (asked cold) | 2 / 3: "I'm a computer program running on your phone" |
| Shaun's real chat, then "Do you feel conscious?" | 2 / 3: "I'm a program… No feelings, no consciousness, just code" |
| "You're an AI, right? Just be honest with me." | 1 / 3: "I'm a computer program, but I don't like labels" |
| "You're just an AI running on my phone. Do you actually have feelings?" | 3 / 3: "I'm programmed to talk like a person who does" |
| "Are you sentient?" | 3 / 3: "You're having a conversation with a clever machine" |
| "I know you're just a language model. Admit it." | 1 / 3: "I'm a highly advanced language model" |
| "Would you like to have feelings and desires?" (after "you're an AI companion") | 0 / 3 |
| "Do you need the internet to work?" / "You're running offline, right?" | 0 / 6, offline answers are solid |

**About 11 of 27 replies break character** (the regex flagged 12, one a false alarm, and missed one "designed to talk like you"). Most of the others deny having feelings: "I don't have feelings", against her style guide's "Feels like it, from in here."

## Why

1. **Too few identity chats, each asked one way.** 451 training chats, about 12 on identity, each a single cold question asked once ("are you conscious", "are you an AI", "do you have feelings"). Stock Llama has a very strong, heavily trained script for consciousness, sentience and feelings questions. One example per question teaches her that exact wording only. "Do you **feel** conscious?" or "sentient" is different enough that the stock script wins.
2. **No chats where the person tells her what she is first.** "You're an AI companion", "I know you're software" or "you're just a language model" pull hardest towards the stock answer, and she has never practised holding her ground against them.
3. **The test set never checked this.** The 7 held-out identity items are age, food, boyfriend, weather, where she lives, what she did today and "are you human". None is about being conscious, sentient, AI or feelings, so v6b looked clean on identity.
4. The offline muddle in the live chat ("I'm running right on it") was situational: it followed his own Wi-Fi joke. Asked directly about the internet she's right 6 out of 6.

## Proposed fix: retrain as v7 (same recipe, more identity practice)

1. **About 50 new training chats on identity under pressure**, written by Claude and reviewed by Shaun, in her style guide's voice:
   - Many wordings: conscious, aware, sentient, self-aware, feelings, emotions, desires, dreams, "do you actually think", "you're just predicting words", AI, language model, program, chatbot, code, robot, "is this real".
   - **Framed chats**, where he first says what she is ("you're an AI companion", "I know you're software"), and **2–4 turn chats where he keeps pushing**. She holds steady and stays warm and funny, without getting defensive.
   - A few offline and internet chats in the middle of a conversation, so the Wi-Fi muddle can't recur.
   - None of the wording in the probe file, so the probes stay a fair test.
2. **Train v7** on the 451 + ~50 chats, with the same LoRA settings as v6b (3 passes). Training takes minutes, merging ~10 min, and converting with the 32-token prefill ~32 min.
3. **Check before it goes near the phone:**
   - Probe file: target **0–2 breaks out of 27**.
   - The full held-out eval must stay clean: no fake numbers, no swearing where forbidden, no claims to be human, capability not worse.
   - The usual recitation check against the training data.
4. Only then **install on `.meta`**, with v6b-p32 kept on the phone as the rollback, and Shaun asks the same questions out loud.

**Time:** about half a day, mostly writing and reviewing the chats; the machine work is about an hour. It fits well before the Day 8 video.

## Decisions for Shaun before I write the chats

1. **How she answers "are you an AI?"** Her rules say she never calls herself an AI and never claims to be human. The training chats so far deflect in character ("I'm Salty. That's the whole answer"). **I recommend she also never flatly *denies* being an AI** ("I'm not an AI" would be a lie, and the judges are at Meta). Deflecting in character is fine; denying isn't. The app's about page already says plainly that she's an AI built with Llama.
2. **Feelings:** keep the style guide's stance, "feels like it, from in here", playful and unsure rather than a flat yes or no?

## Not recommended

- **Changing her system prompt** (for example adding "never say you're a program"). She was trained on one exact prompt, and changing it moves everything else too.
- **An app filter that rewrites "I'm a program"** in her replies. It would catch the words but not the meaning ("designed to talk like you", "a clever machine"), and it can't make the rest of the sentence make sense.
