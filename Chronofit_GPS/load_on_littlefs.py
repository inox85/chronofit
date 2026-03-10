import os
import subprocess
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# CONFIG
MKLITTLEFS = os.path.join(BASE_DIR, "mklittlefs.exe")
FOLDER = os.path.join(BASE_DIR, "data")
BIN = os.path.join(BASE_DIR, "littlefs.bin")

PORT = "COM2"
BAUD = "921600"
SIZE = "0x160000"
OFFSET = "0x290000"
CHIP = "esp32"
# CHIP = "esp32c3"


def run_cmd(cmd):
    print(">>>", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main():

    # 1. Genera immagine LittleFS
    run_cmd([
        MKLITTLEFS,
        "-c", FOLDER,
        "-p", "256",
        "-b", "4096",
        "-s", SIZE,
        BIN
    ])

    # 2. Flash immagine su ESP32
    run_cmd([
        sys.executable, "-m", "esptool",
        "--chip", CHIP,
        "--port", PORT,
        "--baud", BAUD,
        "write_flash",
        OFFSET,
        BIN
    ])


if __name__ == "__main__":
    main()