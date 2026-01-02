@echo off
REM === Arduino CLI build & upload script ===
REM Usage: program_esp32.bat COMx "C:\path\to\sketch_folder"

set COMPORT=COM5
set SKETCH_PATH="Chronofit_GPS.ino"

if "%COMPORT%"=="" (
    echo ERRORE: Devi specificare la porta COM (es: COM5)
    pause
    exit /b
)

if "%SKETCH_PATH%"=="" (
    echo ERRORE: Devi specificare il percorso della cartella dello sketch.
    pause
    exit /b
)

echo.
echo === Compilazione dello sketch ===
arduino-cli compile --fqbn esp32:esp32:esp32 %SKETCH_PATH% --verbose
if errorlevel 1 (
    echo Errore durante la compilazione!
    pause
    exit /b
)

echo.
echo === Upload su %COMPORT% ===
arduino-cli upload -p %COMPORT% --fqbn esp32:esp32:esp32 %SKETCH_PATH% --verbose
if errorlevel 1 (
    echo Errore durante l'upload!
    pause
    exit /b
)

echo.
echo Operazione completata con successo!
pause
