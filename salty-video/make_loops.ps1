# Cuts Salty's loops from the Gemini clips in raw\ into loops\.
# Each loop plays frames First..Last forward, then back again (a "bounce"), so it repeats with no jump.
# Add a line to $Loops for each new clip, then run:  powershell -File D:\MuseTest\salty-video\make_loops.ps1
$ErrorActionPreference = 'Stop'
$ff = 'C:\Users\Shaun\Downloads\ffmpeg\bin\ffmpeg.exe'
$here = $PSScriptRoot
$sharpen = 'unsharp=5:5:0.6:5:5:0'   # light: crisper lashes and freckles, no halos (1.0 starts to look crunchy)

# Name, source clip in raw\, first frame, last frame (24 fps, frame 0 = start of the clip)
$Loops = @(
  @('idle_listen',         'clip2_7c0c5a72.mp4',  22, 239),   # mouth closed, blinks, head tilts; 18 s cycle
  @('talk_medium',         'clip1_b2cbc1fa.mp4', 132, 176),
  @('cheeky_wink_closeup', 'clip1_b2cbc1fa.mp4',  48,  80),
  @('happy_wide',          'clip1_b2cbc1fa.mp4', 202, 239),
  @('beam_bigclose',       'clip1_b2cbc1fa.mp4', 184, 200),
  @('talk_wide_collar',    'clip1_b2cbc1fa.mp4',  16,  45)
)

New-Item -ItemType Directory -Force (Join-Path $here 'loops') | Out-Null
foreach ($l in $Loops) {
  $name, $clip, $a, $b = $l
  $n = $b - $a + 1
  $fc = "[0:v]trim=start_frame=${a}:end_frame=$($b + 1),setpts=PTS-STARTPTS,$sharpen,split[f][r];" +
        "[r]reverse,trim=start_frame=1:end_frame=$($n - 1),setpts=PTS-STARTPTS[rv];" +
        "[f][rv]concat=n=2:v=1,format=yuv420p[v]"
  & $ff -v error -y -i (Join-Path $here "raw\$clip") -filter_complex $fc -map '[v]' -an `
    -c:v libx264 -preset slow -crf 18 -r 24 -movflags +faststart (Join-Path $here "loops\$name.mp4")
  if ($LASTEXITCODE) { throw "ffmpeg failed on $name" }
  '{0,-22} frames {1}..{2} -> {3:N1} s loop' -f $name, $a, $b, ((2 * $n - 2) / 24)
}
