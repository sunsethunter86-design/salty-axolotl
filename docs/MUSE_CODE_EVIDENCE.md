# Muse Code on Salty: evidence for the submission

*Gathered 2 Nov 2026 from Helicon's own session database (read-only copy), Muse's settings and the project notes. Times are Adelaide (ACDT). Kickoff: Mon 26 Oct 12:00 PM ET = Tue 27 Oct ~02:30 Adelaide.*

## Why this matters

The Participant Guide says a project "must incorporate Meta's models" and lists Muse Wonder (through Meta Model API) and "code faster with Muse Code coding agent". Stage One judging asks whether the project "reasonably used Meta Model API and/or Meta's open-weight models **to build the project** in the Hackathon".

Salty used both:

1. **Muse Code on Muse Wonder 1.0 (Meta Model API)** to build her, paid with Shaun's Muse subscription and then his $150 Meta Model API credits (now used up).
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
| 29 Oct 12:00 – 30 Oct 19:16 | Verify Salty 3D tank integration and capabilities | muse-wonder-1.0 | 1,220 | 410,165 |
| 30 Oct 19:20 – 31 Oct 00:44 | Continuing Salty work on local PC | muse-wonder-1.0 | 366 | 130,123 |

Totals: 2,410 calls, of which **2,311 after kickoff** (about 875,000 output tokens). The 93 earlier calls were planning chats, not shipped code.

## What Muse was asked to do (from the project's own notes)

- `PLAN.md` (written by Muse: "Muse (me, this assistant)"): the hackathon plan, Llama-on-phone strategy, stop-loss, licence duties.
- `RESEARCH.md`: which Meta models run on a phone, runtimes, rewind, licence.
- `PITCH.md` and `experiments/salty/`: Salty's character, style spec, eval rubric, fine-tune data and training plan.
- `MUSE_PROMPT_SALTY_SPEED.md`, `MUSE_PROMPT_SALTY_TRANSITIONS.md`: Muse jobs on her reply speed and her idle/talk transitions; `experiments/salty/SPEED_REPORT.md` is the speed result.
- `HANDOVER_TO_MUSE_20261029.md`: hand-over to Muse for 29 Oct onwards (API-credit switch, 3D tank integration).
- `experiments/salty/NATIVE_PROPOSALS.md`: proposals Muse wrote for native-side work it was not allowed to change.

**Not yet verified:** which exact files each Muse session changed. Helicon keeps turns and usage but no shell log (`shell_runs` is empty), and git history was squashed on 30 Oct (`6e00ce9`). If the write-up needs file-level credit, read the session turns in Helicon itself.

## How to show it (suggestions)

- Write-up: one short section "Built with Muse Code" naming Muse Wonder 1.0, the dates and call count, and what it worked on.
- Video: 3–5 seconds of the Helicon session list for Salty, then back to Salty.
- Keep the honest split clear: Muse Code (Model API) built her; Llama 3.2 3B (open weights) is her brain on the phone; Claude Code also worked on the project.
