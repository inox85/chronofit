"""Genera l'immagine LittleFS della ChronofitMainCell RF e la scrive sulla scheda.

Mappa flash: partizione standard ESP32 "Default 4MB with spiffs"
(tools/partitions/default.csv del core esp32):

    nvs       0x9000    0x5000
    otadata   0xE000    0x2000
    app0      0x10000   0x140000
    app1      0x150000  0x140000
    spiffs    0x290000  0x160000   <- LittleFS (1,375 MB)
    coredump  0x3F0000  0x10000

Nell'immagine finiscono solo i file che il server usa davvero: di ogni file
con la copia compressa (es. script.js + script.js.gz) entra solo il .gz,
perché serveStatic e serveGzipped servono il .gz quando esiste. Così la UI
(circa 1 MB) lascia spazio a session.json e agli altri file di sessione.
Prima di lanciarlo rigenera i .gz con compress_assets.py.

Uso:
    python load_on_littlefs.py              genera littlefs.bin e lo scrive sulla scheda
    python load_on_littlefs.py --no-flash   genera solo littlefs.bin
    python load_on_littlefs.py --port COM5  porta seriale diversa
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# mklittlefs.exe nella cartella del progetto, altrimenti quello di Chronofit_GPS
MKLITTLEFS = os.path.join(BASE_DIR, "mklittlefs.exe")
if not os.path.exists(MKLITTLEFS):
    MKLITTLEFS = os.path.join(BASE_DIR, "..", "Chronofit_GPS", "mklittlefs.exe")
FOLDER = os.path.join(BASE_DIR, "data")
BIN = os.path.join(BASE_DIR, "littlefs.bin")

PORT = "COM2"
BAUD = "921600"
CHIP = "esp32"
OFFSET = 0x290000   # partizione spiffs della tabella standard da 4 MB
SIZE = 0x160000

# Lasciato libero per i file creati a runtime (session.json, rf_cells.json, ...)
MIN_FREE_BYTES = 128 * 1024


def run_cmd(cmd):
    print(">>>", " ".join(cmd))
    subprocess.run(cmd, check=True)


def stage_files(dst):
    """Copia in `dst` i file da mettere nell'immagine. Ritorna i byte totali."""
    names = set(os.listdir(FOLDER))
    total = 0
    for name in sorted(names):
        src = os.path.join(FOLDER, name)
        if not os.path.isfile(src):
            continue
        if name + ".gz" in names:
            continue   # c'è la versione compressa: l'originale non serve sul dispositivo
        shutil.copy2(src, os.path.join(dst, name))
        total += os.path.getsize(src)
    return total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-flash", action="store_true", help="genera solo littlefs.bin")
    parser.add_argument("--port", default=PORT)
    parser.add_argument("--out", default=BIN, help="percorso dell'immagine generata")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as staging:
        total = stage_files(staging)
        print(f"File nell'immagine: {total} byte su {SIZE} ({SIZE - total} liberi)")
        if SIZE - total < MIN_FREE_BYTES:
            sys.exit(f"ERRORE: restano meno di {MIN_FREE_BYTES} byte liberi per la sessione")

        # 1. Genera immagine LittleFS
        run_cmd([
            MKLITTLEFS,
            "-c", staging,
            "-p", "256",
            "-b", "4096",
            "-s", hex(SIZE),
            args.out,
        ])

    if args.no_flash:
        return

    # 2. Flash immagine su ESP32
    run_cmd([
        sys.executable, "-m", "esptool",
        "--chip", CHIP,
        "--port", args.port,
        "--baud", BAUD,
        "write_flash",
        hex(OFFSET),
        args.out,
    ])


if __name__ == "__main__":
    main()
