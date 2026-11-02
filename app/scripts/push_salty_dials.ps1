<#
  Pushes Salty's sampler dials to her own app (com.veridity.flow.local.meta) only.

  Why: the phone engine reads models/mind_temp.txt, mind_topk.txt and
  mind_topp.txt at boot (LiteRtMindService.dialledTemp/TopK/TopP); the page's
  request fields are inert on the phone. Salty was trained and evaluated at
  temp 0.6 / top-p 0.9 / top-k 50, but shipped with Veridity's dials absent,
  so she sampled at 1.1 / 0.95 / 64 and wandered off the question
  (27 Oct ROG log: "sampler applied: topK=64 topP=0.95 temp=1.1").

  Dial changes need an app restart, and only once her mind is ready
  (ENGINE_READY) - force-stopping during boot counts as a boot strike.
  This script never installs, launches, stops or clears anything, and
  proves the two protected apps were not updated.

  Usage (PowerShell, Wi-Fi adb):
    .\scripts\push_salty_dials.ps1            # check only, changes nothing
    .\scripts\push_salty_dials.ps1 -Go        # write the three dial files
#>
param(
  [string]$Serial = 'PHONE_IP:5555',
  [switch]$Go
)
$ErrorActionPreference = 'Stop'
$adb = 'C:\Users\Shaun\AppData\Local\Android\Sdk\platform-tools\adb.exe'   # never C:\WINDOWS\adb.exe
$meta = 'com.veridity.flow.local.meta'
$protected = @('com.veridity.flow.local', 'com.veridity.flow.local.qual')
$models = "/sdcard/Android/data/$meta/files/models"
$dials = @{ 'mind_temp.txt' = '0.6'; 'mind_topk.txt' = '50'; 'mind_topp.txt' = '0.9' }

function A { & $adb -s $Serial @args }
function UpdateTime($pkg) { (A shell dumpsys package $pkg | Select-String 'lastUpdateTime' | Select-Object -First 1).Line }

if ((A get-state) -ne 'device') { throw "phone $Serial not connected" }
$before = @{}; foreach ($p in $protected) {
  $before[$p] = UpdateTime $p; Write-Host "  $p : $($before[$p])"
  if (-not $before[$p]) { throw "could not read $p from the phone (connection dropped?)" }
}
Write-Host "  current dials:"; A shell "for f in mind_temp.txt mind_topk.txt mind_topp.txt; do echo -n \"`$f: \"; cat $models/`$f 2>/dev/null || echo absent; done"
if (-not $Go) { Write-Host "`nCheck only. Re-run with -Go to write Salty's sampler dials."; return }

foreach ($name in $dials.Keys) { A shell "printf '$($dials[$name])' > $models/$name; chmod 666 $models/$name" }
Write-Host "  dials now:"; A shell "for f in mind_temp.txt mind_topk.txt mind_topp.txt; do echo -n \"`$f: \"; cat $models/`$f; echo; done"

foreach ($p in $protected) {
  $after = UpdateTime $p
  if ($after -ne $before[$p]) { throw "PROTECTED APP CHANGED: $p ($($before[$p]) -> $after)" }
  Write-Host "  $p unchanged"
}
Write-Host "`nDone. Restart Salty (Meta Llama) once her mind shows ENGINE_READY, then read back:"
Write-Host "  adb -s $Serial logcat -s VFLRewindMind | Select-String 'sampler applied'"
