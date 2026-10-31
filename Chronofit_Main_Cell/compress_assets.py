import gzip
import shutil
import subprocess
import sys
from pathlib import Path

# stdout rediretto (log di build) su Windows e cp1252: non deve fallire sui caratteri come →
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

data_dir = Path("data")

# Su Windows npx è npx.cmd: subprocess senza shell non lo trova con il solo nome "npx"
NPX = shutil.which("npx") or "npx"

if not data_dir.exists():
    print("❌ Cartella 'data' non trovata!")
    sys.exit(1)

# file da minificare + comprimere
JS_GLOB = "*.js"
# file da comprimere senza minificazione (escludi i .gz già esistenti)
GZIP_ONLY_GLOBS = ["*.css", "*.html", "manifest.json"]
# formati già compressi — non toccare
SKIP_SUFFIXES = {".gz", ".mp3", ".png", ".webp", ".jpg", ".jpeg", ".ico", ".woff2", ".pdf"}

def collect(globs):
    files = []
    for pattern in globs:
        for f in data_dir.glob(pattern):
            if f.suffix not in SKIP_SUFFIXES and not f.name.endswith(".gz"):
                files.append(f)
    return files

js_files   = [f for f in data_dir.glob(JS_GLOB)
              if f.suffix not in SKIP_SUFFIXES and not f.name.endswith(".gz")]
gzip_files = collect(GZIP_ONLY_GLOBS)

total_saved = 0

for f in js_files + gzip_files:
    out_gz = f.with_suffix(f.suffix + ".gz")

    if f in js_files:
        try:
            result = subprocess.run(
                [NPX, "terser", str(f), "--compress", "--mangle"],
                capture_output=True, check=True
            )
            # byte grezzi: con text=True Windows decodifica in cp1252 e fallisce sui caratteri UTF-8
            content = result.stdout
            print(f"[MINIFY] {f.name} → {len(content)} bytes")
        except Exception as e:
            print(f"[WARN] terser fallito per {f.name}: {e}, uso file originale")
            content = f.read_bytes()
    else:
        content = f.read_bytes()

    with gzip.open(str(out_gz), "wb", compresslevel=9) as gz:
        gz.write(content)

    orig = f.stat().st_size
    comp = out_gz.stat().st_size
    saved = orig - comp
    total_saved += saved
    print(f"[GZIP]  {f.name}: {orig}B → {comp}B ({100 - comp*100//orig}% saved)")

print(f"\n✅ Totale risparmiato: {total_saved} bytes ({total_saved//1024} KB)")
