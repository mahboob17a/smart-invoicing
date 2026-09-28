@echo off
REM Smart Invoicing - push to GitHub, then start backend + Expo for phone testing.
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is not installed. Install Node 22 LTS from https://nodejs.org and run this again. & pause & exit /b 1)

echo.
echo === 1/4  Pushing to GitHub ===
git push origin main
if errorlevel 1 echo Push did not complete - sign in to GitHub if a window asked you to, then run "git push origin main". Continuing...

echo.
echo === 2/4  Finding this PC's Wi-Fi address ===
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress"`) do set LANIP=%%i
if "%LANIP%"=="" (echo Could not detect the IP address. Run ipconfig and set EXPO_PUBLIC_API_BASE_URL yourself. & pause & exit /b 1)
echo Using http://%LANIP%:4000

echo.
echo === 3/4  Starting the backend (new window) ===
if not exist backend\.env copy backend\.env.example backend\.env >nul
start "Smart Invoicing backend" cmd /k "cd /d %~dp0backend && npm install && npm run dev"

echo.
echo === 4/4  Starting Expo (new window - scan the QR code with Expo Go) ===
start "Smart Invoicing app" cmd /k "cd /d %~dp0mobile && npm install && set EXPO_PUBLIC_API_BASE_URL=http://%LANIP%:4000&& npx expo start"

echo.
echo Two windows are opening. When the Expo window shows a QR code:
echo   Android: open Expo Go and tap "Scan QR code"
echo   iPhone : open the Camera app and point it at the QR code
echo If Windows Firewall asks about Node.js, allow it on Private networks.
echo.
pause
