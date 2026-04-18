@echo off
REM ============================================================
REM  Build, Flash e Filesystem Chronofit_GPS
REM  ESP32 16MB | Arduino CLI | LittleFS
REM ============================================================

SET SKETCH=Chronofit_GPS
SET FQBN=esp32:esp32:esp32:FlashSize=16M,FlashMode=dio,FlashFreq=80
SET PORT=COM3
SET CACHE=C:\Users\innocenti\.arduino\cache
SET BUILD=build
SET DATA=data

REM --- Partizioni filesystem (da partitions.csv) ---
REM  spiffs offset=0x310000 size=0xCF0000
SET FS_OFFSET=0x310000
SET FS_SIZE=0xCF0000

REM --- Tool paths ---
SET ARDUINO_TOOLS=C:\Users\innocenti\AppData\Local\Arduino15\packages\esp32\tools
SET MKLITTLEFS=mklittlefs.exe
SET ESPTOOL=esptool.exe

REM ============================================================
 
REM --- [1/3] Compila ---
echo.
echo [1/3] Compilazione in corso...
arduino-cli compile --fqbn %FQBN% ^
  --build-property "build.partitions=partitions" ^
  --build-property "upload.maximum_size=3145728" ^
  --build-path "%BUILD%" ^
  --libraries "C:\Users\inox8\OneDrive\Documenti\Arduino\libraries" ^
  "%SKETCH_PATH%"
 
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRORE] Compilazione fallita!
    pause
    exit /b 1
)
echo [OK] Compilazione completata!
 
REM --- [2/3] Crea immagine LittleFS ---
echo.
echo [2/3] Creazione immagine LittleFS dalla cartella data\...
 
IF NOT EXIST "%DATA%" (
    echo [WARN] Cartella data\ non trovata, creata vuota.
    mkdir "%DATA%"
)
 
"%MKLITTLEFS%" -c "%DATA%" -s %FS_SIZE% -b 4096 -p 256 "%BUILD%\littlefs.bin"
 
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRORE] Creazione LittleFS fallita! Controlla il path di mklittlefs.
    pause
    exit /b 1
)
echo [OK] Immagine LittleFS creata: %BUILD%\littlefs.bin
 
REM --- [3/3] Flasha firmware + filesystem ---
echo.
echo [3/3] Flash in corso su %PORT%...
 
"%ESPTOOL%" --chip esp32 --port %PORT% --baud 921600 write_flash ^
  0x1000  "%BUILD%\%SKETCH%.ino.bootloader.bin" ^
  0x8000  "%BUILD%\%SKETCH%.ino.partitions.bin" ^
  0x10000 "%BUILD%\%SKETCH%.ino.bin" ^
  %FS_OFFSET% "%BUILD%\littlefs.bin"
 
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRORE] Flash fallito! Controlla la porta %PORT%
    pause
    exit /b 1
)
 
echo.
echo [OK] Flash completato! Firmware + LittleFS caricati.
pause