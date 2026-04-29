@echo off
title trueMem Viewer

echo ===================================================
echo       trueMem Viewer Start Script
echo ===================================================
echo.

where bun >nul 2>nul
if %ERRORLEVEL% equ 0 goto check_build

echo [ERROR] bun environment not found. Please install bun (https://bun.sh)
echo Press any key to exit...
pause >nul
exit /b 1

:check_build
if exist "dist\viewer\index.html" goto start_viewer

echo [STATUS] First run or build not found. Running build...
call bun run build
if %ERRORLEVEL% equ 0 goto start_viewer

echo [ERROR] Build failed. Please check code or dependencies.
echo Press any key to exit...
pause >nul
exit /b 1

:start_viewer
echo [STATUS] Build found. Preparing to start service...
echo [TIP] If you modified the code, please run 'bun run build' manually first.
echo.
echo [STATUS] Starting Viewer Service...
echo [TIP] The service will automatically open in your browser (http://127.0.0.1:3456)
echo.

start "" /B cmd /c "ping 127.0.0.1 -n 3 >nul && start http://127.0.0.1:3456"

call bun run viewer

echo.
echo [TIP] Viewer Service has exited.
pause
