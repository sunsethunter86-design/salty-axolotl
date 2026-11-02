"""Print the section/signature layout of the SRQ bundle."""
import sys

sys.path.insert(0, "/mnt/d/MuseTest/tools/convert-venv/lib/python3.12/site-packages")
from litert_torch.generative.export_hf.experimental import litertlm_utils

info = litertlm_utils.peek_litertlm("/mnt/d/MuseTest/experiments/salty/npu/out/model_srq.litertlm")
print(info)
