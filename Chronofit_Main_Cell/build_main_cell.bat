@echo off
setlocal

REM Compila ChronofitMainCell, comprime la UI e genera fs.bin.
REM Usa arduino-cli.exe e mklittlefs.exe già presenti in ..\Chronofit_GPS.
REM Layout flash: partitions.csv (16 MB, spiffs @0x420000 size 0xBE0000).
REM ATTENZIONE: se compili dall'Arduino IDE imposta Flash Size = 16MB, altrimenti
REM il bootloader rifiuta la tabella delle partizioni (offset 0x210000 > 4 MB).

set TOOLS=..\Chronofit_GPS
set FQBN=esp32:esp32:esp32:FlashSize=16M,FlashMode=dio,FlashFreq=80
set SIZE=0xBE0000

echo === Compilazione firmware ===
"%TOOLS%\arduino-cli.exe" compile --fqbn %FQBN% --output-dir build .
if errorlevel 1 ( echo ERRORE compilazione & exit /b 1 )

echo === Compressione UI ===
set PYTHONIOENCODING=utf-8
python compress_assets.py
if errorlevel 1 ( echo ERRORE compress_assets & exit /b 1 )

echo === Generazione fs.bin ===
"%TOOLS%\mklittlefs.exe" -c data -p 256 -b 4096 -s %SIZE% build\fs.bin
if errorlevel 1 ( echo ERRORE mklittlefs & exit /b 1 )

if not exist release mkdir release
copy /Y build\Chronofit_Main_Cell.ino.bin         release\fw.bin
copy /Y build\Chronofit_Main_Cell.ino.merged.bin  release\merged.bin
copy /Y build\fs.bin                    release\fs.bin

echo.
echo OK: release\fw.bin (OTA /update), release\fs.bin (OTA /updatefs), release\merged.bin (primo flash)
