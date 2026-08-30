# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Chronofit GPS is the firmware + web UI for an ESP32-based race-timing device (photocell/IR checkpoint timer with GPS-disciplined clock, thermal printer, buzzer, RGB status LEDs, and MQTT/WiFi connectivity). The ESP32 runs an AsyncWebServer that both serves a browser-based UI (from LittleFS) and exposes an HTTP/WebSocket API consumed by that UI. There is no separate backend server — the device itself is the server, typically reached over its own WiFi Access Point (`192.168.10.1`) or in STA mode on the venue's WiFi.

The repository root (`C:\src\chronofit`) also contains hardware design files (KiCad schematics/PCB in `Schematic/`, mechanical STLs in `Drawings/`), and a couple of standalone Windows companion apps under `Software/` (`ChronoUpdater` — C# firmware updater/flasher, `MqttMonitor` — WPF MQTT debug tool) plus a minimal standalone test sketch `Chrono_MQTT/Chrono_MQTT.ino`. These are separate from this firmware project — nearly all active development happens in this `Chronofit_GPS/` folder.

## Build / flash commands

Toolchain: `arduino-cli` targeting FQBN `esp32:esp32:esp32` (ESP32 Dev Module). Several overlapping scripts exist (evolved over time) — the ones actually in use:

- `deploy.bat` — full release pipeline: runs `compress_assets.py` to minify/gzip `data/`, builds `littlefs.bin` with `mklittlefs.exe`, then copies bootloader/partitions/app/fs/merged binaries into `release/`. Arduino compile step is commented out (compile separately first with `arduino-cli` or the Arduino IDE/VS Code Arduino extension using `.vscode/arduino.json`).
- `build_cli.bat` — one-shot compile + LittleFS image + flash for the 16MB flash variant (`FlashSize=16M`), custom partition table.
- `program.bat` — erases flash and writes the pre-built `release/merged.bin` + `release/fs.bin` to a blank device (initial provisioning).
- `load_on_littlefs.py` — rebuilds `littlefs.bin` from `data/` and flashes just the filesystem partition (fast iteration on the web UI without recompiling firmware).
- `upload_fs.bat` / `upload_fs_16MB.bat` — filesystem-only upload variants.

Ports/board variants (COM port, flash size, partition scheme) differ between scripts — check the `SET PORT=` / FQBN line in the script before running rather than assuming COM2/COM3/COM5/COM7. `partitions.csv` is the source of truth for the flash layout (custom partition table, not a stock Arduino scheme).

`.vscode/arduino.json` defines the board config for the VS Code Arduino extension (`Chronofit_GPS.ino` as sketch, 4M flash, PSRAM disabled).

## Frontend iteration (fast loop, no flashing)

The `data/` folder is served as-is by LittleFS/AsyncWebServer, so for pure UI work you don't need the device or even a full LittleFS flash:

```
python -m http.server 8433 --directory data
```

(matches `.claude/launch.json`'s `static-data-server` config). Pages that call the device API will fail without a live ESP32, but layout/i18n/static behavior can be checked this way. When ready to test against real hardware, use `load_on_littlefs.py` to push just the `data/` folder.

Before committing JS changes, syntax-check with Node (no bundler/build step exists for the frontend):
```
node --check data/script.js
node --check data/script_view.js
node --check data/i18n.js
node --check data/disciplines.js
```

**Asset pipeline**: `compress_assets.py` minifies `*.js` via `npx terser` and gzips JS/CSS/HTML/`manifest.json` into sibling `.gz` files (e.g. `script.js.gz`). These `.gz` files are committed alongside their sources and served automatically by AsyncWebServer's static handler when the client accepts gzip — **whenever you edit a file in `data/`, regenerate its `.gz` too** (run `compress_assets.py`, or the stale minified copy will be served instead of your change).

There is no package.json / npm project for the frontend — it's hand-written vanilla JS/HTML/CSS, `terser` is invoked ad hoc via `npx`.

## Architecture

### Firmware (C/C++, Arduino framework)

Single-sketch layout (`Chronofit_GPS.ino` + flat `.cpp`/`.h` modules, no subfolders). Key modules:

| File | Responsibility |
|---|---|
| `Chronofit_GPS.ino` | `setup()`/`loop()`, sensor ISRs, GPS NMEA stream parsing, RTC drift calibration loop |
| `routes.cpp`/`.h` | **All** HTTP routes and the WebSocket handler registered in one `registerRoutes()` — see `API.md` for the full contract |
| `globals.h`/`.cpp` | Shared mutable state (sensor arrays, sync status, WiFi/MQTT flags) — most modules reach into these `extern` globals directly rather than passing state around |
| `settings.cpp`/`.h` | Thin typed wrappers around ESP32 `Preferences` (NVS) for persisted config |
| `constants.h` / `Params.h` | Pin assignments (hardware-version-gated via `#ifdef VER2`), protocol/message-type enum values shared conceptually with the JS frontend, firmware version string |
| `time_utils.cpp`/`.h` | Precise-time computation combining RTC ticks + GPS PPS/NMEA sync + calibration factor |
| `RTC.cpp`/`.h` | DS3231 RTC driver (1Hz square wave, aging/calibration register) |
| `gps_custom.h` | Custom lightweight NMEA parsing helpers on top of TinyGPSPlus for the ATGM336H module |
| `mqtt.cpp`/`.h` | MQTT publish of checkpoints + pending-action confirm/discard flow |
| `printer.cpp`/`.h`, `services_serial.*` | Thermal printer output over a shared UART (`ServicesSerial`, also used for GPS) |
| `buzzer.cpp`/`.h`, `LedStrip.cpp`/`.h` | Audible/visual feedback (buzzer patterns, WS2812 status LEDs via FastLED, gated by `VER2`) |
| `diagnostic.cpp`/`.h` | System info (RAM, CPU temp, filesystem usage) surfaced via `/systemSettings` |
| `secrets.h` | Hardcoded third-party credentials (email providers, MQTT test broker) — **contains live keys, handle with care**, not something to print or paste elsewhere |

Two hardware revisions coexist behind `#ifdef VER2` in `constants.h`/`Chronofit_GPS.ino` (pin mappings, LED strip vs discrete LEDs). `VER2` is currently the active/default path.

Core runtime model: sensor edges and RTC/PPS ticks are captured in ISRs (`sensorISR`, `onSecondTick`, `onPpsInterrupt`) that only set `volatile` flags/timestamps under `portENTER_CRITICAL(&isrMux)`; `loop()` drains these flags each iteration and does the real work (checkpoint recording, printing, MQTT publish, WebSocket broadcast). GPS time sync reconciles a PPS edge with the most recent valid NMEA sentence within a tight microsecond window (`processServicesSerial()` / the PPS handling block in `loop()`).

### Frontend (`data/`, vanilla JS/HTML/CSS served from LittleFS)

No framework, no build tool beyond the minify/gzip pass described above. Pages are paired with a dedicated script (or are fully self-contained with an inline `<script>`):

| Page | Script | Purpose |
|---|---|---|
| `index.html` | `script.js` (~5k lines, the largest module) + `i18n.js` + `disciplines.js` | Main operator console: checkpoint capture, session/line management, settings |
| `view.html` | `script_view.js` | Read-only session/results view |
| `view_enduro.html` | `script_view_enduro.js` + `i18n.js` | Enduro-discipline results view |
| `enduro_competitor_start.html` / `enduro_competitor_finish.html` | `script_enduro_competitor.js` + `i18n.js` | Competitor-facing start/finish screens for enduro events |
| `admin.html` | inline | Admin/maintenance page |
| `gps.html` | inline | GPS diagnostics page |
| `stream.html` / `broadcast.html` | `stream.js` / `broadcast.js` | HLS video stream viewer/broadcast (via `hls.js` from CDN) |
| `update.html` | inline | Firmware/filesystem OTA update UI |
| `sponsor.html` | inline | Sponsor display page |

`i18n.js` is a small hand-rolled i18n engine (`TRANSLATIONS` object per language, `t(key, ...args)`, `setLanguage()`, `data-i18n` attribute binding) — see the comment block at the top of the file for how to add a language. Pages communicate with the device over the routes documented in `API.md`, plus the `/ws` WebSocket for realtime push (checkpoint events, time ticks, settings/row updates — see the event type table in `API.md` and the matching `TYPE_*` constants in `Params.h`).

### API contract

`API.md` (Italian) is the authoritative, actively maintained reference for every HTTP route, its parameters, and the WebSocket event schema — read it before adding or changing a route, and update it when routes change. `API_public.md`/`API_public.html` is a derived public-facing copy; `md_converter.py` renders `API.md`/`API_public.md` to PDF via `pypandoc`.

Auth model: routes marked 🔒 in `API.md` require an `X-Token` header matching an NVS-stored token; if no token is configured, all requests are authorized (default for a fresh device).
