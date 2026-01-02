import os
import subprocess

# CONFIG - adatta ai tuoi percorsi
MKLITTLEFS = "mklittlefs.exe"
ESPTOOL = "esptool.py"   # esptool lo richiama da Python
PORT = "COM7"            # cambia con la tua porta ESP32
BAUD = "921600"
FOLDER = "data"          # cartella locale con i file
SIZE = "0x160000"        # dimensione partizione (es. 1MB)
OFFSET = "0x290000"      # offset partizione LittleFS (dipende dal partitions.csv)
BIN = "littlefs.bin"
CHIP = "esp32"
#CHIP = "esp32c3"

def run_cmd(cmd):
    print(">>>", " ".join(cmd))
    subprocess.run(cmd, check=True)

def main():
    # 1. Genera immagine
    run_cmd([MKLITTLEFS, "-c", FOLDER, "-p", "256", "-b", "4096", "-s", SIZE, BIN])

    # 2. Flash immagine
    run_cmd([
        "python", "-m", "esptool",
        "--chip", CHIP,
        "--port", PORT,
        "--baud", BAUD,
        "write_flash", OFFSET, BIN
    ])

if __name__ == "__main__":
    main()