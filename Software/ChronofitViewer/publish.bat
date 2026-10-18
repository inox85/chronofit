@echo off
REM Crea un singolo ChronofitViewer.exe autonomo (non serve installare .NET) in .\publish
REM Serve solo Microsoft Edge WebView2 Runtime, già presente su Windows 11 e sulle versioni aggiornate di Windows 10.
dotnet publish ChronofitViewer.csproj -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true ^
  -o publish
if errorlevel 1 ( echo ERRORE nella pubblicazione & exit /b 1 )
echo.
echo Pronto: %CD%\publish\ChronofitViewer.exe
