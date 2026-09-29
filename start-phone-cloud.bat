@echo off
REM Smart Invoicing - test on the phone against the backend hosted on Render.
REM The app's code reaches the phone through an Expo tunnel (internet), so
REM Wi-Fi, USB and Windows Firewall don't matter. No local backend needed.
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is not installed. Install Node 22 LTS from https://nodejs.org and run this again. & pause & exit /b 1)

echo.
echo === 1/3  Backend address ===
set CLOUDURL=
if exist backend-url.txt set /p CLOUDURL=<backend-url.txt
if "%CLOUDURL%"=="" (
  echo Paste your Render address, for example https://smart-invoicing-backend.onrender.com
  set /p CLOUDURL=Address: 
)
if "%CLOUDURL%"=="" (echo No address entered. & pause & exit /b 1)
if "%CLOUDURL:~-1%"=="/" set CLOUDURL=%CLOUDURL:~0,-1%
> backend-url.txt echo %CLOUDURL%
echo Using %CLOUDURL%
echo Waking it up (the free plan can take up to a minute)...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 90 '%CLOUDURL%/health'; Write-Host ('Backend OK: ' + $r.Content) } catch { Write-Host ('Backend did not answer: ' + $_.Exception.Message); Write-Host 'Check the address (delete backend-url.txt to enter it again) and the Render logs.' }"

echo.
echo === 2/3  Expo tunnel tool ===
call npm ls -g @expo/ngrok >nul 2>nul || call npm install -g @expo/ngrok@^4.1.0

echo.
echo === 3/3  Expo (tunnel) ===
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue; foreach ($x in $c) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $x.OwningProcess) -ErrorAction SilentlyContinue; if ($p -and $p.Name -eq 'node.exe') { Write-Host 'Stopping the other Expo window...'; Stop-Process -Id $p.ProcessId -Force } }"
start "Smart Invoicing app (cloud)" cmd /k "cd /d %~dp0mobile && npm install && set EXPO_PUBLIC_API_BASE_URL=%CLOUDURL%&& npx expo start --go --tunnel --clear"

echo.
echo When the Expo window shows a QR code, open Expo Go on the phone and tap
echo "Scan QR code" (iPhone: use the Camera app). The address starts with exp://...exp.direct
echo.
pause
