import wave, struct, sys
import numpy as np

path = sys.argv[1]
w = wave.open(path)
sr = w.getframerate()
n = w.getnframes()
data = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
print(f"sr={sr} dur={n/sr:.2f}s rms={np.sqrt(np.mean(data**2)):.4f} peak={np.max(np.abs(data)):.3f}")

# crude energy-based speech segmentation + autocorrelation f0 per 40ms frame
frame = int(sr * 0.04)
hop = int(sr * 0.02)
f0s, times = [], []
for i in range(0, len(data) - frame, hop):
    seg = data[i:i+frame]
    if np.sqrt(np.mean(seg**2)) < 0.02:
        continue
    seg = seg - seg.mean()
    ac = np.correlate(seg, seg, "full")[frame-1:]
    lo, hi = int(sr/400), int(sr/60)
    if hi >= len(ac): continue
    ac[:lo] = 0
    peak = np.argmax(ac[lo:hi]) + lo
    if ac[peak] > 0.3 * ac[0]:
        f0s.append(sr / peak)
        times.append(i / sr)
f0 = np.array(f0s)
if len(f0):
    print(f"voiced frames={len(f0)} f0 median={np.median(f0):.0f}Hz p10={np.percentile(f0,10):.0f} p90={np.percentile(f0,90):.0f} min={f0.min():.0f} max={f0.max():.0f}")
    print("f0 by second:", {int(t): int(np.median([f for f, tt in zip(f0s, times) if int(tt) == int(t)])) for t in sorted(set(int(x) for x in times))})
# syllable-rate proxy: energy envelope peaks
env = np.abs(data)
k = int(sr * 0.01)
env = np.convolve(env, np.ones(k)/k, "same")
peaks = 0
prev = 0
for i in range(1, len(env)):
    if env[i] > 0.15 and prev <= 0.15:
        peaks += 1
    prev = env[i]
print(f"energy bursts (>0.15) = {peaks} over {n/sr:.1f}s")
