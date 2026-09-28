@echo off
title Smart Invoicing backend
cd /d "%~dp0backend"

REM If an older copy of the backend (node.exe) is still holding port 4000, stop it first.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue; foreach ($x in $c) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $x.OwningProcess) -ErrorAction SilentlyContinue; if (-not $p) { continue }; if ($p.Name -ne 'node.exe') { Write-Host ('Port 4000 is used by another program: ' + $p.Name + '. Close it, then run this again.'); continue }; Write-Host ('Stopping an older backend that was still running (process ' + $p.ProcessId + ')...'); $parent = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p.ParentProcessId) -ErrorAction SilentlyContinue; if ($parent -and $parent.Name -eq 'node.exe' -and $parent.CommandLine -match '--watch') { Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Starting the Smart Invoicing backend. Keep this window open while you use the app.
echo.
call npm run dev
echo.
echo The backend stopped. If you see an error above, take a photo of this window.
pause
