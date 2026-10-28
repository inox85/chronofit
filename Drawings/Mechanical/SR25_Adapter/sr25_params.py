"""Quote del guscio adattatore SR25C -> GL10 (mm), condivise dai generatori STL e STEP."""
import numpy as np

# --- GL10: ingombro e fori di fissaggio (datasheet SICK, pagina 6) ---
W, H, T = 39.3, 50.0, 20.0           # profondità (con orecchie), altezza, spessore
HOLE_X = 34.7                        # dal fronte ottico al centro dei fori
HOLE_Y = (6.4, 42.4)                 # 6,4 dal fondo, interasse 36
HOLE_D = 4.2

# --- SR25C (STEP): ingombro e particolari, nel suo sistema di riferimento ---
SR_X, SR_Y0, SR_Y1, SR_T = 29.9, 0.5, 42.5, 15.2   # profondità, y fondo/cima, spessore (z -0,1..15,1)
SR_CABLE_X = 9.9                     # uscita cavo dal fondo, centrata nello spessore
SR_POT_X, SR_LED_X = 11.6, 24.5      # potenziometro e LED sul lato superiore
SR_HOLE_X, SR_HOLE_Y = 26.6, (6.8, 36.8)   # fori M4 del sensore, passanti nello spessore
SR_LENS_Y, SR_LENS_Z = (7.5, 40.5), (1.0, 14.0)

# --- posizione del sensore nel guscio e giochi ---
LIP = 1.0                            # spessore della parete frontale (finestra a parte)
OFF = np.array([LIP + 0.1, 1.7, 2.5])  # sensore -> guscio (0,1 mm di gioco davanti)
CLR = 0.2                            # gioco della tasca attorno al sensore
ZP = T / 2                           # piano di divisione

PEGS = ((36.2, 16.0), (36.2, 33.0))   # centraggi A / sedi B
