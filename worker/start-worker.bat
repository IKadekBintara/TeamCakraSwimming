@echo off
rem ============================================================
rem TEAM CAKRA — Excel Sync Worker launcher (RDP background)
rem Jalankan via Task Scheduler / NSSM / manual. Tanpa Hermes.
rem ============================================================
cd /d "%~dp0.."
if not exist .env.local (
  echo [worker] .env.local tidak ditemukan di root repo.
  exit /b 1
)
:loop
node worker\excel-sync-worker.mjs >> worker\worker.log 2>&1
echo [%date% %time%] worker exited, restart in 15s >> worker\worker.log
timeout /t 15 /nobreak >nul
goto loop
