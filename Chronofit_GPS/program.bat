@echo off
setlocal ENABLEDELAYEDEXPANSION


set ESPTOOL=esptool.exe


set INO_FILE=Chronofit_GPS.ino
8
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


@REM echo.

@REM echo ================================================
@REM echo  fs.bin CREATO CON SUCCESSO
@REM echo ================================================

@REM echo ================================================
@REM echo  INIZIO RILASCIO...
@REM echo ================================================

@REM REM Controllo cartella build
@REM if not exist "%BUILD_FOLDER%" (
@REM     echo ERRORE: cartella "%BUILD_FOLDER%" non trovata, la creo...
@REM     exit /b 1
@REM )

@REM REM Controllo cartella release
@REM if not exist "%RELEASE_FOLDER%" (
@REM     echo ERRORE: cartella "%RELEASE_FOLDER%" non trovata
@REM     mkdir "%RELEASE_FOLDER%"
@REM )

@REM echo  COPIA .BIN BOOT...
@REM copy /Y "%BUILD_BOOT%" "%RELEASE_BOOT%"

@REM echo  COPIA .BIN PARTITION...
@REM copy /Y "%BUILD_PARTITIONS%" "%RELEASE_PARTITIONS%"

@REM echo  COPIA .BIN APP...
@REM copy /Y "%BUILD_APP%" "%RELEASE_APP%"

@REM echo  COPIA .BIN FS...
@REM copy /Y "%BUILD_FS%" "%RELEASE_FS%"

@REM echo  COPIA .BIN OTA DATA...
@REM copy /Y "%BUILD_OTADATA%" "%RELEASE_OTADATA%"

@REM echo  COPIA .BIN MERGED DATA...
@REM echo copy /Y "%BUILD_MERGED%" "%RELEASE_MERGED%"

@REM echo BOOT=[%RELEASE_BOOT%]
@REM echo PART=[%RELEASE_PARTITIONS%]
@REM echo APP=[%RELEASE_APP%]
@REM echo FS=[%RELEASE_FS%]
@REM echo MERGED=[%RELEASE_MERGED%]
@REM echo OTADATA=[%RELEASE_OTADATA%]

@REM if not exist "%RELEASE_BOOT%" echo ERRORE bootloader NON esiste
@REM if not exist "%RELEASE_PARTITIONS%" echo ERRORE partitions NON esiste
@REM if not exist "%RELEASE_APP%" echo ERRORE app NON esiste
@REM if not exist "%RELEASE_FS%" echo ERRORE fs NON esiste
@REM if not exist "%RELEASE_OTADATA%" echo ERRORE ota_data NON esiste
@REM if not exist "%RELEASE_MERGED%" echo ERRORE merged NON esiste


@REM if exist "%RELEASE_BOOT%" (
@REM     echo boot.bin rilasciato con successo
@REM )

@REM if exist "%RELEASE_PARTITIONS%" (
@REM     echo partitions.bin rilasciato con successo
@REM )

@REM if exist "%RELEASE_APP%" (
@REM     echo fw.bin rilasciato con successo
@REM )

@REM if exist "%RELEASE_FS%" (
@REM     echo fs.bin rilasciato con successo
@REM )

@REM if exist "%RELEASE_MERGED%" (
@REM     echo merged.bin rilasciato con successo
@REM )

echo ==========================
echo ERASING FLASH
echo ==========================
echo.
echo.

"%ESPTOOL%" --chip esp32 --port "%PORT%" esp32 --baud 921600 erase_flash

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
