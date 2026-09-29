@echo off
REM Smart Invoicing - test on an Android phone over a USB cable.
REM The phone reaches the PC through the cable (adb reverse), so Wi-Fi and
REM Windows Firewall don't matter. Run this again whenever you re-plug the cable.
setlocal
cd /d "%~dp0"
set ADB=%~dp0tools\platform-tools\adb.exe

where node >nul 2>nul || (echo Node.js is not installed. Install Node 22 LTS from https://nodejs.org and run this again. & pause & exit /b 1)

echo.
echo === 1/5  Android USB tools ===
if exist "%ADB%" (
  echo Found.
) else (
  echo Downloading Google's Android platform tools - one time only, about 10 MB...
  if not exist tools mkdir tools
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile 'tools\platform-tools.zip'; Expand-Archive -Force 'tools\platform-tools.zip' 'tools'; Remove-Item 'tools\platform-tools.zip'"
  if not exist "%ADB%" (echo The download did not work. Check the internet connection and run this again. & pause & exit /b 1)
  echo Done.
)

echo.
echo === 2/5  Looking for the phone on the USB cable ===
"%ADB%" start-server >nul 2>nul
:waitphone
set STATE=
for /f "skip=1 tokens=2" %%s in ('"%ADB%" devices') do set STATE=%%s
if "%STATE%"=="device" goto phoneok
if "%STATE%"=="unauthorized" (
  echo The phone is asking "Allow USB debugging?" - tick "Always allow from this computer" and tap Allow.
) else (
  echo No phone found. Check that:
  echo   - the cable is plugged in and the phone is unlocked
  echo   - USB debugging is ON: Settings ^> About phone ^> tap "Build number" 7 times,
  echo     then Settings ^> System ^> Developer options ^> USB debugging
  echo   - if the phone asks what the USB connection is for, choose "File transfer"
)
echo Checking again in 5 seconds... ^(press Ctrl+C to stop^)
timeout /t 5 /nobreak >nul
goto waitphone
:phoneok
echo Phone connected.

echo.
echo === 3/5  Linking the phone to this PC through the cable ===
"%ADB%" reverse tcp:8081 tcp:8081 >nul || (echo Could not link port 8081. Unplug and re-plug the cable, then run this again. & pause & exit /b 1)
"%ADB%" reverse tcp:4000 tcp:4000 >nul || (echo Could not link port 4000. Unplug and re-plug the cable, then run this again. & pause & exit /b 1)
echo Done - the phone now reaches the app and the backend through the cable.

echo.
echo === 4/5  Backend ===
if not exist backend\.env copy backend\.env.example backend\.env >nul
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  start "Smart Invoicing backend" cmd /k "cd /d %~dp0backend && npm install && cd .. && start-backend.bat"
) else (
  echo The backend is already running - leaving it as it is.
)

echo.
echo === 5/5  Expo ===
REM A Wi-Fi Expo window uses the same port; stop it so this one can start.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue; foreach ($x in $c) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $x.OwningProcess) -ErrorAction SilentlyContinue; if ($p -and $p.Name -eq 'node.exe') { Write-Host 'Stopping the other Expo window...'; Stop-Process -Id $p.ProcessId -Force } }"
start "Smart Invoicing app (USB)" cmd /k "set PATH=%~dp0tools\platform-tools;%PATH%&& cd /d %~dp0mobile && npm install && set EXPO_PUBLIC_API_BASE_URL=http://localhost:4000&& npx expo start --go --localhost --clear"

echo.
echo When the Expo window has finished starting, press  a  in it.
echo Expo Go opens the app on the phone by itself.
echo (Or in Expo Go: Enter URL manually -^> exp://127.0.0.1:8081)
echo.
pause
