@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ===================== CONFIG =====================
set MKLITTLEFS=mklittlefs.exe
set ESPTOOL=esptool.exe

set PORT=COM2
set BAUD=921600
set CHIP=esp32
REM set CHIP=esp32c3

set FOLDER=data
set SIZE=0xBE0000        
set OFFSET=0x420000    
set BIN=littlefs.bin
REM ==================================================

echo ================================================
echo  Generazione LittleFS
echo ================================================

REM Controllo mklittlefs
where %MKLITTLEFS% >nul 2>&1
if errorlevel 1 (
    echo ERRORE: mklittlefs.exe non trovato nel PATH
    pause
    exit /b 1
)

REM Controllo cartella data
if not exist "%FOLDER%" (
    echo ERRORE: cartella "%FOLDER%" non trovata
    pause
    exit /b 1
)

REM Genera littlefs.bin
"%MKLITTLEFS%" -c "%FOLDER%" -p 256 -b 4096 -s %SIZE% "%BIN%"
if errorlevel 1 (
    echo ERRORE: creazione littlefs.bin fallita
    pause
    exit /b 1
)

echo OK: littlefs.bin creato
echo.

echo ================================================
echo  Flash LittleFS su ESP32
echo ================================================

REM Controllo esptool
where %ESPTOOL% >nul 2>&1
if errorlevel 1 (
    echo ERRORE: esptool.exe non trovato nel PATH
    pause
    exit /b 1
)

REM Flash
"%ESPTOOL%" --chip %CHIP% --port %PORT% --baud %BAUD% ^
    write_flash %OFFSET% "%BIN%"

if errorlevel 1 (
    echo ERRORE: flash LittleFS fallito
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Flash LittleFS completato con SUCCESSO
echo ================================================
pause
