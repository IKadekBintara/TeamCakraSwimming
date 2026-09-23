@echo off
rem ============================================================
rem TEAM CAKRA - Excel Sync Worker: single-instance launcher
rem Dipakai oleh Task Scheduler. Aman dipanggil berulang:
rem kalau worker sudah jalan, launcher ini langsung keluar.
rem ============================================================
setlocal

set "REPO=%~dp0.."
set "LOCK=%TEMP%\cakra-excel-worker.lock"

rem --- Sudah jalan? keluar tanpa menumpuk ---
if exist "%LOCK%" (
  for /f "tokens=*" %%p in ('type "%LOCK%" 2^>nul') do (
    tasklist /FI "PID eq %%p" 2>nul | find "%%p" >nul && (
      rem worker masih hidup -> tidak perlu start lagi
      exit /b 0
    )
  )
  rem lock basi, hapus
  del "%LOCK%" >nul 2>&1
)

if not exist "%REPO%\.env.local" (
  echo [worker] .env.local tidak ditemukan di %REPO% >> "%REPO%\worker\worker.log"
  exit /b 1
)

cd /d "%REPO%"
set WORKER_ID=rdp-a1-prod

echo [%date% %time%] launcher start worker >> "%REPO%\worker\worker.log"
node "%REPO%\worker\excel-sync-worker.mjs" >> "%REPO%\worker\worker.log" 2>&1

echo [%date% %time%] worker exited (code %ERRORLEVEL%) >> "%REPO%\worker\worker.log"
endlocal
exit /b 0
