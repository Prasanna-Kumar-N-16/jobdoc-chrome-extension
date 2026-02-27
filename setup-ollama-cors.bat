@echo off
:: setup-ollama-cors.bat
:: Permanently configures Ollama to accept Chrome extension requests on Windows
:: Run as Administrator for best results (right-click → Run as administrator)

echo.
echo ========================================
echo   AI Job Applicant - Ollama CORS Setup
echo ========================================
echo.

:: ── Set OLLAMA_ORIGINS permanently at user level ────────────────────────────
echo [1/4] Setting OLLAMA_ORIGINS environment variable...
setx OLLAMA_ORIGINS "*"
if %ERRORLEVEL% EQU 0 (
    echo       Done - variable set permanently for your user account
) else (
    echo       WARNING: Could not set permanently. Trying current session only...
    set OLLAMA_ORIGINS=*
)

:: Also set for current session
set OLLAMA_ORIGINS=*

echo.

:: ── Kill existing Ollama processes ──────────────────────────────────────────
echo [2/4] Stopping any running Ollama processes...
taskkill /IM "ollama.exe" /F >nul 2>&1
taskkill /IM "ollama app.exe" /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo       Done

echo.

:: ── Restart Ollama ───────────────────────────────────────────────────────────
echo [3/4] Restarting Ollama with CORS enabled...

:: Check if Ollama app exists
set OLLAMA_APP="%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
set OLLAMA_CLI="%LOCALAPPDATA%\Programs\Ollama\ollama.exe"

if exist %OLLAMA_APP% (
    start "" %OLLAMA_APP%
    echo       Ollama app started
) else if exist %OLLAMA_CLI% (
    start /B "" %OLLAMA_CLI% serve
    echo       ollama serve started in background
) else (
    :: Try PATH
    where ollama >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        start /B "" ollama serve
        echo       ollama serve started from PATH
    ) else (
        echo       WARNING: Ollama not found. Install from https://ollama.ai
        echo       Then re-run this script.
        goto :end
    )
)

:: ── Verify ───────────────────────────────────────────────────────────────────
echo.
echo [4/4] Verifying Ollama is responding...
timeout /t 4 /nobreak >nul

:: Try curl (available in Windows 10+)
curl -s http://localhost:11434/api/tags >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo       Ollama is running!
    echo.
    echo       Testing CORS...
    curl -s -o nul -w "      CORS test: HTTP %%{http_code}" ^
        -X OPTIONS http://localhost:11434/api/tags ^
        -H "Origin: chrome-extension://test" ^
        -H "Access-Control-Request-Method: POST" 2>nul
    echo.
) else (
    echo       Ollama may still be starting up. Wait a few seconds.
)

:end
echo.
echo ========================================
echo   Setup complete!
echo.
echo   Now in Chrome:
echo   1. Go to chrome://extensions
echo   2. Find "AI Job Applicant"
echo   3. Click the refresh icon (circular arrow)
echo   4. Open a job posting and try Generate
echo ========================================
echo.
pause
