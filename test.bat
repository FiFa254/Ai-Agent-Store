@echo off
rem Double-click to run GrocerAI checks: type check (lint) and server tests
setlocal
cd /d "%~dp0"
title GrocerAI - tests

where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js is not installed. Download it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

rem The tests create and drop database GroceryAI_Test on local SQL Server (Windows login).
sc query MSSQLSERVER 2>nul | find "RUNNING" >nul
if errorlevel 1 (
    sc query "MSSQL$SQLEXPRESS" 2>nul | find "RUNNING" >nul
    if errorlevel 1 (
        echo [!] SQL Server is not running. Start the "SQL Server ^(MSSQLSERVER^)" service in services.msc,
        echo     or set MSSQL_TEST_CONNECTION_STRING to another server.
        pause
        exit /b 1
    )
)

if not exist node_modules (
    echo Installing packages ^(first run only^)...
    call npm ci --no-audit --no-fund
    if errorlevel 1 goto :fail
)

echo Type checking...
call npm run lint
if errorlevel 1 goto :fail

echo Running tests...
call npm test
if errorlevel 1 goto :fail

echo.
echo All checks passed.
pause
goto :eof

:fail
echo.
echo [!] Some checks failed. Read the messages above.
pause
exit /b 1
