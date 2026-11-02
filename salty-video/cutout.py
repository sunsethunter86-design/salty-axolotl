# Cuts Salty out of a clip with BiRefNet and writes a see-through (alpha) WebM loop.
#   .venv\Scripts\python.exe cutout.py raw\clip2_7c0c5a72.mp4 22 239 loops\idle_listen_cut.webm [x0,y0,x1,y1]
# Frames first..last play forward then back (a bounce), like make_loops.ps1.
# The optional box marks where her see-through tail fin is (frame pixels, below the gills): there the fin is
# made more solid and tinted toward her own skin pink, so the couch behind it in the original clip doesn't show.
import subprocess, sys
import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModelForImageSegmentation

FF = r'C:\Users\Shaun\Downloads\ffmpeg\bin\ffmpeg.exe'
src, first, last, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
tail_box = [int(v) for v in sys.argv[5].split(',')] if len(sys.argv) > 5 else None
W, H = 1280, 720

raw = subprocess.run([FF, '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)[first:last + 1]
print(f'{len(frames)} frames', flush=True)

model = AutoModelForImageSegmentation.from_pretrained('ZhengPeng7/BiRefNet', trust_remote_code=True)
model = model.to('cuda').eval().half()
mean = torch.tensor([0.485, 0.456, 0.406], device='cuda').view(1, 3, 1, 1)
std = torch.tensor([0.229, 0.224, 0.225], device='cuda').view(1, 3, 1, 1)

masks = []
with torch.no_grad():
    for i, fr in enumerate(frames):
        x = torch.from_numpy(fr).to('cuda').permute(2, 0, 1)[None].float() / 255
        x = F.interpolate(x, (1024, 1024), mode='bilinear', align_corners=False)
        pred = model(((x - mean) / std).half())[-1].sigmoid().float()
        masks.append(F.interpolate(pred, (H, W), mode='bilinear', align_corners=False)[0, 0].cpu().numpy())
        if i % 40 == 0:
            print(f'  mask {i}/{len(frames)}', flush=True)
m = np.stack(masks)

# Smooth each pixel over neighbouring frames so the fluffy gill edges don't flicker.
sm = m.copy()
sm[1:-1] = 0.25 * m[:-2] + 0.5 * m[1:-1] + 0.25 * m[2:]
if tail_box:
    x0, y0, x1, y1 = tail_box
    region = np.zeros((H, W), np.float32)
    region[y0:y1, x0:x1] = 1
    k = np.ones(41, np.float32) / 41                     # feather the box edge over ~40 px
    region = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 0, region)
    region = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, region)
    fixed = []
    for fr, a in zip(frames, sm):
        f = fr.astype(np.float32)
        rg = f[..., 0] - f[..., 1]
        skin = (a > 0.97) & (rg > 18)                    # solid, clearly pink skin anywhere on her
        pink = np.median(f[skin], axis=0) if skin.sum() > 500 else np.array([236., 196., 200.])
        part = np.clip((a - 0.35) / 0.3, 0, 1)           # only the fin's inside gets more solid; its soft edge stays soft
        thin = np.clip((1 - a) * region * 1.6, 0, 1)     # how see-through each fin pixel was (edge pixels too)
        # the couch (grey-brown) also shows through in the clip's own colours: compare each pixel's colour mix
        # (rgb / brightness) with her skin's; shadowed skin keeps the same mix, grey or brown couch doesn't
        mix = f / np.maximum(f.mean(axis=2, keepdims=True), 1)
        off = np.linalg.norm(mix - pink / pink.mean(), axis=2)
        grey = np.clip((off - 0.05) / 0.12, 0, 1)
        # the fin is darker than her skin wherever the couch showed through it, so in the tail area
        # anything well below her skin's brightness counts as couch too
        dark = np.clip((0.8 * pink.mean() - f.mean(axis=2)) / (0.35 * pink.mean()), 0, 1)
        grey = np.maximum(grey, dark) * region
        thin = np.maximum(thin, grey * 0.9)
        # her pink colour, keeping the fin's detail...
        lum = f.mean(axis=2, keepdims=True)
        # ...with the couch-dark parts lifted toward her skin's brightness, so it reads as a pink fin
        lift = np.clip(0.8 * pink.mean() - lum, 0, None) * grey[..., None]
        rgb = f + (pink * ((lum + lift) / pink.mean()) - f) * thin[..., None]
        fixed.append(np.clip(rgb, 0, 255).astype(np.uint8))
        a[:] = a + (1 - (1 - a) ** 3 - a) * region * part
    frames = np.stack(fixed)
alpha = np.clip(sm * 255 + 0.5, 0, 255).astype(np.uint8)

order = list(range(len(frames))) + list(range(len(frames) - 2, 0, -1))
enc = subprocess.Popen([FF, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', '24', '-i', '-',
                        '-vf', 'unsharp=5:5:0.6:5:5:0', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24',
                        '-row-mt', '1', '-auto-alt-ref', '0', out], stdin=subprocess.PIPE)
for k in order:
    enc.stdin.write(np.dstack([frames[k], alpha[k]]).tobytes())
enc.stdin.close()
enc.wait()
np.save(out.rsplit('.', 1)[0] + '_alpha.npy', alpha[::40])   # a few masks kept for checking
print('wrote', out, f'{len(order)} frames', 'exit', enc.returncode)
