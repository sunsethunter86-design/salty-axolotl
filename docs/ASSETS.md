# External assets — excluded from Git, required for reproducibility

These files are **not in Git** (see [`.gitignore`](../.gitignore)). They are
proprietary model weights or large binaries that exceed sensible Git hosting.
Each entry records the exact identity (SHA-256), expected location, and how to
obtain or rebuild it. Never make the Salty weights publicly accessible.

Verify any copy with: `Get-FileHash <file> -Algorithm SHA256` (PowerShell) or
`sha256sum <file>` (Linux).

## Shipping model — required to run Salty on device

| File | Bytes | SHA-256 | Expected location |
|---|---|---|---|
| Llama-3.2-3B-Salty-v7a-Q6_K.gguf | 2,643,853,728 | `EEC528F26C632A6BC50DEDDD9D7051B4D9DB0F6F9D2BDFB689E95B6F0F05B065` | `experiments/salty/npu/gguf/` |

This is the model the `.meta` Hexagon lane loads (`LiteRtMindService` selects
`Llama-3.2-3B-Salty-v7a-Q6_K.gguf`; the app copies it to internal storage before
opening it, because external FUSE storage fails `fastrpc_mmap`). It is the
identical file also present as `salty-v7a-Q6_K.gguf` in the same folder.
Retrieval: from Shaun's local backup only — there is no public download.
Rebuild: quantise `salty-v7a-f16.gguf` with llama.cpp `llama-quantize` (Q6_K).

## Other GGUF quantisations (evaluation / comparison, same folder)

| File | Bytes | SHA-256 |
|---|---|---|
| salty-v7a-Q4_0.gguf (= Llama-3.2-3B-Salty-v7a-Q4_0.gguf) | 1,917,190,560 | `6779CEA7656D1453341765B0E33A50091D19022E77C9B78B8DE2CF99FFD8B197` |
| salty-v7a-Q8_0.gguf (= Llama-3.2-3B-Salty-v7a-Q8_0.gguf) | 3,421,899,168 | `A6939AD494D7E6F253B5FE4B276D1A7DA235CF98B3B5E14C6762662E400977DF` |
| salty-v7a-Q5_K_M.gguf | 2,322,153,888 | `745014CE1CA999909FBE783CB0F350E535AA36626C12E1EC2A9DD98328614A33` |
| salty-v7a-f16.gguf (quantisation source) | 6,433,687,968 | `1379A4F37B94FEF49916ECF3BB9C47EC567F2FF3166765CF8B721FDBB3AD99BF` |

## LiteRT experiment artefact (parked NPU-via-LiteRT path)

| File | Bytes | SHA-256 | Location |
|---|---|---|---|
| model_srq.litertlm | 2,029,064,190 | `9F3A97D7998E0C5A89EC430572EF94D3ECC5033F25C2755E04AF88C039B90867` | `experiments/salty/npu/out_i4/` |

Kept for the record; the shipping path is llama.cpp Hexagon, not LiteRT.

## Shipped Android assets excluded by the `*.onnx` rule

These live inside the app source tree and are packaged into the APK, but are
too large for plain Git (GitHub rejects files >100 MB without LFS):

| File | Bytes | SHA-256 | Expected location |
|---|---|---|---|
| alternate.onnx | 568,032,787 | `59FD8DD78926E15907AB419303179E4196BDEDD710E888773E2F0143FE430897` | `app/android/app/src/main/assets/semantic-memory-f08/` |
| primary.onnx | 73,091,212 | `FBAD39B295E8267D8A84130E55D9F38EB7C7FA8FF03E6CBD656C96ED91763C85` | same |
| tokenizer.onnx | 2,720,387 | `3F8EC46308D89DA827933F0EEAEE5A2D65E4ED5656428DA83190AF00A7E757B5` | same |

A fresh clone **will not build a fully functional APK** until these three
files are restored from Shaun's local copy. This is intentional: no paid LFS
was approved.

## Staged native libraries (rebuilt, not stored)

`app/android/app/{hex,llama,rewind,lfm-lab}-jniLibs/` are build outputs.
Rebuild the Hexagon set with `app/android/app/native-hex/build_hex_native.sh`
(WSL/Linux, Android NDK). The Hex lane build fails closed if they are absent.
The llama.cpp checkout used for this lives in `tools/llama.cpp` (excluded
build trees; re-clone ggml-org/llama.cpp, master `0893ec9`).

## Training weights and base models (local only)

`models/`, `convert/`, `experiments/salty/train/runs/`, `hf-cache/` hold base
Llama-3.2-3B weights and fine-tune runs (v1–v7b). Base models come from
Hugging Face (Meta licence); Salty fine-tunes are private to Shaun. Sources,
datasets, and training scripts *are* tracked under `experiments/salty/`.
