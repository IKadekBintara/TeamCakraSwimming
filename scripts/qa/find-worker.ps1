$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*excel-sync-worker*' }
if (-not $procs) { Write-Output "NO_WORKER"; exit 0 }
foreach ($p in $procs) { Write-Output ("PID=" + $p.ProcessId) }
