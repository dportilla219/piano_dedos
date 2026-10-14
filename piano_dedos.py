"""
Piano de dedos con la camara (10 dedos = 10 notas) para tocar Jingle Bells.

- Detecta las dos manos con el modelo preentrenado de MediaPipe (Hand Landmarker, Google).
- Modo "dedos" (por defecto): funciona con los dedos de frente a la camara. Cada dedo se mide
  respecto a su propio nudillo; cuando un dedo baja / se dobla mas que en reposo, suena su nota.
- Modo "linea": la punta de dedo MAS ABAJO de las dos manos suena al cruzar la linea del teclado.

Teclas:  Q / ESC salir | M cambiar de modo
         W / S (o flechas) modo dedos: mas / menos sensible | modo linea: subir / bajar la linea
         G mostrar / ocultar guia de la cancion | R reiniciar la cancion | N nieve on / off
"""
import argparse
import os
import time
import urllib.request

# sin esto el backend MSMF de Windows tarda mucho en abrir la camara (debe ir antes de importar cv2)
os.environ.setdefault("OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS", "0")
import cv2
import numpy as np

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
import pygame
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision

from interfaz import PianoUI

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
             "hand_landmarker/float16/latest/hand_landmarker.task")
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_landmarker.task")

# ---------------------------------------------------------------------------
# Escala de 10 notas (Sol3 .. Si4): cubre toda la melodia de Jingle Bells en Do.
# Mano izquierda (en pantalla): menique -> pulgar = notas 0..4
# Mano derecha  (en pantalla): pulgar  -> menique = notas 5..9   (como un piano)
# ---------------------------------------------------------------------------
NOTES = [  # (nombre, midi)
    ("Sol3", 55), ("La3", 57), ("Si3", 59), ("Do4", 60), ("Re4", 62),
    ("Mi4", 64), ("Fa4", 65), ("Sol4", 67), ("La4", 69), ("Si4", 71),
]
FINGER_NAMES = ["Meñique I", "Anular I", "Medio I", "Índice I", "Pulgar I",
                "Pulgar D", "Índice D", "Medio D", "Anular D", "Meñique D"]
TIPS = [4, 8, 12, 16, 20]  # indices MediaPipe: pulgar, indice, medio, anular, menique
LEFT_HAND_IDS = {20: 0, 16: 1, 12: 2, 8: 3, 4: 4}
RIGHT_HAND_IDS = {4: 5, 8: 6, 12: 7, 16: 8, 20: 9}
TIP_BASE = {4: 2, 8: 5, 12: 9, 16: 13, 20: 17}  # punta -> nudillo de referencia de ese dedo

# Jingle Bells (indices de NOTES)
G3, A3, B3, C4, D4, E4, F4, G4, A4, B4 = range(10)
VERSE_1 = [G3, E4, D4, C4, G3,  G3, E4, D4, C4, A3,  A3, F4, E4, D4, B3,  G4, G4, F4, D4, E4]
VERSE_2 = [G3, E4, D4, C4, G3,  G3, E4, D4, C4, A3,
           A3, F4, E4, D4, G4, G4, G4, G4, A4, G4, F4, D4, C4]
CHORUS_1 = [E4, E4, E4,  E4, E4, E4,  E4, G4, C4, D4, E4,
            F4, F4, F4, F4, F4, E4, E4, E4, E4, D4, D4, E4, D4, G4]
CHORUS_2 = [E4, E4, E4,  E4, E4, E4,  E4, G4, C4, D4, E4,
            F4, F4, F4, F4, F4, E4, E4, E4, G4, G4, F4, D4, C4]
SONG = VERSE_1 + CHORUS_1 + VERSE_2 + CHORUS_2

HAND_CONNECTIONS = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
                    (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15),
                    (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]

COLORS = [(66, 66, 244), (66, 160, 244), (66, 230, 244), (80, 220, 120), (230, 200, 60),
          (240, 140, 60), (220, 80, 160), (170, 80, 230), (120, 120, 240), (200, 200, 200)]


# ---------------------------------------------------------------------------
# Sonido: tonos tipo piano sintetizados con numpy (armonicos + decaimiento)
# ---------------------------------------------------------------------------
SAMPLE_RATE = 44100


def make_piano_sound(midi, seconds=1.6):
    freq = 440.0 * 2 ** ((midi - 69) / 12)
    t = np.linspace(0, seconds, int(SAMPLE_RATE * seconds), endpoint=False)
    wave = sum(a * np.sin(2 * np.pi * freq * k * t) * np.exp(-t * (2.0 + k))
               for k, a in [(1, 1.0), (2, 0.5), (3, 0.25), (4, 0.12), (5, 0.06)])
    attack = np.minimum(t / 0.005, 1.0)
    wave = wave * attack
    wave = wave / np.max(np.abs(wave)) * 0.35
    pcm = (wave * 32767).astype(np.int16)
    return pygame.sndarray.make_sound(np.column_stack([pcm, pcm]).copy(order="C"))


def init_audio():
    pygame.mixer.pre_init(SAMPLE_RATE, -16, 2, 256)
    pygame.mixer.init()
    pygame.mixer.set_num_channels(16)
    return [make_piano_sound(midi) for _, midi in NOTES]


# ---------------------------------------------------------------------------
# Modelo de manos
# ---------------------------------------------------------------------------
def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print("Descargando modelo de manos de MediaPipe...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


def create_landmarker():
    ensure_model()
    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        # umbrales mas bajos: con los dedos de frente la mano se ve "escorzada" y cuesta mas detectarla
        min_hand_detection_confidence=0.3,
        min_hand_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )
    return vision.HandLandmarker.create_from_options(options)


def get_hands(result, w, h, ox=0, oy=0):
    """Devuelve [(lado 'L'/'R', puntos en pixeles)], ordenadas de izquierda a derecha en pantalla.
    (ox, oy, w, h) = rectangulo donde se dibuja la imagen de la camara dentro de la ventana."""
    hands = [[(int(ox + p.x * w), int(oy + p.y * h)) for p in lms] for lms in result.hand_landmarks]
    hands.sort(key=lambda pts: pts[0][0])  # ordena por x de la muneca (izq -> der en pantalla)
    out = []
    for i, pts in enumerate(hands):
        if len(hands) == 2:
            is_left = i == 0
        else:  # una sola mano: decide por el lado de la pantalla
            is_left = pts[0][0] < ox + w / 2
        out.append(("L" if is_left else "R", pts))
    return out


def open_camera(index, width=1280, height=720):
    """MSMF da 30 fps a 1280x720 en esta camara; DSHOW solo 10 fps (queda como respaldo)."""
    for backend in (cv2.CAP_MSMF, cv2.CAP_DSHOW):
        cap = cv2.VideoCapture(index, backend)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            cap.set(cv2.CAP_PROP_FPS, 30)
            if cap.read()[0]:
                return cap
        cap.release()
    raise SystemExit(f"No se pudo abrir la camara {index}")


def fit_to_window(frame, win, bg=(24, 18, 15)):
    """Escala la imagen de la camara al tamano REAL de la ventana (sin deformarla) para que la
    interfaz se dibuje nitida, sin que Windows/OpenCV estire despues la imagen."""
    fh, fw = frame.shape[:2]
    try:
        _, _, ww, wh = cv2.getWindowImageRect(win)
    except cv2.error:
        ww = wh = 0
    if ww < 320 or wh < 240:  # ventana minimizada o aun sin crear
        ww, wh = fw, fh
    ww, wh = min(ww, 2560), min(wh, 1600)
    k = min(ww / fw, wh / fh)
    sw, sh = int(fw * k), int(fh * k)
    ox, oy = (ww - sw) // 2, (wh - sh) // 2
    if (sw, sh) == (fw, fh) == (ww, wh):
        return frame, (0, 0, fw, fh)
    canvas = np.empty((wh, ww, 3), np.uint8)
    canvas[:] = bg
    canvas[oy:oy + sh, ox:ox + sw] = cv2.resize(
        frame, (sw, sh), interpolation=cv2.INTER_LINEAR if k > 1 else cv2.INTER_AREA)
    return canvas, (ox, oy, sw, sh)


def get_fingertips(hands):
    """Lista de puntas [(id_dedo, x, y)]."""
    tips = []
    for side, pts in hands:
        ids = LEFT_HAND_IDS if side == "L" else RIGHT_HAND_IDS
        for tip in TIPS:
            tips.append((ids[tip], pts[tip][0], pts[tip][1]))
    return tips


# ---------------------------------------------------------------------------
# Deteccion de pulsacion por dedo (independiente de la postura de la mano)
# ---------------------------------------------------------------------------
class FingerPressDetector:
    """Cada dedo se mide como "cuanto esta la punta por debajo de su nudillo", dividido por el
    ancho de los nudillos (indice-menique) para que no dependa de la distancia a la camara.
    Se compara con su valor en reposo (que se va aprendiendo solo); si lo supera en `thr`,
    el dedo esta pulsado. Por mano solo puede entrar el dedo que mas ha bajado (los dedos
    vecinos se mueven un poco a la vez y si no darian notas falsas)."""

    def __init__(self, thr=0.30, confirm_frames=2):
        self.thr = thr
        self.confirm_frames = confirm_frames
        self.base = {}      # id_dedo -> valor en reposo
        self.count = {}     # id_dedo -> frames seguidos cumpliendo la condicion
        self.down = set()   # dedos pulsados ahora
        self.deltas = {}    # id_dedo -> cuanto ha bajado respecto al reposo (para dibujar)

    def reset(self):
        self.base.clear()
        self.count.clear()
        self.down.clear()
        self.deltas.clear()

    def update(self, hands):
        """Recibe [(lado, puntos)] y devuelve la lista de dedos que ACABAN de pulsarse."""
        hits = []
        self.deltas = {}
        seen = set()
        for side, pts in hands:
            ids = LEFT_HAND_IDS if side == "L" else RIGHT_HAND_IDS
            scale = max(float(np.hypot(pts[5][0] - pts[17][0], pts[5][1] - pts[17][1])), 1.0)
            drops = {ids[tip]: (pts[tip][1] - pts[base][1]) / scale for tip, base in TIP_BASE.items()}
            for fid, d in drops.items():
                self.deltas[fid] = d - self.base.setdefault(fid, d)
            seen.update(drops)

            best = max(drops, key=lambda f: self.deltas[f])
            for fid in drops:
                delta = self.deltas[fid]
                if fid in self.down:
                    if delta < self.thr * 0.5:          # histeresis: suelta la tecla
                        self.down.discard(fid)
                elif fid == best and delta > self.thr:
                    self.count[fid] = self.count.get(fid, 0) + 1
                    if self.count[fid] >= self.confirm_frames:
                        self.down.add(fid)
                        hits.append(fid)
                    continue
                self.count[fid] = 0

                # el reposo se adapta rapido con el dedo suelto y muy lento si esta pulsado
                alpha = 0.04 if fid not in self.down else 0.005
                self.base[fid] += alpha * (drops[fid] - self.base[fid])

        # mano que desaparece: olvida su calibracion
        for fid in list(self.base):
            if fid not in seen:
                self.base.pop(fid)
                self.count.pop(fid, None)
                self.down.discard(fid)
        return hits


# ---------------------------------------------------------------------------
# Bucle principal
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Piano de 10 dedos con la camara")
    parser.add_argument("--camara", type=int, default=0, help="indice de la camara (0 por defecto)")
    parser.add_argument("--linea", type=float, default=0.55,
                        help="altura inicial de la linea del teclado (0=arriba, 1=abajo)")
    parser.add_argument("--modo", choices=["dedos", "linea"], default="dedos",
                        help="dedos: cada dedo se detecta respecto a su mano (dedos de frente); "
                             "linea: suena el dedo mas bajo al cruzar la linea")
    parser.add_argument("--sensibilidad", type=float, default=0.30,
                        help="modo dedos: cuanto debe bajar un dedo (en anchos de nudillos) para sonar; "
                             "menor = mas sensible")
    args = parser.parse_args()

    sounds = init_audio()
    landmarker = create_landmarker()

    cap = open_camera(args.camara)

    win = "Piano de dedos - Jingle Bells"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1280, 720)
    ui = PianoUI(NOTES, FINGER_NAMES, COLORS, {"L": LEFT_HAND_IDS, "R": RIGHT_HAND_IDS}, "Jingle Bells")

    mode = args.modo
    detector = FingerPressDetector(thr=args.sensibilidad)
    line_frac = args.linea
    hysteresis = 15        # pixeles que el dedo debe subir sobre la linea para "soltar" la tecla
    confirm_frames = 2     # frames seguidos que se exige al candidato (evita notas falsas)
    active = None          # dedo cuya nota esta sonando
    candidate, cand_count = None, 0
    show_guide, song_pos = True, 0
    last_ts = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)  # efecto espejo: mas natural para tocar

        ts = max(int(time.monotonic() * 1000), last_ts + 1)
        last_ts = ts
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)

        # a partir de aqui todo se dibuja sobre un lienzo del tamano de la ventana
        frame, (ox, oy, sw, sh) = fit_to_window(frame, win)
        line_y = oy + int(sh * line_frac)
        hands = get_hands(result, sw, sh, ox, oy)
        tips = get_fingertips(hands)
        lowest = max(tips, key=lambda t: t[2]) if tips else None

        if mode == "dedos":
            # --- 1-2) cada dedo respecto a su propia mano ---
            hits = detector.update(hands)
            active_set = detector.down
        else:
            # --- 1) dedo mas bajo de las dos manos (mayor y en la imagen) ---
            pressed = lowest[0] if lowest and lowest[2] > line_y else None

            # --- 2) disparo de notas con confirmacion e histeresis ---
            hits = []
            if pressed is not None:
                cand_count = cand_count + 1 if pressed == candidate else 1
                candidate = pressed
                if pressed != active and cand_count >= confirm_frames:
                    hits.append(pressed)
                    active = pressed
            else:
                candidate, cand_count = None, 0
                if active is not None:
                    tip = next((t for t in tips if t[0] == active), None)
                    if tip is None or tip[2] < line_y - hysteresis or (lowest and lowest[0] != active):
                        active = None  # tecla soltada: el mismo dedo puede volver a sonar
            active_set = {active} if active is not None else set()

        for fid in hits:
            sounds[fid].play()
            guided = show_guide and song_pos < len(SONG)   # cuenta para racha / precision
            correct = song_pos < len(SONG) and SONG[song_pos] == fid
            if correct:
                song_pos += 1
            tip = next(((x, y) for f, x, y in tips if f == fid), None)
            ui.note_hit(fid, tip, correct, guided)

        # --- 3) dibujo ---
        target = SONG[song_pos] if show_guide and song_pos < len(SONG) else None
        ui.render(frame, hands=hands, tips=tips, active=active_set, target=target, mode=mode,
                  thr=detector.thr, deltas=detector.deltas, lowest=lowest, line_y=line_y,
                  song=SONG, song_pos=song_pos, show_guide=show_guide, connections=HAND_CONNECTIONS)

        cv2.imshow(win, frame)
        key = cv2.waitKeyEx(1)
        if key in (ord("q"), ord("Q"), 27):
            break
        if key in (ord("w"), ord("W"), 2490368):      # flecha arriba
            if mode == "dedos":
                detector.thr = max(0.10, detector.thr - 0.05)
            else:
                line_frac = max(0.1, line_frac - 0.02)
        elif key in (ord("s"), ord("S"), 2621440):    # flecha abajo
            if mode == "dedos":
                detector.thr = min(1.00, detector.thr + 0.05)
            else:
                line_frac = min(0.85, line_frac + 0.02)
        elif key in (ord("m"), ord("M")):
            mode = "linea" if mode == "dedos" else "dedos"
            detector.reset()
            active, candidate, cand_count = None, None, 0
        elif key in (ord("g"), ord("G")):
            show_guide = not show_guide
        elif key in (ord("r"), ord("R")):
            song_pos = 0
            ui.reset_song()
        elif key in (ord("n"), ord("N")):
            ui.snow_on = not ui.snow_on
        if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
            break

    cap.release()
    cv2.destroyAllWindows()
    landmarker.close()
    pygame.mixer.quit()


if __name__ == "__main__":
    main()
