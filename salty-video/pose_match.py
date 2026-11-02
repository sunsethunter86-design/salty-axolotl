import numpy as np, json, sys
d = sys.argv[1]
W, H = 160, 90
def load(n):
    a = np.fromfile(f"{d}/{n}.rgba", dtype=np.uint8).reshape(-1, H, W, 4).astype(np.float32) / 255
    return a
idle, talk = load("idle_listen_cut"), load("talk_medium_cut")
def feat(a):
    al = a[..., 3:4]
    return np.concatenate([a[..., :3] * al, al * 2], axis=-1).reshape(len(a), -1)   # silhouette counts double
fi, ft = feat(idle), feat(talk)
# squared distance matrix idle x talk
D = (fi**2).sum(1)[:, None] + (ft**2).sum(1)[None, :] - 2 * fi @ ft.T
D = np.sqrt(np.maximum(D, 0)) / np.sqrt(fi.shape[1])
idle2talk = D.argmin(1).tolist()
talk2idle = D.argmin(0).tolist()
print("frames idle", len(idle), "talk", len(talk))
print("idle->talk best dist: median %.4f max %.4f | frame0 dist median %.4f" % (np.median(D.min(1)), D.min(1).max(), np.median(D[:, 0])))
print("talk->idle best dist: median %.4f max %.4f" % (np.median(D.min(0)), D.min(0).max()))
print("self-noise (idle consecutive frames): median %.4f" % np.median(np.sqrt(((fi[1:]-fi[:-1])**2).mean(1))))
json.dump({"idle2talk": idle2talk, "talk2idle": talk2idle}, open(f"{d}/match.json", "w"))
