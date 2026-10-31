@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ============================================================================
REM  Programmazione completa ChronofitMainCell RF (flash 4 MB): applicativo +
REM  filesystem (UI web) in un solo passaggio.
REM
REM  Prima, nell'Arduino IDE (Flash Size 4MB, Partition Scheme "Default 4MB with
REM  spiffs"): Sketch > Esporta binario compilato. I file finiscono in
REM  build\esp32.esp32.esp32\ dentro la cartella dello sketch.
REM
REM  Uso:  program.bat COM5        (senza parametro usa la porta in CONFIG)
REM
REM  Scrive i singoli pezzi e NON il merged.bin: il merged dell'IDE copre tutti
REM  i 4 MB e cancellerebbe la NVS (taratura batteria, impostazioni, linee).
REM  Le opzioni di reset (reset_delay) sono in esptool.cfg in questa cartella.
REM ============================================================================

REM ===================== CONFIG =====================
set PORT=COM2
set BAUD=921600
set CHIP=esp32
set SKETCH=Chronofit_Main_Cell_RF
REM ==================================================

cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
if not "%~1"=="" set PORT=%~1

set BUILD=build\esp32.esp32.esp32
set BOOT=%BUILD%\%SKETCH%.ino.bootloader.bin
set PART=%BUILD%\%SKETCH%.ino.partitions.bin
set APP=%BUILD%\%SKETCH%.ino.bin
set OTADATA=boot_app0.bin
set FS=%BUILD%\fs.bin

for %%F in ("%BOOT%" "%PART%" "%APP%" "%OTADATA%") do (
    if not exist %%F (
        echo ERRORE: manca %%F
        echo Esporta prima il binario dall'Arduino IDE: Sketch ^> Esporta binario compilato
        pause
        exit /b 1
    )
)

REM esptool: quello dell'Arduino IDE (piu' recente), altrimenti quello della cartella
set ESPTOOL=
for /d %%D in ("%LOCALAPPDATA%\Arduino15\packages\esp32\tools\esptool_py\*") do (
    if exist "%%D\esptool.exe" set ESPTOOL=%%D\esptool.exe
)
if "%ESPTOOL%"=="" if exist esptool.exe set ESPTOOL=esptool.exe
if "%ESPTOOL%"=="" (
    echo ERRORE: esptool.exe non trovato
    pause
    exit /b 1
)
echo esptool: %ESPTOOL%

echo.
echo ================================================
echo  Filesystem: compressione UI e immagine LittleFS
echo ================================================
python compress_assets.py
if errorlevel 1 ( echo ERRORE: compress_assets.py & pause & exit /b 1 )
python load_on_littlefs.py --no-flash --out "%FS%"
if errorlevel 1 ( echo ERRORE: generazione fs.bin & pause & exit /b 1 )

echo.
echo ================================================
echo  Programmazione su %PORT%
echo ================================================
"%ESPTOOL%" --chip %CHIP% --port %PORT% --baud %BAUD% --before default_reset --after hard_reset ^
    write_flash -z --flash_mode keep --flash_freq keep --flash_size keep ^
    0x1000   "%BOOT%" ^
    0x8000   "%PART%" ^
    0xe000   "%OTADATA%" ^
    0x10000  "%APP%" ^
    0x290000 "%FS%"
if errorlevel 1 (
    echo.
    echo ERRORE: programmazione fallita.
    echo Se non si aggancia, tieni premuto BOOT all'avvio oppure aumenta reset_delay in esptool.cfg
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Programmazione completata con SUCCESSO
echo ================================================
pause
