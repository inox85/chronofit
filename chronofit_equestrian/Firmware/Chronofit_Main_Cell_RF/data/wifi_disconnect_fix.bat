@echo off

:: Controlla se è già amministratore
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :main
)

:: Non è amministratore — si rilancia con privilegi elevati
echo Richiedo privilegi amministratore...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
exit

:main
REG ADD "HKLM\SYSTEM\CurrentControlSet\Services\NlaSvc\Parameters\Internet" /v EnableActiveProbing /t REG_DWORD /d 0 /f
echo Done! Restart required.
pause