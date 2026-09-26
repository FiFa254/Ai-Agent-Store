@echo off
rem Double-click to run GrocerAI (storefront + staff back office) at http://localhost:3000
setlocal
cd /d "%~dp0"
title GrocerAI - http://localhost:3000

where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js is not installed. Download it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

rem All data is stored in SQL Server (database GroceryAI, see .env.example).
sc query MSSQLSERVER 2>nul | find "RUNNING" >nul
if errorlevel 1 (
    sc query "MSSQL$SQLEXPRESS" 2>nul | find "RUNNING" >nul
    if errorlevel 1 (
        echo [!] SQL Server is not running. Start the "SQL Server ^(MSSQLSERVER^)" service in services.msc,
        echo     or set MSSQL_CONNECTION_STRING in .env to another server.
        pause
        exit /b 1
    )
)

if not exist .env (
    copy .env.example .env >nul
    echo [!] Created .env - optionally set GEMINI_API_KEY ^(AI assistant^), save, and close Notepad.
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
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000/staff"
echo.
echo GrocerAI: storefront http://localhost:3000  -  staff back office http://localhost:3000/staff
echo Close this window to stop it.
echo.
cd server
node --enable-source-maps dist\index.cjs
goto :eof

:fail
echo.
echo [!] Something went wrong. Read the messages above.
pause
exit /b 1
