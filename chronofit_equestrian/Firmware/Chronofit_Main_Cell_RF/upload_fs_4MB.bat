@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Carica il filesystem (UI web) della ChronofitMainCell RF su flash da 4 MB.
REM Mappa: partizione standard "Default 4MB with spiffs" -> LittleFS @0x290000, size 0x160000.
REM Il firmware va caricato dall'Arduino IDE con Flash Size = 4MB e
REM Partition Scheme = "Default 4MB with spiffs".

REM ===================== CONFIG =====================
set PORT=COM2
set BAUD=921600
set CHIP=esp32
set OFFSET=0x290000
set BIN=littlefs_4MB.bin
REM ==================================================

cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

if not "%~1"=="" set PORT=%~1

echo ================================================
echo  Compressione UI (.gz)
echo ================================================
python compress_assets.py
if errorlevel 1 (
    echo ERRORE: compress_assets.py fallito
    pause
    exit /b 1
)

echo ================================================
echo  Generazione LittleFS (0x160000)
echo ================================================
REM Nell'immagine entrano solo i .gz dei file che ce l'hanno (vedi load_on_littlefs.py)
python load_on_littlefs.py --no-flash --out "%BIN%"
if errorlevel 1 (
    echo ERRORE: generazione %BIN% fallita
    pause
    exit /b 1
)

echo ================================================
echo  Flash LittleFS su %PORT% @ %OFFSET%
echo ================================================
set ESPTOOL=esptool.exe
if not exist "%ESPTOOL%" set ESPTOOL=..\Chronofit_GPS\esptool.exe
if not exist "%ESPTOOL%" (
    echo ERRORE: esptool.exe non trovato
    pause
    exit /b 1
)

"%ESPTOOL%" --chip %CHIP% --port %PORT% --baud %BAUD% write_flash %OFFSET% "%BIN%"
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
