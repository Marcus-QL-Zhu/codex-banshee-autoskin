@echo off
setlocal
title Codex AutoSkin Installer

pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo [AutoSkin] Unable to open the extracted repository folder.
  pause
  exit /b 1
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [AutoSkin] Windows PowerShell 5.1 is required but was not found.
  popd
  pause
  exit /b 1
)

echo [AutoSkin] Running the official installer from this repository...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-dream-skin.ps1"
set "AUTOSKIN_EXIT=%ERRORLEVEL%"

if not "%AUTOSKIN_EXIT%"=="0" (
  echo.
  echo [AutoSkin] Installation failed with exit code %AUTOSKIN_EXIT%.
  echo Review the error above and the logs under %%LOCALAPPDATA%%\CodexDreamSkin.
  popd
  pause
  exit /b %AUTOSKIN_EXIT%
)

echo.
echo [AutoSkin] Installation completed.
echo You can now open Codex from its normal icon. The watcher will restore the skin.
popd
pause
exit /b 0
