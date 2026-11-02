# Paints the black pump hose out of reef.jpg, then re-crops the tank's inside to reef_inside.jpg.
#   D:\VoiceAudition_20260804\venv\Scripts\python.exe -I fix_reef.py
# The hose is the only thing in its corner with almost no red or green. Each column of the hole is filled
# by mirroring what's just above it (wall, fronds) into the top half and what's just below (purple coral)
# into the bottom half, so the real texture carries across instead of a smear.
import cv2
import numpy as np

im = cv2.imread('reef.jpg')
H, W = im.shape[:2]
x0, x1, y0, y1 = 15, 262, 240, 372                     # the hose's corner of the photo
b, g, r = [im[..., i].astype(int) for i in range(3)]
mask = np.zeros((H, W), np.uint8)
box = (slice(y0, y1), slice(x0, x1))
mask[box] = ((r < 60) & (g < 55))[box].astype(np.uint8) * 255
# its pale, lit top edge has more red and green, so the hose's traced outline is added to the colour test
outline = np.array([(15, 250), (92, 246), (122, 252), (256, 316), (260, 364), (120, 354), (15, 350)], np.int32)
cv2.fillPoly(mask, [outline], 255)
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))

out = im.astype(np.float32).copy()
for x in range(x0, x1):
    ys = np.flatnonzero(mask[:, x])
    if not len(ys):
        continue
    top, bot = ys.min(), ys.max()
    for y in range(top, bot + 1):
        above = im[max(0, 2 * top - y - 1), x].astype(np.float32)
        below = im[min(H - 1, 2 * bot - y + 1), x].astype(np.float32)
        w = (y - top) / max(1, bot - top)
        out[y, x] = (1 - w) * above + w * below

# soften the seams: blur the filled area a touch and fade it in at the hole's edge
filled = cv2.GaussianBlur(out, (5, 5), 0)
soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (11, 11), 0)[..., None]
clean = (im * (1 - soft) + filled * soft).clip(0, 255).astype(np.uint8)
cv2.imwrite('reef_clean.jpg', clean, [cv2.IMWRITE_JPEG_QUALITY, 95])
inside = clean[62:62 + 816, 22:22 + 1388]
cv2.imwrite('reef_inside.jpg', inside, [cv2.IMWRITE_JPEG_QUALITY, 95])
print('hose pixels painted:', int((mask > 0).sum()))

# reef_inside.png: the same picture with its plain background (the photo's own wall and empty blue water)
# half see-through, so the room behind the tank shows through its back glass. Sand and coral are busy
# (texture 15+), the background is smooth (texture 1-3, up to ~8 on the blurry shapes behind the right side),
# so texture alone tells them apart.
g = cv2.cvtColor(inside, cv2.COLOR_BGR2GRAY).astype(np.float32)
texture = np.sqrt(np.maximum(cv2.blur(g * g, (15, 15)) - cv2.blur(g, (15, 15)) ** 2, 0))
bg = (texture < 9).astype(np.uint8)
bg[520:, 860:] = 0                                     # sand line: right of the coral the sand starts higher
bg[650:, :] = 0

# The back-right of that reef tank is a separate glass compartment: its edge made a vertical line behind the
# clownfish, and a lit blurry object in it looked like a blue box. Above the sand (x 912+, y < 540) it is all
# replaced by smooth water, top-to-bottom shades taken from the clear parts, and made see-through like the rest.
x_r, y_sand = 912, 540
top = np.median(inside[10:90, 1000:1380].reshape(-1, 3), axis=0)
low = np.median(inside[300:390, 1000:1380].reshape(-1, 3), axis=0)
t = np.clip(np.arange(816) / 390, 0, 1)[:, None]
water = (top * (1 - t) + low * t).astype(np.float32)                       # one colour per row
blend = np.zeros((816, 1388), np.float32)
blend[:y_sand, x_r:] = 1
blend = cv2.GaussianBlur(blend, (41, 41), 0)                               # fade into the sand and the wall
inside = (inside * (1 - blend[..., None]) + water[:, None, :] * blend[..., None]).astype(np.uint8)
bg[:y_sand - 10, x_r + 10:] = 1

disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
bg = cv2.morphologyEx(bg, cv2.MORPH_OPEN, disk)                            # drop specks inside coral
# only open water joined to the top of the tank counts; dark smooth shadows inside the coral stay solid
n, labels = cv2.connectedComponents(bg)
keep = [k for k in range(1, n) if (labels[:40] == k).any()]
bg = np.isin(labels, keep).astype(np.uint8)
bg = cv2.dilate(bg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))  # hug the coral and fish closely...
# The clownfish: picked out exactly by its own colours (orange, white and black stripes), so no ring of the
# photo's water is left round it to read as a glow.
fx0, fx1, fy0, fy1 = 740, 905, 115, 235
box = inside[fy0:fy1, fx0:fx1].astype(np.int32)
lum = box.mean(axis=2)
fish = ((box[..., 2] - box[..., 0] > 50) | (lum > 200) | (lum < 60)).astype(np.uint8)
fish = cv2.morphologyEx(fish, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
n, labels, stats, _ = cv2.connectedComponentsWithStats(fish)
fish = (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)   # the fish is the biggest blob
bg[fy0:fy1, fx0:fx1] = 1 - fish
soft_bg = cv2.GaussianBlur(bg.astype(np.float32), (9, 9), 0)               # ...with a short fade: no glow round them
alpha = (1 - 0.7 * soft_bg) * 255                      # background 30% reef photo, 70% the room behind
cv2.imwrite('reef_inside.png', np.dstack([inside, alpha.clip(0, 255).astype(np.uint8)]))
print('see-through background share:', round(float(soft_bg.mean()), 2))
