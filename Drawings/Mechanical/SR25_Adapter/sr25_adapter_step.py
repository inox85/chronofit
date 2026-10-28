"""Esporta il guscio SR25C -> GL10 in STEP (solidi editabili in Fusion 360).

Stesse quote e stessa costruzione di sr25_adapter.py (vedi sr25_params.py).
Genera, nella cartella dello script:
  sr25_adapter_meta_A.step / _B.step   come le STL di stampa (piano di divisione in alto)
  sr25_adapter_assemblato.step         le due metà chiuse, due corpi

Uso:  python sr25_adapter_step.py       (richiede build123d)
"""
import os
from build123d import (Align, Compound, Cylinder, Box, Location, Plane, Pos, Rot,
                       export_step, import_step, mirror)
from sr25_params import *  # noqa: F401,F403

MIN = Align.MIN
CZ = (Align.CENTER, Align.CENTER, Align.MIN)


def box(x0, x1, y0, y1, z0, z1):
    return Pos(x0, y0, z0) * Box(x1 - x0, y1 - y0, z1 - z0, align=(MIN, MIN, MIN))


def cyl_z(x, y, r, z0, z1):
    return Pos(x, y, z0) * Cylinder(r, z1 - z0, align=CZ)


def cyl_y(x, z, r, y0, y1):
    return Pos(x, y0, z) * Rot(-90, 0, 0) * Cylinder(r, y1 - y0, align=CZ)


def half(with_pegs, with_pins=True):
    body = box(0, W, 0, H, 0, ZP)
    px0, px1 = LIP, OFF[0] + SR_X + CLR
    py0, py1 = OFF[1] + SR_Y0 - CLR, OFF[1] + SR_Y1 + CLR
    pz0 = ZP - (SR_T + 0.3) / 2
    cuts = [box(px0, px1, py0, py1, pz0, ZP + 1),
            box(-1, LIP + 0.5, OFF[1] + SR_LENS_Y[0], OFF[1] + SR_LENS_Y[1], OFF[2] + SR_LENS_Z[0], ZP + 1),
            cyl_y(OFF[0] + SR_CABLE_X, ZP, 3.7, -1, py0 + 0.1),
            cyl_y(OFF[0] + SR_POT_X, ZP, 2.8, py1 - 0.1, H + 1),
            cyl_y(OFF[0] + SR_LED_X, ZP, 1.8, py1 - 0.1, H + 1)]
    cuts += [cyl_z(HOLE_X, y, HOLE_D / 2, -1, ZP + 1) for y in HOLE_Y]
    if not with_pegs:
        cuts += [cyl_z(x, y, 1.6, ZP - 3.0, ZP + 1) for x, y in PEGS]
    for c in cuts:
        body = body - c
    if with_pegs:
        for x, y in PEGS:
            body = body + cyl_z(x, y, 1.4, ZP - 0.5, ZP + 2.5)
    if with_pins:
        for sy in SR_HOLE_Y:
            body = body + cyl_z(OFF[0] + SR_HOLE_X, OFF[1] + sy, 1.5, pz0 - 0.2, pz0 + 2.4)
    return body


def in_assembly(b):
    return mirror(b, Plane.XY).moved(Location((0, 0, T)))


def solid(shape, label):
    s = shape.solids()[0] if hasattr(shape, "solids") else shape
    s.label = label
    return s


if __name__ == "__main__":
    out = os.path.dirname(os.path.abspath(__file__))
    a = solid(half(True), "Meta_A")
    b = solid(half(False), "Meta_B")
    export_step(a, os.path.join(out, "sr25_adapter_meta_A.step"))
    export_step(b, os.path.join(out, "sr25_adapter_meta_B.step"))
    asm = Compound(children=[solid(half(True), "Meta_A"), solid(in_assembly(half(False)), "Meta_B")], label="SR25_Adapter")
    export_step(asm, os.path.join(out, "sr25_adapter_assemblato.step"))

    # controlli: volumi (STL: A 9160, B 9081), validità, rilettura, interferenza col sensore
    for name, s in (("A", a), ("B", b)):
        bb = s.bounding_box()
        print(name, "valido", s.is_valid, "volume %.0f mm3" % s.volume,
              "bbox", tuple(round(v, 2) for v in (bb.min.X, bb.min.Y, bb.min.Z, bb.max.X, bb.max.Y, bb.max.Z)))
    nop = in_assembly(half(False, False))
    shell = half(True, False) + nop
    env = box(OFF[0], OFF[0] + SR_X, OFF[1] + SR_Y0, OFF[1] + SR_Y1, OFF[2] - 0.1, OFF[2] - 0.1 + SR_T)
    boot = cyl_y(OFF[0] + SR_CABLE_X, ZP, 3.5, 0, OFF[1] + SR_Y0)
    print("interferenza sensore: %.4f mm3" % (env & shell).volume, "manicotto: %.4f mm3" % (boot & shell).volume)
    for f in ("meta_A", "meta_B", "assemblato"):
        r = import_step(os.path.join(out, "sr25_adapter_%s.step" % f))
        print(f, "riletto: %d solidi, volume %.0f mm3" % (len(r.solids()), sum(x.volume for x in r.solids())))
