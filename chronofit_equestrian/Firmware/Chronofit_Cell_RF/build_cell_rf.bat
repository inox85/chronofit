@echo off
setlocal

REM Compila il firmware della Chronofit Cell RF (scheda Chronofit_BLE + NRF24).
REM Usa arduino-cli.exe gia' presente in ..\Chronofit_GPS. Niente filesystem: la
REM Cell RF non ha UI web. Flash 4 MB, partizione standard "Default 4MB with spiffs".

set TOOLS=..\Chronofit_GPS
set FQBN=esp32:esp32:esp32:FlashSize=4M,PartitionScheme=default,FlashMode=dio,FlashFreq=80

echo === Compilazione firmware ===
"%TOOLS%\arduino-cli.exe" compile --fqbn %FQBN% --output-dir build .
if errorlevel 1 ( echo ERRORE compilazione & exit /b 1 )

if not exist release mkdir release
copy /Y build\Chronofit_Cell_RF.ino.bin         release\fw.bin
copy /Y build\Chronofit_Cell_RF.ino.merged.bin  release\merged.bin

echo.
echo OK: release\merged.bin (primo flash, offset 0x0)
