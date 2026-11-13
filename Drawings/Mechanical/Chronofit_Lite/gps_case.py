"""Case a due gusci per la scheda Chronofit GPS (50 x 60 mm) con fotocellula GL10 sul coperchio, STEP + STL.

Quote ricavate dal modello 3D EasyEDA (OBJ_ChronoFit GPS copy.obj, 1 unita' = 0.254 mm).
Sistema di riferimento: origine nello spigolo anteriore sinistro del PCB, X verso destra,
Y verso il lato antenna ESP32, Z=0 sulla faccia inferiore del PCB. Il lato anteriore (Y=0)
porta USB-C e i 4 LED a luce laterale.

Aperture vere: USB-C (con scassettino esterno per spine sovrastampate), 4 LED, vite M5 allo stativo,
fissaggio fotocellula GL10, antenna SMA. Per il resto (trimmer, ingresso cavi delle morsettiere) il case e'
chiuso; l'unico invito conico (piccolo incavo per centrare la punta del trapano) e' quello dell'antenna IPEX.
I pulsanti reset/boot sulla scheda si premono con uno spillo attraverso 2 forellini con tubi guida verticali nel coperchio.

Uso:  python gps_case.py        (richiede build123d)
Genera nella cartella dello script:
  gps_case_base.step / .stl         base con piantoni (posizione di montaggio)
  gps_case_coperchio.step / .stl    coperchio (posizione di montaggio)
  gps_case_assemblato.step          i due pezzi chiusi, due corpi
  gps_case_base_stampa.stl, gps_case_coperchio_stampa.stl   orientati per la stampa

Chiusura: 4 viti M3x16 dal basso, passano nel piantone della base, nel foro del PCB e si avvitano
nel foro pilota (2.6 mm) del pilastro del coperchio: una vite per angolo chiude il case e blocca il PCB.
Fotocellule GL10 (M4x25) o SR25C (M4x20): 2 viti dall'alto in asole pulite, dadi sotto il coperchio (lato interno).
"""
import os
from build123d import (Align, Axis, Box, Compound, Cone, Cylinder, Pos, RegularPolygon, Rot,
                       export_step, export_stl, extrude, fillet)

MIN = Align.MIN
CEN = (Align.CENTER, Align.CENTER, Align.MIN)

# ---- scheda -------------------------------------------------------------------------
PCB_W, PCB_L = 49.7, 59.7
PCB_T = 1.6                       # spessore reale (il modello OBJ riporta 2.54: verificare)
HOLES = [(3.3, 3.4), (46.4, 3.4), (3.3, 56.35), (46.4, 56.35)]   # fori fissaggio, d = 3.2
Z_TOP_MAX = 11.5                  # punta piu' alta (strip maschio) sopra il fondo del PCB

# ---- case ---------------------------------------------------------------------------
WALL = 2.0
FLOOR = 2.4
STANDOFF = 4.0                    # altezza piantoni: sotto il PCB sporgono saldature fino a -2
X0, X1 = -0.6, PCB_W + 0.6        # cavita' interna
Y0 = -2.4                         # lascia posto alla conchiglia USB-C (sporge a -1.85)
Y1 = PCB_L + 3.0                  # 3 mm dietro il modulo ESP32: spazio per il dado del connettore SMA
Z_LID = Z_TOP_MAX + 3.5           # piano di appoggio del coperchio = soffitto cavita' (alto abbastanza anche con PCB 2.54)
LID_T = 2.0
LIP_H, LIP_T, LIP_CLR = 2.0, 1.0, 0.2
SCREW_CLEAR, SCREW_PILOT, BOSS_D = 3.4, 2.6, 6.4
HEAD_D, HEAD_DEPTH = 6.4, 1.6

# ---- inviti per il trapano ----------------------------------------------------------
DIMPLE_R, DIMPLE_DEPTH = 1.4, 1.2      # incavo conico: d 2.8 in superficie, profondo 1.2

# USB-C (parete anteriore): foro a forma di connettore (stadio 9.6 x 3.8, il ricettacolo e' 8.94 x 3.26;
# alla spina basta 8.34 x 2.56, quindi lo 0.5 mm di gioco in altezza copre l'incertezza sullo spessore PCB)
# centrato a z 3.25 (a meta' tra PCB 1.6 e 2.54), piu' uno "scassettino" esterno 14 x 9 che
# accoglie il corpo sovrastampato di una spina piu' grande del connettore. La spina si ferma sul fondo
# dello scassettino, a 1 mm dalla parete interna, e la parte metallica entra nel ricettacolo.
USB_CX, USB_CZ = 37.5, 3.25
USB_SLOT_W, USB_SLOT_H = 9.6, 3.8
USB_POCKET_W, USB_POCKET_H, USB_POCKET_R = 14.0, 9.0, 3.0
USB_PAD = 3.0                          # sporgenza esterna che da' profondita' allo scassettino
USB_PAD_W, USB_PAD_H = 16.6, 13.0               # non deve toccare l'ultimo LED (bordo a x 29.12)
USB_FLOOR = 1.0                        # spessore di parete lasciato sotto lo scassettino
# 4 LED a luce laterale: asole 3.6 x 2.4 (il LED e' 4.0 x 2.0, il lato visibile resta ben illuminato)
LED_X = [10.68, 16.23, 21.77, 27.32]
LED_Z = 3.07
LED_W, LED_H = 3.6, 2.4
LED_BAFFLE = (7.9, 31.1, 0.8, 5.2)     # x0, x1, z0, z1: tunnel interno che separa i LED
# pulsanti reset/boot sul PCB (i due tasti rotondi a centro scheda e vicino alla parete destra): foro da 2.4
# con tubo guida verticale dal coperchio fino a ~2 mm sopra il tasto. Si preme con uno spillo o una graffetta.
# Il foro e' sul coperchio proprio sopra il tasto: una fotocellula montata sopra lo coprirebbe, vedi le asole sotto.
BUTTONS = [(28.5, 29.9), (46.7, 27.65)]
BTN_HOLE_D, BTN_TUBE_D = 2.4, 4.6
BTN_TUBE_Z = 6.0                       # fondo del tubo: sopra i tasti (4.5 al massimo) e i componenti vicini

# ---- fissaggio allo stativo con vite M5 ---------------------------------------------
# Base d'appoggio sulla parete sinistra, centrata sul lato (in Y e in Z): il coperchio resta
# perpendicolare allo stativo, cosi' la fotocellula (sul coperchio) guarda in orizzontale.
# La vite M5 entra da fuori; il dado M5 sta in una tasca esagonale ricavata dal lato interno
# (si inserisce da dentro con la base vuota e la vite lo tira contro il fondo della tasca).
# Dalla faccia interna del dado la vite deve sporgere al massimo ~2 mm: oltre c'e' la morsettiera.
TRIPOD_PAD_T = 6.0                     # sporgenza oltre la parete
TRIPOD_PAD_LEN = 40.0                  # lunghezza base d'appoggio lungo Y (altezza: tutta la base)
M5_CLEAR = 5.5                         # foro passante per M5
M5_NUT_AF, M5_NUT_T = 8.3, 4.2         # dado M5 (8 mm sulle facce, 4 mm) + gioco di stampa
NUT_POCKET_DEPTH = 4.6                 # dalla faccia interna della parete

# ---- fotocellule sul coperchio: SICK GL10 e Leuze SR25C ------------------------------
# Due sole asole (una per lato), corte e orizzontali (lungo X), compatibili con tutti e due i modelli: vanno dal
# foro della SR25C (interasse 30, M4, a 26.6 dal fronte ottico) a quello della GL10 (interasse 36, M4, a 34.7 dal
# fronte ottico). Nessun rinforzo ne' sede per i dadi (i dadi stanno sotto il coperchio).
# Fascio verso -Y: il corpo sta davanti ai fori e sporge dal bordo anteriore, quindi lascia liberi i fori dei
# pulsanti reset/boot (y 28-30) e sotto non c'e' niente di alto. Con le asole a PHOTO_Y il fronte ottico cade
# a PHOTO_Y - 34.7 (GL10) o PHOTO_Y - 26.6 (SR25C); il corpo deve finire prima di y 25.4 (GL10: PHOTO_Y <= 21.4,
# SR25C <= 22). Piu' avanti di y 8.7 l'asola tocca i pilastri delle viti di chiusura.
SLOT_PITCHES = (30.0, 36.0)            # SR25C, GL10
SLOT_W = 4.4
PHOTO_Y = 12.0

# ---- antenna IPEX: invito sulla parete posteriore ---------------------------------------
ANT_X, ANT_Z = 33.5, 8.0           # solo un invito: la foratura (SMA da pannello, 6.5) si fa a mano


def box(x0, x1, y0, y1, z0, z1):
    return Pos(x0, y0, z0) * Box(x1 - x0, y1 - y0, z1 - z0, align=(MIN, MIN, MIN))


def cyl(x, y, d, z0, z1):
    return Pos(x, y, z0) * Cylinder(d / 2, z1 - z0, align=CEN)


def rounded_y(x0, x1, y0, y1, z0, z1, r=None):
    """Scatola lungo Y con spigoli arrotondati: r=None -> asola (stadio) al massimo raggio."""
    r = min(x1 - x0, z1 - z0) / 2 - 0.01 if r is None else r
    return fillet(box(x0, x1, y0, y1, z0, z1).edges().filter_by(Axis.Y), r)


def dimple(p, n, r=None):
    """Incavo conico con la punta a profondita' DIMPLE_DEPTH sotto il punto p della superficie, normale uscente n."""
    r = DIMPLE_R if r is None else r
    h = DIMPLE_DEPTH + 0.6
    cone = Cone(0.15, r * h / DIMPLE_DEPTH, h, align=CEN)
    rot = {(0, 0, 1): Rot(0, 0, 0), (0, -1, 0): Rot(90, 0, 0), (0, 1, 0): Rot(-90, 0, 0),
           (-1, 0, 0): Rot(0, -90, 0), (1, 0, 0): Rot(0, 90, 0)}[n]
    tip = (p[0] - n[0] * DIMPLE_DEPTH, p[1] - n[1] * DIMPLE_DEPTH, p[2] - n[2] * DIMPLE_DEPTH)
    return Pos(*tip) * rot * cone


OX0, OX1, OY0, OY1 = X0 - WALL, X1 + WALL, Y0 - WALL, Y1 + WALL
Z_FLOOR_TOP = -STANDOFF
Z_BOT = Z_FLOOR_TOP - FLOOR
Z_LID_TOP = Z_LID + LID_T


def outer(z0, z1):
    b = box(OX0, OX1, OY0, OY1, z0, z1)
    return fillet(b.edges().filter_by(Axis.Z), WALL)


def tripod_center():
    return (OY0 + OY1) / 2, (Z_BOT + Z_LID) / 2


def photo_slots():
    """Asole: [(x0, x1, y, larghezza), ...] lato sinistro e destro, x0 < x1."""
    xc = (OX0 + OX1) / 2
    a, b = SLOT_PITCHES
    return [(xc - b / 2, xc - a / 2, PHOTO_Y, SLOT_W), (xc + a / 2, xc + b / 2, PHOTO_Y, SLOT_W)]


def base():
    b = outer(Z_BOT, Z_LID)
    b -= box(X0, X1, Y0, Y1, Z_FLOOR_TOP, Z_LID + 1)
    for x, y in HOLES:
        b += cyl(x, y, BOSS_D, Z_FLOOR_TOP - 0.01, 0)
    for x, y in HOLES:
        b -= cyl(x, y, SCREW_CLEAR, Z_BOT - 1, 0.5)
        b -= cyl(x, y, HEAD_D, Z_BOT - 1, Z_BOT + HEAD_DEPTH)
    # parete anteriore: tunnel interno dei LED + asole passanti
    bar = box(LED_BAFFLE[0], LED_BAFFLE[1], Y0 - 0.01, -0.7, LED_BAFFLE[2], LED_BAFFLE[3])
    b += bar
    for x in LED_X:
        b -= rounded_y(x - LED_W / 2, x + LED_W / 2, OY0 - 1, -0.6, LED_Z - LED_H / 2, LED_Z + LED_H / 2)
    # USB-C: rinforzo esterno, scassettino e foro a forma di connettore
    pad_u = rounded_y(USB_CX - USB_PAD_W / 2, USB_CX + USB_PAD_W / 2, OY0 - USB_PAD, OY0 + 0.5,
                      USB_CZ - USB_PAD_H / 2, USB_CZ + USB_PAD_H / 2, 2.0)
    b += pad_u
    b -= rounded_y(USB_CX - USB_POCKET_W / 2, USB_CX + USB_POCKET_W / 2, OY0 - USB_PAD - 1, OY0 + USB_FLOOR,
                   USB_CZ - USB_POCKET_H / 2, USB_CZ + USB_POCKET_H / 2, USB_POCKET_R)
    b -= rounded_y(USB_CX - USB_SLOT_W / 2, USB_CX + USB_SLOT_W / 2, OY0 + USB_FLOOR - 0.5, Y0 + 1,
                   USB_CZ - USB_SLOT_H / 2, USB_CZ + USB_SLOT_H / 2)
    # base d'appoggio per lo stativo sulla parete sinistra, centrata sul lato, con vite M5 e dado nascosto
    y_c, z_c = tripod_center()
    pad = box(OX0 - TRIPOD_PAD_T, OX0 + 0.5, y_c - TRIPOD_PAD_LEN / 2, y_c + TRIPOD_PAD_LEN / 2, Z_BOT, Z_LID)
    pad = fillet(pad.edges().filter_by(Axis.Z).filter_by(lambda e: e.center().X < OX0), 2.0)
    b += pad
    b -= Pos(OX0 - TRIPOD_PAD_T - 1, y_c, z_c) * Rot(0, 90, 0) * Cylinder(
        M5_CLEAR / 2, TRIPOD_PAD_T + WALL + 2, align=CEN)
    nut = extrude(RegularPolygon(M5_NUT_AF / 3 ** 0.5, 6), NUT_POCKET_DEPTH + 1)   # asse Z, poi girato lungo -X
    b -= Pos(X0 + 1.0, y_c, z_c) * Rot(0, -90, 0) * nut
    # antenna IPEX: un solo invito sulla parete posteriore (cono piu' largo: serve a partire un foro da 6.5)
    b -= dimple((ANT_X, OY1, ANT_Z), (0, 1, 0), r=2.2)
    return b


def button_guide(p, bx, by):
    """Tubo guida verticale sotto il coperchio, con foro passante."""
    p += cyl(bx, by, BTN_TUBE_D, BTN_TUBE_Z, Z_LID + 0.01)
    return p - cyl(bx, by, BTN_HOLE_D, BTN_TUBE_Z - 1, Z_LID_TOP + 1)


def lid():
    z0 = Z_LID
    p = outer(z0, Z_LID_TOP)
    ix0, ix1, iy0, iy1 = X0 + LIP_CLR, X1 - LIP_CLR, Y0 + LIP_CLR, Y1 - LIP_CLR
    lip = box(ix0, ix1, iy0, iy1, z0 - LIP_H, z0 + 0.01) -         box(ix0 + LIP_T, ix1 - LIP_T, iy0 + LIP_T, iy1 - LIP_T, z0 - LIP_H - 1, z0 + 1)
    p += lip
    for x, y in HOLES:                       # pilastri che premono il PCB
        p += cyl(x, y, BOSS_D, PCB_T, z0 + 0.01)
    for x, y in HOLES:
        p -= cyl(x, y, SCREW_PILOT, PCB_T - 1, Z_LID_TOP - 0.8)
    # asole pulite per le fotocellule, passanti nel solo piano del coperchio
    for x0, x1, y, w in photo_slots():
        p -= cyl(x0, y, w, z0, Z_LID_TOP + 1) + cyl(x1, y, w, z0, Z_LID_TOP + 1)
        p -= box(x0, x1, y - w / 2, y + w / 2, z0, Z_LID_TOP + 1)
    # pulsanti reset/boot
    for bx, by in BUTTONS:
        p = button_guide(p, bx, by)
    return p


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    B, L = base(), lid()
    export_step(B, os.path.join(here, "gps_case_base.step"))
    export_step(L, os.path.join(here, "gps_case_coperchio.step"))
    export_step(Compound([B, L]), os.path.join(here, "gps_case_assemblato.step"))
    export_stl(B, os.path.join(here, "gps_case_base.stl"))
    export_stl(L, os.path.join(here, "gps_case_coperchio.stl"))
    # orientamento di stampa: base com'e' (fondo sul piano), coperchio capovolto (piano sopra sul letto)
    export_stl(Pos(0, 0, -Z_BOT) * B, os.path.join(here, "gps_case_base_stampa.stl"))
    Lf = Rot(180, 0, 0) * L
    bb = Lf.bounding_box()
    export_stl(Pos(0, 0, -bb.min.Z) * Lf, os.path.join(here, "gps_case_coperchio_stampa.stl"))
    for n, s in (("base", B), ("coperchio", L)):
        bb = s.bounding_box()
        print(n, round(s.volume / 1000, 1), "cm3", f"{bb.size.X:.1f} x {bb.size.Y:.1f} x {bb.size.Z:.1f}", "valid", s.is_valid)
    for x0, x1, y, w in photo_slots():
        print("asola x", round(x0, 2), "..", round(x1, 2), "y", y, "larghezza", w)
