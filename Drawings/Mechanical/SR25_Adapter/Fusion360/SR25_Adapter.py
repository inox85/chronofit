"""Fusion 360: guscio adattatore Leuze SR25C -> alloggiamento della SICK GL10.

Stesse quote di ../sr25_adapter.py (in mm). Crea due corpi, "Meta_A" (z 0..10, con i
centraggi) e "Meta_B" (z 10..20, con le sedi), nel documento attivo; i fori da 4,2 mm
sono quelli della GL10. Le quote sono costanti qui sotto: per cambiarle modifica il file
e rilancia lo script (la timeline non e' collegata a parametri utente).

Uso: Utilities > Add-Ins > Scripts and Add-Ins > "+" > Script or add-in from device,
scegliere questa cartella, Run. Poi salvare il documento come .f3d.
Assi: X dal fronte ottico verso il retro, Y dal basso, Z nello spessore.
"""
import traceback
import adsk.core
import adsk.fusion

# --- GL10 (datasheet SICK, pag. 6) ---
W, H, T = 39.3, 50.0, 20.0
HOLE_X, HOLE_Y, HOLE_D = 34.7, (6.4, 42.4), 4.2
# --- SR25C (STEP) ---
SR_X, SR_Y0, SR_Y1, SR_T = 29.9, 0.5, 42.5, 15.2
SR_CABLE_X, SR_POT_X, SR_LED_X = 9.9, 11.6, 24.5
SR_HOLE_X, SR_HOLE_Y = 26.6, (6.8, 36.8)
SR_LENS_Y, SR_LENS_Z = (7.5, 40.5), (1.0, 14.0)
# --- posizione del sensore e giochi ---
LIP = 1.0
OFF = (LIP + 0.1, 1.7, 2.5)
CLR = 0.2
ZP = T / 2
PEGS = ((19.0, 47.2), (36.2, 24.0))

# Volumi di riferimento dagli STL (mm^3), per il controllo finale
EXPECTED_A, EXPECTED_B = 8563.0, 8484.0


def cm(v):
    return v / 10.0          # l'API di Fusion lavora in cm


def vi(v):
    return adsk.core.ValueInput.createByReal(cm(v))


class Builder:
    def __init__(self, root):
        self.root = root

    def sketch(self, name, origin, normal):
        """Sketch su un piano con origine e normale esplicite (la normale e' il verso dell'estrusione)."""
        planes = self.root.constructionPlanes
        pin = planes.createInput()
        pin.setByPlane(adsk.core.Plane.create(
            adsk.core.Point3D.create(*[cm(c) for c in origin]),
            adsk.core.Vector3D.create(*normal)))
        sk = self.root.sketches.add(planes.add(pin))
        sk.name = name
        return sk

    @staticmethod
    def pt(sk, x, y, z):
        return sk.modelToSketchSpace(adsk.core.Point3D.create(cm(x), cm(y), cm(z)))

    def extrude(self, sk, op, dist, bodies=None):
        profs = adsk.core.ObjectCollection.create()
        for p in sk.profiles:
            profs.add(p)
        feats = self.root.features.extrudeFeatures
        inp = feats.createInput(profs, op)
        inp.setDistanceExtent(False, vi(dist))
        if bodies is not None:
            inp.participantBodies = bodies
        return feats.add(inp)

    def rect_cut(self, name, origin, normal, p0, p1, dist, bodies):
        sk = self.sketch(name, origin, normal)
        sk.sketchCurves.sketchLines.addTwoPointRectangle(self.pt(sk, *p0), self.pt(sk, *p1))
        return self.extrude(sk, adsk.fusion.FeatureOperations.CutFeatureOperation, dist, bodies)

    def circles(self, name, origin, normal, centers, r, op, dist, bodies=None):
        sk = self.sketch(name, origin, normal)
        for c in centers:
            sk.sketchCurves.sketchCircles.addByCenterRadius(self.pt(sk, *c), cm(r))
        return self.extrude(sk, op, dist, bodies)


def run(context):
    app = adsk.core.Application.get()
    ui = app.userInterface
    try:
        doc = app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        design = adsk.fusion.Design.cast(app.activeProduct)
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        root = design.rootComponent
        b = Builder(root)
        NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation
        CUT = adsk.fusion.FeatureOperations.CutFeatureOperation
        JOIN = adsk.fusion.FeatureOperations.JoinFeatureOperation

        # --- i due blocchi esterni ---
        sk = b.sketch("Blocco A", (0, 0, 0), (0, 0, 1))
        sk.sketchCurves.sketchLines.addTwoPointRectangle(b.pt(sk, 0, 0, 0), b.pt(sk, W, H, 0))
        body_a = b.extrude(sk, NEW, ZP).bodies.item(0)
        body_a.name = "Meta_A"
        sk = b.sketch("Blocco B", (0, 0, ZP), (0, 0, 1))
        sk.sketchCurves.sketchLines.addTwoPointRectangle(b.pt(sk, 0, 0, ZP), b.pt(sk, W, H, ZP))
        body_b = b.extrude(sk, NEW, T - ZP).bodies.item(0)
        body_b.name = "Meta_B"
        both = [body_a, body_b]

        px0, px1 = LIP, OFF[0] + SR_X + CLR
        py0, py1 = OFF[1] + SR_Y0 - CLR, OFF[1] + SR_Y1 + CLR
        pt_ = SR_T + 0.3
        pz0 = ZP - pt_ / 2

        # --- tagli comuni alle due metà (simmetrici rispetto a z = ZP) ---
        b.rect_cut("Tasca sensore", (0, 0, pz0), (0, 0, 1), (px0, py0, pz0), (px1, py1, pz0), pt_, both)
        b.rect_cut("Finestra ottica", (-1, 0, 0), (1, 0, 0),
                   (-1, OFF[1] + SR_LENS_Y[0], OFF[2] + SR_LENS_Z[0]),
                   (-1, OFF[1] + SR_LENS_Y[1], OFF[2] + SR_LENS_Z[1]),
                   LIP + 0.5 + 1, both)
        # parte inferiore asportata sotto il sensore: cavo e manicotto liberi (resta il blocco posteriore con i fori)
        b.rect_cut("Parte inferiore", (0, 0, -1), (0, 0, 1), (-1, -1, -1), (px1, OFF[1] + SR_Y0, -1), T + 2, both)
        # accesso a potenziometro e LED dall'alto
        b.circles("Potenziometro", (0, py1 - 0.1, 0), (0, 1, 0),
                  [(OFF[0] + SR_POT_X, py1 - 0.1, ZP)], 2.8, CUT, H + 1 - (py1 - 0.1), both)
        b.circles("LED", (0, py1 - 0.1, 0), (0, 1, 0),
                  [(OFF[0] + SR_LED_X, py1 - 0.1, ZP)], 1.8, CUT, H + 1 - (py1 - 0.1), both)
        # fori di fissaggio GL10
        b.circles("Fori GL10", (0, 0, -1), (0, 0, 1), [(HOLE_X, y, -1) for y in HOLE_Y],
                  HOLE_D / 2, CUT, T + 2, both)
        # sedi dei centraggi, solo in B (prima di aggiungere i centraggi ad A)
        b.circles("Sedi centraggi", (0, 0, ZP), (0, 0, 1), [(x, y, ZP) for x, y in PEGS],
                  1.6, CUT, 3.0, [body_b])

        # --- aggiunte: centraggi su A e piolini nei fori M4 del sensore ---
        b.circles("Centraggi", (0, 0, ZP - 0.5), (0, 0, 1), [(x, y, ZP - 0.5) for x, y in PEGS],
                  1.4, JOIN, 3.0)
        pins = [(OFF[0] + SR_HOLE_X, OFF[1] + sy) for sy in SR_HOLE_Y]
        b.circles("Piolini A", (0, 0, pz0 - 0.2), (0, 0, 1), [(x, y, pz0 - 0.2) for x, y in pins],
                  1.5, JOIN, 2.6)
        zb = T - pz0 + 0.2 - 2.6          # B: stessi piolini, dalla parete in z=T-pz0 verso l'interno
        b.circles("Piolini B", (0, 0, zb), (0, 0, 1), [(x, y, zb) for x, y in pins],
                  1.5, JOIN, 2.6)

        va, vb = body_a.volume * 1000.0, body_b.volume * 1000.0   # cm^3 -> mm^3
        ok = abs(va - EXPECTED_A) / EXPECTED_A < 0.01 and abs(vb - EXPECTED_B) / EXPECTED_B < 0.01
        ui.messageBox(
            "Meta_A: %.0f mm3 (atteso ~%.0f)\nMeta_B: %.0f mm3 (atteso ~%.0f)\n\n%s" % (
                va, EXPECTED_A, vb, EXPECTED_B,
                "Volumi coerenti con gli STL." if ok else
                "ATTENZIONE: i volumi non corrispondono, controlla la timeline (verso di un'estrusione?)."))
    except Exception:
        ui.messageBox("Errore:\n" + traceback.format_exc())
