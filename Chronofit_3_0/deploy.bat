@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ===================== CONFIG =====================
set MKLITTLEFS=mklittlefs.exe
set ESPTOOL=esptool.exe
set ARDUINO_CLI=arduino-cli.exe

set INO_FILE=Chronofit_GPS.ino

set PORT=COM2
set BAUD=921600
set CHIP=esp32
REM set CHIP=esp32c3

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
set BUILD_FS=build\esp32.esp32.esp32\fs.bin

set SIZE=0x1E0000

@REM REM ==================================================

chcp 65001 >nul
type banner.txt                                                                                                                                                                                                                                                              

echo.
echo.
echo.

@REM set /p COMPILE="Vuoi compilare con Arduino CLI? (S/N) "
@REM if /i "%COMPILE%"=="N" (
@REM     echo Compilazione saltata
@REM     goto :after_build
@REM )

@REM arduino-cli compile -b esp32:esp32:esp32 -v --build-property "build.partitions=partitions" --build-property "upload.speed=921600" --build-property "cpu.frequency=240" --build-property "flash.frequency=80" --build-property "flash.mode=qio" --build-property "flash.size=4M" --build-property "debug.level=none" --build-property "psram=disabled" --build-property "loop.core=1" --build-property "events.core=1" --build-property "erase.flash=none" --build-path "%BUILD_OUTPUT%" "%INO_FILE%"

@REM :after_build


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
if not exist "%FS_FOLDER%" (
    echo ERRORE: cartella "%FOLDER%" non trovata
    pause
    exit /b 1
)

REM Controllo cartella release
if not exist "%RELEASE_FOLDER%" (
    echo ERRORE: cartella "%RELEASE_FOLDER%" non trovata
    pause
    exit /b 1
)


REM Genera littlefs.bin
"%MKLITTLEFS%" -c "%FS_FOLDER%" -p 256 -b 4096 -s %SIZE% "%BUILD_FS%"
if errorlevel 1 (
    echo ERRORE: creazione "%FS_FOLDER%" fallita
    pause
    exit /b 1
)

echo OK: fs.bin creato
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

echo  COPIA .BIN MERGED...
copy /Y "%BUILD_BOOT%" "%RELEASE_BOOT%"

echo  COPIA .BIN FS...
copy /Y "%BUILD_PARTITIONS%" "%RELEASE_PARTITIONS%"

echo  COPIA .BIN MERGED...
copy /Y "%BUILD_APP%" "%RELEASE_APP%"

echo  COPIA .BIN FS...
copy /Y "%BUILD_FS%" "%RELEASE_FS%"

echo  COPIA .BIN MERGED...
copy /Y "%BUILD_MERGED%" "%RELEASE_MERGED%"

echo  COPIA .BIN FS...
copy /Y "%BUILD_FS%" "%RELEASE_FS%"

echo MERGED_FIRMWARE=[%RELEASE_MERGED%]
echo FILESYSTEM=[%RELEASE_FS%]

if exist "%RELEASE_MERGED%" (
    echo merged.bin rilasciato con successo
    echo.
)

if exist "%RELEASE_FS%" (
    echo fs.bin rilasciato con successo
    echo.
)

echo =========================
echo DEPLOY TERMINATO
echo =========================

echo.
echo.
echo.

pause
