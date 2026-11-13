"""Mette la scheda (OBJ EasyEDA) dentro il case, per provare l'ingombro.

Uso:  python scheda_nel_case.py "percorso/OBJ_ChronoFit GPS copy.obj"      (richiede numpy, trimesh)
Genera nella cartella dello script:
  scheda_mm.obj (+ .mtl)       la scheda in mm, nella posizione di montaggio del case
  scheda_nel_case.glb          scheda + base + coperchio (trasparente), da aprire con
                               "Visualizzatore 3D" di Windows, Blender, ecc.
Il PCB e' portato a PCB_T (1.6 mm come in gps_case.py): i componenti sopra il PCB scendono di 2.54-PCB_T.
"""
import os, re, shutil, sys
import numpy as np
import trimesh

PCB_T = 1.6
SCALE = 0.254
ORIGIN = np.array([4219.2588, -3593.9008, 0.0])      # spigolo anteriore sinistro del PCB nell'OBJ
SHIFT = PCB_T - 2.54

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1]
mtl_src = os.path.splitext(src)[0] + ".mtl"


def xf(p):
    p = (np.array(p) - ORIGIN) * SCALE
    if p[2] > 2.0:
        p[2] += SHIFT
    return p


verts, faces, face_mat, mat = [], [], [], None
with open(src) as f, open(os.path.join(here, "scheda_mm.obj"), "w") as out:
    out.write("mtllib scheda_mm.mtl\n")
    for line in f:
        if line.startswith("v "):
            p = xf(list(map(float, line.split()[1:4])))
            verts.append(p)
            out.write("v %.4f %.4f %.4f\n" % tuple(p))
        elif line.startswith("usemtl"):
            mat = line.split()[1]
            out.write(line)
        elif line.startswith("f "):
            idx = [int(t.split("/")[0]) for t in line.split()[1:]]
            out.write("f " + " ".join(map(str, idx)) + "\n")
            for i in range(1, len(idx) - 1):
                faces.append((idx[0] - 1, idx[i] - 1, idx[i + 1] - 1)); face_mat.append(mat)
shutil.copy(mtl_src, os.path.join(here, "scheda_mm.mtl"))

cols, cur = {}, None
for l in open(mtl_src):
    if l.startswith("newmtl"): cur = l.split()[1]
    if l.startswith("Kd"): cols[cur] = [int(float(x) * 255) for x in l.split()[1:4]]
board = trimesh.Trimesh(np.array(verts), np.array(faces), process=False)
board.visual.face_colors = np.array([cols[m] + [255] for m in face_mat], dtype=np.uint8)

parts = [board]
for name, rgba in (("base", [90, 130, 190, 255]), ("coperchio", [230, 150, 90, 90])):
    m = trimesh.load(os.path.join(here, f"gps_case_{name}.stl"))
    m.visual.face_colors = np.tile(rgba, (len(m.faces), 1)).astype(np.uint8)
    parts.append(m)
trimesh.Scene(parts).export(os.path.join(here, "scheda_nel_case.glb"))
print("ok")
