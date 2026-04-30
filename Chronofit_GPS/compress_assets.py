import gzip
import subprocess
import sys
import os
from pathlib import Path

data_dir = Path("data")

if not data_dir.exists():
    print("❌ Cartella 'data' non trovata!")
    sys.exit(1)

js_files  = list(data_dir.glob("*.js"))
css_files = list(data_dir.glob("*.css"))

total_saved = 0

for f in js_files + css_files:
    out_gz = f.with_suffix(f.suffix + ".gz")
    
    if f.suffix == ".js":
        try:
            result = subprocess.run(
                ["npx", "terser", str(f), "--compress", "--mangle"],
                capture_output=True, text=True, check=True
            )
            content = result.stdout.encode()
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
    print(f"[GZIP] {f.name}: {orig}B → {comp}B ({100 - comp*100//orig}% saved)")

print(f"\n✅ Totale risparmiato: {total_saved} bytes ({total_saved//1024} KB)")