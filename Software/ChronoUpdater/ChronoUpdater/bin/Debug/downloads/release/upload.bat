@echo off
cls
setlocal ENABLEDELAYEDEXPANSION

echo ==============================
echo       FLASH FW + FS
echo ==============================
echo.

set COMPORT=COM2

set FW_PATH="fw.bin"
set FW_ADDR=0x10000
set FS_PATH="fs.bin"
set FS_ADDR=0x290000

if not exist "%FW_PATH%" (
    echo Firmware non trovato!
    pause
    exit
)

if not exist "%FS_PATH%" (
    echo Filesystem non trovato!
    pause
    exit
)

echo ================================================
echo  Flashing firmware...
echo ================================================

esptool.exe --chip esp32 --port %COMPORT% --baud 921600 write_flash %FW_ADDR% "%FW_PATH%"

echo ================================================
echo  Flashing filesystem...
echo ================================================

esptool.exe --chip esp32 --port %COMPORT% --baud 921600 write_flash %FS_ADDR% "%FS_PATH%"

if errorlevel 1 (
    echo.
    echo ERRORE durante il flash!
    pause
    exit
)

echo.
echo FLASH COMPLETATO CON SUCCESSO!
pause