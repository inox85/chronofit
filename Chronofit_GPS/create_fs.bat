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
set SIZE=0x1E0000        
set OFFSET=0x210000    
set BIN=fs.bin
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

echo OK: fs.bin creato
echo.

echo ================================================
echo  fs.bin CREATO CON SUCCESSO
echo ================================================
pause
