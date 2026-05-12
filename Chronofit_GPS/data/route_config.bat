@echo off
chcp 65001 >nul
echo Configurazione route per ESP32 Chronofit...
echo.

:: ----------------------------------------------------------------
:: Richiesta automatica permessi amministratore
:: ----------------------------------------------------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Richiesta permessi amministratore...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: ----------------------------------------------------------------
:: Trova automaticamente l'indice dell'interfaccia Chronofit
:: ----------------------------------------------------------------
echo Ricerca interfaccia Chronofit_...
echo.

:: Trova il nome dell'adattatore connesso alla rete Chronofit_
for /f "tokens=*" %%i in ('powershell -Command "Get-NetConnectionProfile | Where-Object { $_.Name -like '*Chronofit_*' } | Select-Object -ExpandProperty InterfaceAlias"') do set ADAPTER_NAME=%%i

if "%ADAPTER_NAME%"=="" (
    echo ERRORE: Nessuna interfaccia connessa a una rete Chronofit_ trovata.
    echo Assicurati di essere connesso alla rete WiFi dell'ESP32.
    echo.
    pause
    exit /b 1
)

echo Adattatore trovato: %ADAPTER_NAME%

:: Trova l'indice dell'interfaccia tramite il nome adattatore
for /f "tokens=*" %%i in ('powershell -Command "(Get-NetAdapter -Name '%ADAPTER_NAME%').ifIndex"') do set INTERFACE_INDEX=%%i

if "%INTERFACE_INDEX%"=="" (
    echo ERRORE: Impossibile trovare l'indice dell'interfaccia.
    echo.
    pause
    exit /b 1
)

echo Indice interfaccia: %INTERFACE_INDEX%
echo.

:: ----------------------------------------------------------------
:: Configurazione subnet ESP
:: ----------------------------------------------------------------
set ESP_SUBNET=192.168.10.0
set ESP_MASK=255.255.255.0
set ESP_GATEWAY=192.168.10.1

:: ----------------------------------------------------------------
:: Aggiunta route permanente
:: ----------------------------------------------------------------
echo Aggiunta route permanente per %ESP_SUBNET% sull'interfaccia %INTERFACE_INDEX%...
route -p add %ESP_SUBNET% mask %ESP_MASK% %ESP_GATEWAY% if %INTERFACE_INDEX%

if %errorlevel% == 0 (
    echo.
    echo Route aggiunta correttamente!
    echo Tutto il traffico verso %ESP_SUBNET% passera' per %ADAPTER_NAME% [if %INTERFACE_INDEX%]
) else (
    echo.
    echo ERRORE: aggiunta route fallita.
)

echo.
pause