@echo off
REM ------------------------------------------------------------------
REM ESP32 build script (Windows) con scelta azione da riga di comando
REM Uso: upload_esp32.bat <sketch.ino> <azione>
REM azione = compile | upload | all (default: all)
REM ------------------------------------------------------------------

REM === PATH A ARDUINO CLI ===
SET ARDUINO_CLI="C:\Program Files\Arduino CLI\arduino-cli.exe"

REM === FQBN per ESP32 Dev Module ===
SET FQBN=esp32:esp32:esp32

REM === Porta COM del dispositivo ===
SET PORT=COM7

REM === Cartella persistente per build ===
SET BUILD_PATH=C:\arduino_build

REM === Sketch passato da riga di comando ===
SET SKETCH=%~1

IF "%SKETCH%"=="" (
    echo ❌ Devi passare il nome dello sketch come primo parametro!
    exit /b 1
)

REM === Azione passata da riga di comando ===
SET ACTION=%~2
IF "%ACTION%"=="" SET ACTION=all

echo.
echo *** ESP32 build & upload script ***
echo Sketch: %SKETCH%
echo Porta: %PORT%
echo FQBN: %FQBN%
echo Build path: %BUILD_PATH%
echo Azione: %ACTION%
echo.

REM === COMPILAZIONE ===
IF /I "%ACTION%"=="compile" (
    echo [1/1] Compiling sketch...
    %ARDUINO_CLI% compile --fqbn %FQBN% --build-path %BUILD_PATH% --verbose "%SKETCH%"
    IF ERRORLEVEL 1 (
        echo ❌ Compilation failed
        exit /b 1
    )
    echo ✅ Compilation successful.
    goto end
)

REM === UPLOAD ===
IF /I "%ACTION%"=="upload" (
    echo [1/1] Uploading to board on %PORT%...
    %ARDUINO_CLI% upload -p %PORT% --fqbn %FQBN% --input-dir %BUILD_PATH% --verbose
    IF ERRORLEVEL 1 (
        echo ❌ Upload failed
        exit /b 1
    )
    echo ✅ Upload finished.
    goto end
)

REM === ALL: compile + upload ===
IF /I "%ACTION%"=="all" (
    REM 1) Compile
    echo [1/2] Compiling sketch...
    %ARDUINO_CLI% compile --fqbn %FQBN% --build-path %BUILD_PATH% --verbose "%SKETCH%"
    IF ERRORLEVEL 1 (
        echo ❌ Compilation failed
        exit /b 1
    )
    echo ✅ Compilation successful.
    echo.

    REM 2) Upload
    echo [2/2] Uploading to board on %PORT%...
    %ARDUINO_CLI% upload -p %PORT% --fqbn %FQBN% --input-dir %BUILD_PATH% --verbose
    IF ERRORLEVEL 1 (
        echo ❌ Upload failed
        exit /b 1
    )
    echo ✅ Upload finished.
)

:end
echo ------------------------------------------------------------------
pause
