@echo off
rem Double-click to run Ai-Agent-Store locally at http://localhost:3000
setlocal
cd /d "%~dp0"
title Ai-Agent-Store - http://localhost:3000
set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js is not installed. Download it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

if not exist .env (
    copy .env.example .env >nul
    echo [!] Created .env - set GEMINI_API_KEY ^(for the AI chat^) and ADMIN_PASSWORD, save, and close Notepad.
    start /wait notepad .env
)

if not exist node_modules (
    echo Installing packages ^(first run only^)...
    call npm ci --no-audit --no-fund
    if errorlevel 1 goto :fail
)

echo Building...
call npm run build
if errorlevel 1 goto :fail

set NODE_ENV=production
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"
echo.
echo Ai-Agent-Store is running at http://localhost:%PORT%
echo Close this window to stop it.
echo.
node dist\server.cjs
goto :eof

:fail
echo.
echo [!] Something went wrong. Read the messages above.
pause
exit /b 1
