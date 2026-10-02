@echo off
rem Double-click to run GrocerAI in Docker (web app + SQL Server). Only Docker Desktop is required.
setlocal
cd /d "%~dp0"
title GrocerAI - Docker

where docker >nul 2>nul
if errorlevel 1 (
    echo [!] Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop and run this file again.
    pause
    exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
    echo [!] Docker is not running. Start Docker Desktop, wait until it is running, then run this file again.
    pause
    exit /b 1
)

if not exist .env (
    copy .env.example .env >nul
    echo [!] Created .env - optionally set GEMINI_API_KEY ^(AI assistant^), save, and close Notepad.
    start /wait notepad .env
)

findstr /b /c:"SA_PASSWORD=" .env >nul
if errorlevel 1 (
    echo.>>.env
    for /f "usebackq" %%P in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"`) do >>.env echo SA_PASSWORD=Aa1%%P
    echo Generated a database password in .env ^(SA_PASSWORD^). Keep this file - the database volume uses it.
)

set "PORT=8080"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /r "PORT=" .env`) do set "PORT=%%B"

echo Starting ^(first run downloads SQL Server and builds the app - this can take several minutes^)...
docker compose up -d --build --wait
if errorlevel 1 goto :fail

start http://localhost:%PORT%/staff
echo.
echo GrocerAI: storefront http://localhost:%PORT%  -  staff back office http://localhost:%PORT%/staff
echo Stop:           docker compose down
echo Delete all data: docker compose down -v
echo.
pause
goto :eof

:fail
echo.
echo [!] Something went wrong. Last log lines:
docker compose logs --tail 40
pause
exit /b 1
