# Provenance

## Base model (read-only, never modified)

`D:\MuseTest\convert\Llama-3.2-3B-Instruct`, downloaded 26 Oct 2026 from Meta's official Hugging Face repo `meta-llama/Llama-3.2-3B-Instruct`, revision `0cb88a4f764b7a12671c53f0838cd831a0843b95`. SHA256 recorded 26 Oct:

| SHA256 | Bytes | File |
|---|---:|---|
| `11ad7efa24975ee4b0c3c3a38ed18737f0658a5f75a0a96787b576a78a023361` | 1,519 | .gitattributes |
| `39fb36dc5416f445ebc4e71cb71fbcf6727e80a35836d8ba1a1474c318467b7a` | 878 | config.json |
| `88effbb63300dbbc7390143fbbdd9d9fa50587b37e8bfd16c8c90d4970a74a36` | 189 | generation_config.json |
| `0b4284c1f87029e67654c7953afa16279961632cf73dcfe33374c4c2f298fa35` | 7,712 | LICENSE.txt |
| `13cbd6d16e927a0c5bad54102514e6e18b4a47b3a6eb911e39d678d328d19f55` | 4,965,799,096 | model-00001-of-00002.safetensors (matches the HF-recorded checksum) |
| `7b770216613ac5c34d7c54bdff1fa616bc4e338a9d0b20af6303e48c295ee23c` | 1,459,729,952 | model-00002-of-00002.safetensors |
| `0a57c30afc07c81610ae7fe013bea3b9d50365f9a8145ae98e8714220f3d7c7c` | 20,919 | model.safetensors.index.json |
| `8cea167f3aa4dbeea16d32caf6e446184e7e9aa9ebae7de6e3259ea049874570` | 41,744 | README.md |
| `6f38c73729248f6c127296386e3cdde96e254636cc58b4169d3fd32328d9a8ec` | 296 | special_tokens_map.json |
| `79e3e522635f3171300913bb421464a87de6222182a0570b9b2ccba2a964b2b4` | 9,085,657 | tokenizer.json |
| `9823dcfdc1121869029da45192238e85cf44f0b232a6d9dc20e4fe6f4242a14e` | 54,528 | tokenizer_config.json |
| `40e2777d7faa6beaf98400654170f414d8ab29b921b5163ad4ea0a1d39894201` | 6,021 | USE_POLICY.md |

Stock conversion: `D:\MuseTest\models\llama-3.2-3b-instruct\llama3_2_3b_instruct_int4_b32_emb8_c4096.litertlm`, SHA256 `72c7430d20216536f42000ae63c9cc6a7bceb63d395cc83bfd7fe50afc31311d`.

## Training data

Every chat carries `source` and `status`. `build_train.py` writes `data/build/MANIFEST.json` listing exactly which chats went into a build, with the build file's hash.

| Source label | What it means |
|---|---|
| `claude-proposed-2026-10-26` | Drafted by Claude (Claude Code, Opus 5.5) on 26 Oct as *proposals* for Shaun to review, rewrite or reject. Shaun did not write them. |
| `claude-written-2026-10-26` | Bulk chats written by Claude (Claude Code, Opus 5.5) on 26 Oct after Shaun asked it to write the rest ("can you do the rest if we need any more please?"). Same terms question as the seeds. |
| `shaun-YYYY-MM-DD` | Written or rewritten by Shaun. `shaun_batch_00.jsonl` (20 chats, 26 Oct) is Shaun's own writing; ChatGPT wouldn't write the replies. |
| `generated-chatgpt-ari-<date>` | Bulk candidates written by Ari (ChatGPT) from `data/candidates/ARI_BRIEF.md`, chosen by Shaun on 26 Oct. Batches are logged in `data/candidates/GENERATION_LOG.md`. OpenAI's terms on using output to train models apply (UNVERIFIED for this use; Shaun's call). |

**Open question:** before Claude-written text is used to train a model, Shaun should check that Anthropic's terms allow it for this use (a small personality LoRA in a hackathon showcase). UNVERIFIED either way. The same question applies to any other generator. If in doubt, Shaun rewrites the seeds in his own words, and generation uses a source whose terms clearly allow it. Llama's own outputs are allowed by the Llama licence, with the naming duty in `LICENCE_NOTES.md`.

## Review decisions

Status changes go in the chat's own `status` field (`proposed`, `approved`, `needs_edit`, `rejected`), with a `notes` field for the reason. Rejected chats stay in the file so the decision is on record.
