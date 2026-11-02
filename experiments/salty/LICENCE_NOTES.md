# Licence notes (release requirement: keep the experiment private until these are met)

Source: `D:\MuseTest\convert\Llama-3.2-3B-Instruct\LICENSE.txt` (Llama 3.2 Community License Agreement, version release date 25 September 2024) and `USE_POLICY.md` (Llama 3.2 Acceptable Use Policy), both as downloaded with the weights on 26 Oct. RESEARCH.md section E covers the app side.

## What applies if a salty model is shared, published, or shipped in an app

From section 1(b) of the licence:

1. **Give a copy of the licence** with the model (i).
2. **Prominently display "Built with Llama"** on a related website, user interface, blog post, about page or product documentation (i).
3. **Name:** a model trained or fine-tuned with Llama materials or outputs that is distributed or made available must have **"Llama" at the beginning of its name** (i). For example: `Llama-3.2-3B-Veridity-Salty`.
4. **Notice file:** keep this exact text in a "Notice" text file shipped with copies: *"Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved."* (iii)
5. **Follow the Acceptable Use Policy and applicable law** (iv).

The naming rule alone isn't enough; all five apply together. Section 2 (the 700 million monthly users threshold) doesn't apply here.

## Acceptable Use Policy points that touch this experiment

- **Item 18: don't represent Llama output as human-generated.** Shaun decided on 27 Oct that she doesn't call herself an AI and feels alive as far as she knows. The line that stays: she **never claims to be a human or a real person**. Asked, she says no in character (an axolotl with gills). The dataset checker and the eval both enforce this, and the app's about page should still say plainly that Salty is an AI built with Llama. The baseline already shows this matters: the stock model with the current salty prompt said "of course I'm human!" (eval item ev-idn-03, 26 Oct).
- **Harassment and bullying (section 1, item 1), self-harm (item 12):** her swearing is never aimed at people or groups to hurt, and she never encourages self-harm. The sincere and safety chats in the seed set exist for this.
- **Section 4: disclose known dangers of your AI system.** Note this for the app's about page if the salty model ships.

## Still to confirm (UNVERIFIED)

- Whether the hackathon's own rules add anything about fine-tuned models or their naming (check at kickoff).
- The terms of whatever generates the bulk training chats (see `PROVENANCE.md`).
- Re-read the full licence and policy on Day 7 before anything is shared.
