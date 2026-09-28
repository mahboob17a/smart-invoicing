@echo off
title Smart Invoicing backend
cd /d "%~dp0backend"

REM If an older copy of the backend (node.exe) is still holding port 4000, stop it first.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue; foreach ($x in $c) { $p = Get-Process -Id $x.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Write-Host ('Stopping an older backend (process ' + $p.Id + ') that was still running on port 4000...'); Stop-Process -Id $p.Id -Force } elseif ($p) { Write-Host ('Port 4000 is used by another program: ' + $p.ProcessName + '. Close it, then run this again.') } }"

echo Starting the Smart Invoicing backend. Keep this window open while you use the app.
echo.
call npm run dev
echo.
echo The backend stopped. If you see an error above, take a photo of this window.
pause
