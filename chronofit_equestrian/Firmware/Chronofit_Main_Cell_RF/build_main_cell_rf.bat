@echo off
setlocal

REM Compila ChronofitMainCell RF (scheda Chronofit_BLE + NRF24, flash 4 MB), comprime la UI e genera fs.bin.
REM Usa arduino-cli.exe e mklittlefs.exe gia' presenti in ..\Chronofit_GPS.
REM Layout flash: partizione standard "Default 4MB with spiffs" (app 1,25 MB con OTA,
REM LittleFS @0x290000 size 0x160000). Dall'Arduino IDE: Flash Size = 4MB,
REM Partition Scheme = "Default 4MB with spiffs".

set TOOLS=..\Chronofit_GPS
set FQBN=esp32:esp32:esp32:FlashSize=4M,PartitionScheme=default,FlashMode=dio,FlashFreq=80

echo === Compilazione firmware ===
"%TOOLS%\arduino-cli.exe" compile --fqbn %FQBN% --output-dir build .
if errorlevel 1 ( echo ERRORE compilazione & exit /b 1 )

echo === Compressione UI ===
set PYTHONIOENCODING=utf-8
python compress_assets.py
if errorlevel 1 ( echo ERRORE compress_assets & exit /b 1 )

echo === Generazione fs.bin ===
python load_on_littlefs.py --no-flash --out build\fs.bin
if errorlevel 1 ( echo ERRORE generazione fs.bin & exit /b 1 )

if not exist release mkdir release
copy /Y build\Chronofit_Main_Cell_RF.ino.bin         release\fw.bin
copy /Y build\Chronofit_Main_Cell_RF.ino.merged.bin  release\merged.bin
copy /Y build\fs.bin                                 release\fs.bin

echo.
echo OK: release\fw.bin (OTA /update), release\fs.bin (OTA /updatefs, oppure flash a 0x290000), release\merged.bin (primo flash a 0x0)
