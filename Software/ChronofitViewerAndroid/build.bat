@echo off
setlocal
REM Compila ChronofitViewer.apk senza Gradle, solo con gli strumenti dell'SDK Android
REM (aapt2, javac, d8, zipalign, apksigner). Serve un JDK (JAVA_HOME) e l'SDK con almeno
REM una cartella build-tools e platforms\android-NN.
REM
REM La prima volta crea chronofit-viewer.keystore (fuori da git): conservalo, perche gli
REM aggiornamenti dell'app si installano sopra la versione precedente solo se firmati con
REM la stessa chiave.

set VERSION_NAME=1.0.0
set VERSION_CODE=1
set MIN_SDK=29
set TARGET_SDK=34

if "%ANDROID_HOME%"=="" set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
if "%JAVA_HOME%"=="" ( echo ERRORE: JAVA_HOME non impostato & exit /b 1 )

REM ultima versione di build-tools e di piattaforma installate
for /f "delims=" %%d in ('dir /b /ad /o-n "%ANDROID_HOME%\build-tools"') do ( set "BT=%ANDROID_HOME%\build-tools\%%d" & goto :bt_ok )
echo ERRORE: build-tools non trovati in %ANDROID_HOME% & exit /b 1
:bt_ok
for /f "delims=" %%d in ('dir /b /ad /o-n "%ANDROID_HOME%\platforms"') do ( set "PLATFORM=%ANDROID_HOME%\platforms\%%d" & goto :pl_ok )
echo ERRORE: nessuna piattaforma Android in %ANDROID_HOME% & exit /b 1
:pl_ok
set ANDROID_JAR=%PLATFORM%\android.jar
set JAVAC=%JAVA_HOME%\bin\javac.exe
set JAR=%JAVA_HOME%\bin\jar.exe
set KEYTOOL=%JAVA_HOME%\bin\keytool.exe

cd /d "%~dp0"
if exist build rmdir /s /q build
mkdir build\gen build\classes build\out

echo [1/6] Risorse
"%BT%\aapt2.exe" compile --dir res -o build\res.zip || goto :err

echo [2/6] Pacchetto base
"%BT%\aapt2.exe" link -o build\base.apk -I "%ANDROID_JAR%" --manifest AndroidManifest.xml ^
  --min-sdk-version %MIN_SDK% --target-sdk-version %TARGET_SDK% ^
  --version-code %VERSION_CODE% --version-name %VERSION_NAME% ^
  --java build\gen build\res.zip || goto :err

echo [3/6] Compilazione Java
dir /s /b src\*.java build\gen\*.java > build\sources.txt
"%JAVAC%" --release 11 -Xlint:-options -classpath "%ANDROID_JAR%" -d build\classes @build\sources.txt || goto :err
"%JAR%" cf build\classes.jar -C build\classes . || goto :err

echo [4/6] Dex
call "%BT%\d8.bat" --release --min-api %MIN_SDK% --lib "%ANDROID_JAR%" --output build\out build\classes.jar || goto :err
copy /y build\base.apk build\unsigned.apk >nul
pushd build\out
"%BT%\aapt.exe" add ..\unsigned.apk classes.dex >nul || ( popd & goto :err )
popd

echo [5/6] Allineamento
"%BT%\zipalign.exe" -f -p 4 build\unsigned.apk build\aligned.apk || goto :err

echo [6/6] Firma
if not exist chronofit-viewer.keystore (
  "%KEYTOOL%" -genkeypair -keystore chronofit-viewer.keystore -storepass chronofit -keypass chronofit ^
    -alias chronofit -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Chronofit Viewer, O=Chemitec" || goto :err
)
call "%BT%\apksigner.bat" sign --ks chronofit-viewer.keystore --ks-pass pass:chronofit --key-pass pass:chronofit ^
  --out ChronofitViewer.apk build\aligned.apk || goto :err

echo.
echo Pronto: %CD%\ChronofitViewer.apk
exit /b 0

:err
echo.
echo ERRORE nella compilazione
exit /b 1
