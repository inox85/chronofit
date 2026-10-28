"""Guscio adattatore Leuze SR25C -> alloggiamento della SICK GL10.

Due metà divise a metà spessore (piano di divisione z = 10): l'esterno ricalca
la GL10 (20 x 50 x 39,3 mm) e i due fori da 4,2 mm restano dove stavano quelli
della GL10, così le stesse viti M4 montano il guscio e chiudono le due metà.

Sistema di riferimento: X dal fronte ottico verso il retro, Y dal basso, Z nello
spessore. Genera, nella cartella dello script:
  sr25_adapter_meta_A.stl / _B.stl   pronte per la stampa (piano di divisione in alto)
  sr25_adapter_assemblato.stl        le due metà chiuse, solo per controllo

Uso:  python sr25_adapter.py        (richiede numpy e manifold3d)
"""
import os
import struct
import numpy as np
from manifold3d import Manifold

from sr25_params import *  # noqa: F401,F403

SEG = 64


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def cyl_z(x, y, r, z0, z1):
    return Manifold.cylinder(z1 - z0, r, r, SEG).translate((x, y, z0))


def cyl_y(x, z, r, y0, y1):
    return Manifold.cylinder(y1 - y0, r, r, SEG).rotate((-90, 0, 0)).translate((x, y0, z))


def half(with_pegs, with_pins=True):
    """Metà con l'esterno a z = 0 e il piano di divisione a z = ZP."""
    body = box(0, W, 0, H, 0, ZP)

    px0, px1 = LIP, OFF[0] + SR_X + CLR
    py0, py1 = OFF[1] + SR_Y0 - CLR, OFF[1] + SR_Y1 + CLR
    pz0 = ZP - (SR_T + 0.3) / 2
    cuts = [box(px0, px1, py0, py1, pz0, ZP + 1)]

    # finestra ottica frontale
    cuts.append(box(-1, LIP + 0.5, OFF[1] + SR_LENS_Y[0], OFF[1] + SR_LENS_Y[1],
                    OFF[2] + SR_LENS_Z[0], ZP + 1))
    # parte inferiore asportata sotto il sensore: cavo e manicotto liberi (resta il blocco posteriore con i fori)
    cuts.append(box(-1, px1, -1, OFF[1] + SR_Y0, -1, ZP + 1))
    # accesso a potenziometro e LED dall'alto
    cuts.append(cyl_y(OFF[0] + SR_POT_X, ZP, 2.8, py1 - 0.1, H + 1))
    cuts.append(cyl_y(OFF[0] + SR_LED_X, ZP, 1.8, py1 - 0.1, H + 1))
    # fori di fissaggio GL10
    for y in HOLE_Y:
        cuts.append(cyl_z(HOLE_X, y, HOLE_D / 2, -1, ZP + 1))
    # sede dei centraggi
    pegs = PEGS
    if not with_pegs:
        cuts += [cyl_z(x, y, 1.6, ZP - 3.0, ZP + 1) for x, y in pegs]
    for c in cuts:
        body = body - c

    if with_pegs:
        for x, y in pegs:
            body = body + cyl_z(x, y, 1.4, ZP - 0.5, ZP + 2.5)
    if with_pins:   # piolini nei fori M4 del sensore (Ø 3,0 contro 3,2)
        for sy in SR_HOLE_Y:
            body = body + cyl_z(OFF[0] + SR_HOLE_X, OFF[1] + sy, 1.5, pz0 - 0.2, pz0 + 2.4)
    return body


def to_assembly(a, b):
    return a + b.mirror((0, 0, 1)).translate((0, 0, T))


def write_stl(m, path):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties, dtype=np.float32)[:, :3]
    t = np.asarray(mesh.tri_verts, dtype=np.int64)
    tri = v[t]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(t), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n, tri
    with open(path, "wb") as f:
        f.write(b"Chronofit SR25 adapter".ljust(80, b" "))
        f.write(struct.pack("<I", len(t)))
        f.write(rec.tobytes())


if __name__ == "__main__":
    out = os.path.dirname(os.path.abspath(__file__))
    a, b = half(True), half(False)
    write_stl(a, os.path.join(out, "sr25_adapter_meta_A.stl"))
    write_stl(b, os.path.join(out, "sr25_adapter_meta_B.stl"))
    write_stl(to_assembly(a, b), os.path.join(out, "sr25_adapter_assemblato.stl"))

    # controlli: manifold, ingombri, interferenza col sensore (senza piolini)
    nop = to_assembly(half(True, False), half(False, False))
    env = box(OFF[0], OFF[0] + SR_X, OFF[1] + SR_Y0, OFF[1] + SR_Y1, OFF[2] - 0.1, OFF[2] - 0.1 + SR_T)
    boot = cyl_y(OFF[0] + SR_CABLE_X, ZP, 3.5, 0, OFF[1] + SR_Y0)
    for name, m in (("A", a), ("B", b)):
        bb = m.bounding_box()
        print(name, "status", m.status(), "volume %.0f mm3" % m.volume(), "bbox", np.round(bb, 2).tolist())
    print("interferenza sensore/guscio: %.4f mm3" % (env ^ nop).volume())
    print("interferenza manicotto/guscio: %.4f mm3" % (boot ^ nop).volume())
