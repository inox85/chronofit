"""Keygen delle licenze Chronofit (a numero di accensioni), lato produttore.

    python keygen.py --init                     crea il segreto (una volta sola)
    python keygen.py f43aece0f908 50               codice per 50 accensioni
    python keygen.py f43aece0f908 illimitata       licenza senza limite
    python keygen.py f43aece0f908 0                blocca il dispositivo (revoca)
    python keygen.py --check f43aece0f908 CODICE   decodifica e verifica un codice

f43aece0f908 è il codice dispositivo (seriale della scheda, eFuse MAC in 12 cifre
esadecimali) mostrato nel popup della licenza e come "sn" in /systemSettings.
Il codice prodotto imposta gli utilizzi residui del dispositivo al valore dato.

Il segreto sta in license_secret.txt (qui) e in license_secret.h (copiato in
Chronofit_GPS, Chronofit_Main_Cell e Chronofit_Main_Cell_RF per la compilazione):
NON va nel repository (vedi .gitignore). Conservane una copia sicura: senza, i
dispositivi già venduti non accettano più codici nuovi.

Ogni codice ha un progressivo per dispositivo, più alto dell'ultimo applicato:
il registro issued.csv tiene l'ultimo emesso. Se lo perdi usa --seq con un
valore più alto di qualunque codice dato a quel dispositivo.
Formato e calcolo identici a license.cpp nel firmware.
"""
import argparse
import csv
import datetime
import hashlib
import hmac
import os
import re
import secrets
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SECRET_FILE = os.path.join(HERE, 'license_secret.txt')
LEDGER_FILE = os.path.join(HERE, 'issued.csv')
PROJECTS = ['Chronofit_GPS', 'Chronofit_Main_Cell', 'Chronofit_Main_Cell_RF']
CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
UNLIMITED = 0xFFFF


def load_secret():
    if not os.path.exists(SECRET_FILE):
        sys.exit('Segreto mancante: lancia prima "python keygen.py --init".')
    return bytes.fromhex(open(SECRET_FILE).read().strip())


def write_header(secret):
    body = ', '.join(f'0x{b:02x}' for b in secret)
    text = ('// Segreto delle licenze: GENERATO da Firmware/License/keygen.py --init.\n'
            '// Non va nel repository. Deve coincidere con License/license_secret.txt.\n'
            '#pragma once\n#include <stdint.h>\n\n'
            f'static const uint8_t LICENSE_SECRET[32] = {{ {body} }};\n')
    for p in PROJECTS:
        d = os.path.join(HERE, '..', p)
        if os.path.isdir(d):
            open(os.path.join(d, 'license_secret.h'), 'w', newline='\n').write(text)
            print('scritto', os.path.normpath(os.path.join(d, 'license_secret.h')))


def parse_device(text):
    t = re.sub(r'[^0-9A-Fa-f]', '', text)
    if len(t) != 12:
        sys.exit(f'Codice dispositivo non valido: {text} (atteso il seriale di 12 cifre, es. f43aece0f908)')
    return int(t, 16)


def tag(secret, device, seq, boots):
    msg = b'CFL2' + device.to_bytes(6, 'big') + seq.to_bytes(2, 'big') + boots.to_bytes(2, 'big')
    return hmac.new(secret, msg, hashlib.sha256).digest()[:6]


def encode(raw):
    bits = int.from_bytes(raw, 'big')
    chars = [CROCKFORD[(bits >> (75 - 5 * i)) & 31] for i in range(16)]
    s = ''.join(chars)
    return '-'.join(s[i:i + 4] for i in range(0, 16, 4))


def decode(code):
    c = code.upper().replace('-', '').replace(' ', '').replace('O', '0').replace('I', '1').replace('L', '1')
    if len(c) != 16 or any(ch not in CROCKFORD for ch in c):
        return None
    bits = 0
    for ch in c:
        bits = (bits << 5) | CROCKFORD.index(ch)
    return bits.to_bytes(10, 'big')


def last_seq(device):
    if not os.path.exists(LEDGER_FILE):
        return 0
    best = 0
    with open(LEDGER_FILE, newline='') as f:
        for row in csv.DictReader(f):
            if row['device'] == f'{device:012x}':
                best = max(best, int(row['seq']))
    return best


def main():
    ap = argparse.ArgumentParser(description='Keygen licenze Chronofit')
    ap.add_argument('--init', action='store_true', help='crea il segreto e license_secret.h')
    ap.add_argument('--check', nargs=2, metavar=('DISPOSITIVO', 'CODICE'), help='verifica un codice')
    ap.add_argument('--seq', type=int, help='progressivo da usare (default: ultimo del registro + 1)')
    ap.add_argument('--note', default='', help='nota nel registro (cliente, fattura...)')
    ap.add_argument('device', nargs='?')
    ap.add_argument('boots', nargs='?', help='accensioni (0-65534) o "illimitata"')
    a = ap.parse_args()

    if a.init:
        if os.path.exists(SECRET_FILE):
            write_header(load_secret())   # rigenera solo gli header dal segreto esistente
            print('Segreto già presente: header rigenerati, segreto invariato.')
            return
        secret = secrets.token_bytes(32)
        open(SECRET_FILE, 'w').write(secret.hex() + '\n')
        print('creato', SECRET_FILE)
        write_header(secret)
        return

    secret = load_secret()
    if a.check:
        device = parse_device(a.check[0])
        raw = decode(a.check[1])
        if raw is None:
            sys.exit('Formato del codice non valido.')
        seq, boots = int.from_bytes(raw[0:2], 'big'), int.from_bytes(raw[2:4], 'big')
        ok = hmac.compare_digest(raw[4:], tag(secret, device, seq, boots))
        print(f'valido: {"si" if ok else "NO"}  progressivo: {seq}  accensioni: {"illimitata" if boots == UNLIMITED else boots}')
        return

    # Senza argomenti li chiede da tastiera (solo per generare un codice: --init e --check non chiedono nulla)
    device_value = a.device if a.device else input('Inserire il codice del dispositivo: ').strip()
    boots_value = a.boots if a.boots is not None else input('Inserire il numero di utilizzi (0-65534, o "illimitata"): ').strip()
    if not device_value or not str(boots_value):
        ap.print_help()
        return
    device = parse_device(device_value)
    if str(boots_value).lower().startswith('ill'):
        boots = UNLIMITED
    else:
        try:
            boots = int(boots_value)
        except ValueError:
            sys.exit(f'Numero di utilizzi non valido: {boots_value} (0-65534, o "illimitata")')
    if not 0 <= boots <= UNLIMITED:
        sys.exit('Accensioni fuori intervallo (0-65534, o "illimitata").')
    seq = a.seq if a.seq is not None else last_seq(device) + 1
    if not 1 <= seq <= 0xFFFF:
        sys.exit('Progressivo fuori intervallo (1-65535).')
    raw = seq.to_bytes(2, 'big') + boots.to_bytes(2, 'big') + tag(secret, device, seq, boots)
    code = encode(raw)
    new = not os.path.exists(LEDGER_FILE)
    with open(LEDGER_FILE, 'a', newline='') as f:
        w = csv.writer(f)
        if new:
            w.writerow(['date', 'device', 'seq', 'boots', 'code', 'note'])
        w.writerow([datetime.datetime.now().isoformat(timespec='seconds'), f'{device:012x}', seq,
                    'illimitata' if boots == UNLIMITED else boots, code, a.note])
    print(f'Dispositivo {device:012x}  progressivo {seq}  accensioni {"illimitata" if boots == UNLIMITED else boots}')
    print(code)


if __name__ == '__main__':
    main()
