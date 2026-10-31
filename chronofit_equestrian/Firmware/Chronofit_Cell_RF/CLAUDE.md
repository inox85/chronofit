# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contesto

`Chronofit_Cell_RF` è la fotocellula remota di `../Chronofit_Main_Cell_RF/` e gira sulla scheda delle barriere `Chronofit_BLE`. Ha le stesse funzioni di `../Chronofit_Cell/` (timestamp locale, sync del clock, coda con ritentativi e deduplica, battito di presenza, feedback con LED e buzzer), ma comunica con la Main **solo via radio NRF24** e non ha WiFi né UI. Abbinamento, linea, lockout e buzzer si impostano dalla console della Main. Il riferimento per l'uso in campo è `README.md`.

## File condivisi con Chronofit_Main_Cell_RF

`rf_protocol.h`, `board.h`, `power.h` e `power.cpp` devono restare **identici** nelle due cartelle. Il protocollo è descritto in testa a `rf_protocol.h`.

## Build

```bash
build_cell_rf.bat
```
Compila con `..\Chronofit_GPS\arduino-cli.exe` (flash 4 MB, partizione standard "Default 4MB with spiffs") e copia `merged.bin` in `release\`. Non c'è filesystem. Librerie: RF24 e RunningMedian (copie locali in `C:\src\libraries`). Non ci sono test automatici: si prova con la Main, usando "Test" e "Trova" dalla console.

## Architettura

- **`cell_radio.cpp`**: task FreeRTOS sul core 1 (priorità 2), l'unico che usa il modulo radio. La pipe 0 ascolta il broadcast (beacon della Main) e la pipe 1 l'indirizzo della cella. A ogni invio esegue `stopListening` → `openWritingPipe(main)` → `write` → `startListening`, e `startListening` ripristina la pipe 0 sul broadcast.
  - **Sync**: `SYNC_REQ` ogni secondo, con una raffica iniziale. Usa i 4 timestamp NTP e tiene il campione a delay minimo fra gli ultimi 8. Un salto di offset oltre 0,5 s, confermato da due campioni, azzera la finestra (la Main si è riavviata). La risposta della Main porta anche la configurazione e un comando (beep, test, unpair).
  - **Passaggi**: coda di 32 eventi. Il passaggio viene convertito nel clock della Main al momento dell'invio e l'`EVENT_ACK` ne decide l'esito: OK o DUP lo tolgono dalla coda; BAD scarta il passaggio (e forza il sync); NOT_PAIRED rimuove l'abbinamento. Senza risposta si ritenta dopo 100 ms. L'attesa della risposta (`RF_RESP_TIMEOUT_US`) è 60 ms e la Main ritenta la risposta fino a 15 volte, per coprire le pause della Main durante le scritture in flash. Ogni scambio fallito viene classificato (`linkRecord`: nessun ACK o nessuna risposta), stampato sulla seriale e riportato alla Main nel `SYNC_REQ` (`lossNoAck`/`lossNoResp`, ultimi 20 scambi). `seq` parte da un valore casuale a ogni avvio.
  - **Potenza**: ogni invio usa il livello di `s_power` (`RfPowerCtl` in `rf_protocol.h`): scende quando la Main riceve forte (`RF_RESP_RPD` nella `SYNC_RESP`), sale con le perdite, ruota dopo 4 perdite di fila. Il livello va alla Main nei bit `RF_SYNC_PWR_MASK` del `SYNC_REQ`. Durante l'abbinamento il livello ruota a ogni tentativo.
  - **LED3 / errori**: `setLastError`/`markErrorLocked` solo per passaggi rifiutati o persi (scaduti o coda piena). Gli scambi falliti e poi ritentati vanno solo sulla seriale (`linkRecord`).
  - **Abbinamento**: avviene quando la cella sente un beacon con il flag di abbinamento e non è abbinata, oppure è accesa da meno di `CELL_REPAIR_WINDOW_MS` e non ha mai sentito la sua Main. Il kit (id della Main) e la configurazione stanno in NVS (`rf_kit`, `cell_line`, `lockout_ms`, `cell_buzzer`).
- **`cell_sensor.cpp`**: fotocellula su GPIO17. L'interrupt registra il fronte e `cellSensorPoll()` lo conferma dopo 10 ms; il lockout viene applicato sull'istante del fronte.
- **`cell_feedback.cpp`**: 4 LED discreti e buzzer LEDC, aggiornati ogni 10 ms dal `loop()`. Il significato dei LED è descritto in `cell_feedback.h`.
- **`power.cpp`**: autoritenuta, batteria e pulsante (vedi `Chronofit_Main_Cell_RF/CLAUDE.md`).
- I callback `onCellConfigChanged` e `onCellCommand` sono definiti nello sketch e vengono chiamati dal task radio.
