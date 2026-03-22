@echo off
setlocal ENABLEDELAYEDEXPANSION


set ESPTOOL=esptool.exe


set INO_FILE=Chronofit_GPS.ino

set PORT=COM2
set BAUD=921600
set CHIP=esp32

set FS_FOLDER=data
set RELEASE_FOLDER=release
set RELEASE_BOOT=release\boot.bin
set RELEASE_PARTITIONS=release\partitions.bin
set RELEASE_APP=release\fw.bin
set RELEASE_FS=release\fs.bin
set RELEASE_OTADATA=release\ota_data.bin
set RELEASE_MERGED=release\merged.bin

set BUILD_FOLDER=build

set BUILD_OUTPUT=build\esp32.esp32.esp32
set BUILD_BOOT=build\esp32.esp32.esp32\Chronofit_GPS.ino.bootloader.bin
set BUILD_PARTITIONS=build\esp32.esp32.esp32\Chronofit_GPS.ino.partitions.bin
set BUILD_APP=build\esp32.esp32.esp32\Chronofit_GPS.ino.bin
set BUILD_MERGED=build\esp32.esp32.esp32\Chronofit_GPS.ino.merged.bin
set BUILD_OTADATA=build\esp32.esp32.esp32\boot_app0.bin


echo.

echo ================================================
echo  fs.bin CREATO CON SUCCESSO
echo ================================================

echo ================================================
echo  INIZIO RILASCIO...
echo ================================================

REM Controllo cartella build
if not exist "%BUILD_FOLDER%" (
    echo ERRORE: cartella "%BUILD_FOLDER%" non trovata, la creo...
    exit /b 1
)

REM Controllo cartella release
if not exist "%RELEASE_FOLDER%" (
    echo ERRORE: cartella "%RELEASE_FOLDER%" non trovata
    mkdir "%RELEASE_FOLDER%"
)

echo  COPIA .BIN BOOT...
copy /Y "%BUILD_BOOT%" "%RELEASE_BOOT%"

echo  COPIA .BIN PARTITION...
copy /Y "%BUILD_PARTITIONS%" "%RELEASE_PARTITIONS%"

echo  COPIA .BIN APP...
copy /Y "%BUILD_APP%" "%RELEASE_APP%"

echo  COPIA .BIN FS...
copy /Y "%BUILD_FS%" "%RELEASE_FS%"

echo  COPIA .BIN OTA DATA...
copy /Y "%BUILD_OTADATA%" "%RELEASE_OTADATA%"

echo  COPIA .BIN MERGED DATA...
echo copy /Y "%BUILD_MERGED%" "%RELEASE_MERGED%"

echo BOOT=[%RELEASE_BOOT%]
echo PART=[%RELEASE_PARTITIONS%]
echo APP=[%RELEASE_APP%]
echo FS=[%RELEASE_FS%]
echo MERGED=[%RELEASE_MERGED%]
echo OTADATA=[%RELEASE_OTADATA%]

if not exist "%RELEASE_BOOT%" echo ERRORE bootloader NON esiste
if not exist "%RELEASE_PARTITIONS%" echo ERRORE partitions NON esiste
if not exist "%RELEASE_APP%" echo ERRORE app NON esiste
if not exist "%RELEASE_FS%" echo ERRORE fs NON esiste
if not exist "%RELEASE_OTADATA%" echo ERRORE ota_data NON esiste
if not exist "%RELEASE_MERGED%" echo ERRORE merged NON esiste


if exist "%RELEASE_BOOT%" (
    echo boot.bin rilasciato con successo
)

if exist "%RELEASE_PARTITIONS%" (
    echo partitions.bin rilasciato con successo
)

if exist "%RELEASE_APP%" (
    echo fw.bin rilasciato con successo
)

if exist "%RELEASE_FS%" (
    echo fs.bin rilasciato con successo
)

if exist "%RELEASE_MERGED%" (
    echo merged.bin rilasciato con successo
)

echo ==========================
echo ERASING FLASH
echo ==========================
echo.
echo.

"%ESPTOOL%" --chip esp32 --baud 921600 erase_flash

echo ====================
echo FLASHING MERGED IMAGE...
echo ====================
echo.
echo.

"%ESPTOOL%" --chip esp32 --port "%PORT%" --baud 921600 write_flash  0x0 "%RELEASE_MERGED%"

echo ===================
echo FLASHING FILESYSTEM...
echo ===================
echo.
echo.

"%ESPTOOL%" --chip esp32 --port "%PORT%" --baud 921600 write_flash  0x210000 "%RELEASE_FS%"

echo =========================
echo PROGRAMMING DONE!
echo =========================


pause
