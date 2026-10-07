# CLAUDE.md — Chronofit_Main_Cell

Guidance for Claude Code when working in `Chronofit_Main_Cell/`.

## What this is

`Chronofit_Main_Cell` is the **central unit of the Chronofit wireless-photocell system**: a copy of the base firmware (`../Chronofit_GPS/`) with the same operator console, sessions, views, disciplines, wireless-cell registry (`/clockSync`, `/remoteCheckpoint`, `/cells`) and branding API — but **without GPS sync, the thermo-compensated DS3231 RTC, the thermal printer and MQTT**. Wireless photocells (`../Chronofit_Cell/`) join its AP (`ChronofitMainCell_<chipId>`, `192.168.10.1`) and deliver events to it.

It is a **fork by copy-and-delete**, like `Chronofit_Cell`: fixes made in shared areas of `Chronofit_GPS` (cells registry, branding, sessions, console UI) must be ported here by hand.

## Differences from `Chronofit_GPS`

- **Clock**: only `esp_timer_get_time()`. Wall time = `ppsEpochSec + (esp_timer - syncReference) * calibrationFactor` (`time_utils.cpp`). `calibrationFactor` is read from NVS `timeCal` and adjustable only with the manual `/timeBaseCal`; there is no automatic RTC calibration. After a reboot the clock restarts at 00:00:00 until a manual / line / elapsed sync.
- **No time sync**: the sync-method selector, manual time entry, line-closure sync and the "Sync" settings tab are gone; the device is **always in elapsed mode (3)** — it boots in `ELAPSED_WAITING_START` (persisted `syncMode` is ignored) and the first sensor/cell event starts the elapsed time. `GET /setTime[?mode=3]` just re-arms it (Reset button); any other `mode` answers `400`. Numeric values of the remaining `SYNC_NONE`/`ELAPSED_*` status codes in `Params.h` are unchanged (shared with the JS UI). Disciplines no longer carry a `syncMode`.
- **Removed**: `gps_custom.h`, `services_serial.*`, `printer.*`, `RTC.*`, GPS/PPS/RTC/printer routes (`/print`, `/syncTest`, `/setNmeaDeltaDebug`, `/setSerialDebug`), GPS/RTC fields of `/systemSettings`, the print overlay / "Save & print" / timekeepers field, the GPS status icon and `gps.html`. The "Utility" start-menu entry now opens `admin.html`. The 🌍 and 🔗 status icons both open the WiFi settings; the ⚙️ button opens the Device tab. The 🌍 and 🔗 status icons both open the WiFi settings; the ⚙️ button opens the Device tab. The Print tab of the settings overlay is now the **Device** tab (station name, buzzer, fullscreen).
- **Identity**: AP SSID `ChronofitMainCell_<chipId>`, firmware string `MC1.0.0`, `DEV_NAME` `ChronofitMainCell`, static files served with `no-cache` (the base uses 30 days, which can leave browsers on a stale UI after a filesystem update).
- **MQTT removed**: no `mqtt.cpp/.h`, no PubSubClient, no `/mqtt*` routes, no pending-confirm flow (`/mqtt_pending.json`), no `/sendCheckPointRow` and no per-row "send" column (it only re-published to MQTT), no MQTT tab / status icon / notification cards / "Acquire from MQTT" toggle, no `mq` field in the 1 Hz time message, no `TYPE_MQTT_*` WebSocket types. The `Chronofit_Cell` firmware never had MQTT either. Stale NVS keys `mqtt*` from an older flash are simply ignored.
- Unused i18n keys (print/GPS) are intentionally left in `i18n.js`.

## Build

Same toolchain as the base: `arduino-cli` FQBN `esp32:esp32:esp32:FlashSize=16M,FlashMode=dio,FlashFreq=80` and the 16 MB `partitions.csv`. `build_main_cell.bat` compiles, runs `compress_assets.py`, builds `fs.bin` with `..\Chronofit_GPS\mklittlefs.exe` and writes `release\`. **In Arduino IDE set Flash Size = 16MB**, otherwise the bootloader fails with `partition 3 invalid ... exceeds flash chip size 0x400000`.

Frontend iteration: `python -m http.server 8435 --directory data` (the `maincell-data-server` entry in `../Chronofit_GPS/.claude/launch.json`); syntax-check with `node --check data/script.js` (and the other JS). `compress_assets.py` regenerates the `.gz` siblings — rerun it after editing anything in `data/`.

## API

`API.md` in this folder is the pruned copy of the base API (routes that exist here only). Update it when routes change.

## Secrets

`secrets.h` is a copy of the base's file and contains live mail credentials — do not print or paste it.
