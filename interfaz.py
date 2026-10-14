"""
Interfaz grafica del piano de dedos.

- Texto con las fuentes de Windows (Segoe UI) via Pillow, con tildes y sombra.
- Paneles translucidos con esquinas redondeadas, teclado con relieve y brillo al pulsar.
- Guia tipo "Synthesia": las proximas notas bajan hacia su tecla.
- Efectos: onda, chispas y nombre de la nota al tocar; confeti al terminar; nieve opcional.

Todo se dibuja directamente sobre el frame de OpenCV (BGR, uint8).
"""
import math
import os
import random
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Paleta (BGR)
# ---------------------------------------------------------------------------
PANEL = (34, 26, 22)        # fondo de paneles (azul noche)
BORDER = (90, 78, 70)
CHIP = (62, 52, 46)
TRACK = (88, 78, 70)
TEXT = (246, 242, 238)
MUTED = (175, 165, 158)
ACCENT = (130, 225, 140)    # verde: siguiente nota de la guia
GOLD = (70, 195, 255)
RED = (90, 90, 240)         # cerrar la aplicacion
DARK_TEXT = (48, 40, 36)

TIP_IDS = {4, 8, 12, 16, 20}

FONT_DIR = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
FONT_FILES = {
    "regular": ["segoeui.ttf", "arial.ttf"],
    "semibold": ["seguisb.ttf", "arialbd.ttf"],
    "bold": ["segoeuib.ttf", "arialbd.ttf"],
}


def _mix(c1, c2, t):
    return tuple(int(a * (1 - t) + b * t) for a, b in zip(c1, c2))


def _ease_out(p):
    return 1 - (1 - p) ** 3


# ---------------------------------------------------------------------------
# Primitivas de dibujo
# ---------------------------------------------------------------------------
def rounded_rect(img, x0, y0, x1, y1, r, color, thickness=-1):
    r = int(max(0, min(r, (x1 - x0) // 2, (y1 - y0) // 2)))
    if r == 0:
        cv2.rectangle(img, (x0, y0), (x1, y1), color, thickness)
        return
    if thickness < 0:
        cv2.rectangle(img, (x0 + r, y0), (x1 - r, y1), color, -1)
        cv2.rectangle(img, (x0, y0 + r), (x1, y1 - r), color, -1)
        for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
            cv2.circle(img, (cx, cy), r, color, -1, cv2.LINE_AA)
    else:
        t = thickness
        cv2.line(img, (x0 + r, y0), (x1 - r, y0), color, t, cv2.LINE_AA)
        cv2.line(img, (x0 + r, y1), (x1 - r, y1), color, t, cv2.LINE_AA)
        cv2.line(img, (x0, y0 + r), (x0, y1 - r), color, t, cv2.LINE_AA)
        cv2.line(img, (x1, y0 + r), (x1, y1 - r), color, t, cv2.LINE_AA)
        cv2.ellipse(img, (x0 + r, y0 + r), (r, r), 180, 0, 90, color, t, cv2.LINE_AA)
        cv2.ellipse(img, (x1 - r, y0 + r), (r, r), 270, 0, 90, color, t, cv2.LINE_AA)
        cv2.ellipse(img, (x1 - r, y1 - r), (r, r), 0, 0, 90, color, t, cv2.LINE_AA)
        cv2.ellipse(img, (x0 + r, y1 - r), (r, r), 90, 0, 90, color, t, cv2.LINE_AA)


def _clip(img, x0, y0, x1, y1):
    h, w = img.shape[:2]
    return max(int(x0), 0), max(int(y0), 0), min(int(x1), w), min(int(y1), h)


def panel(img, x0, y0, x1, y1, r, color=PANEL, alpha=0.62, border=BORDER):
    """Rectangulo redondeado translucido (tipo cristal oscuro)."""
    cx0, cy0, cx1, cy1 = _clip(img, x0, y0, x1, y1)
    if cx0 >= cx1 or cy0 >= cy1:
        return
    roi = img[cy0:cy1, cx0:cx1]
    over = roi.copy()
    rounded_rect(over, x0 - cx0, y0 - cy0, x1 - cx0 - 1, y1 - cy0 - 1, r, color)
    roi[:] = cv2.addWeighted(over, alpha, roi, 1 - alpha, 0)
    if border is not None:
        rounded_rect(img, x0, y0, x1 - 1, y1 - 1, r, border, 1)


_GLOW_CACHE = {}


def _add_sprite(img, sprite, x, y, strength):
    """Suma (luz) un sprite en (x, y) recortandolo a los bordes de la imagen."""
    h, w = sprite.shape[:2]
    x0, y0, x1, y1 = _clip(img, x, y, x + w, y + h)
    if x0 >= x1 or y0 >= y1 or strength <= 0:
        return
    roi = img[y0:y1, x0:x1]
    roi[:] = cv2.addWeighted(roi, 1.0, sprite[y0 - y:y1 - y, x0 - x:x1 - x], strength, 0)


def glow(img, center, radius, color, strength=0.8):
    """Halo de luz aditivo alrededor de un punto (el desenfoque se calcula una sola vez)."""
    radius = int(radius)
    key = ("c", radius, color)
    spr = _GLOW_CACHE.get(key)
    if spr is None:
        if len(_GLOW_CACHE) > 200:  # al redimensionar la ventana cambian los tamanos
            _GLOW_CACHE.clear()
        R = radius * 3
        spr = np.zeros((2 * R, 2 * R, 3), np.uint8)
        cv2.circle(spr, (R, R), radius, color, -1, cv2.LINE_AA)
        spr = _GLOW_CACHE[key] = cv2.GaussianBlur(spr, (0, 0), max(radius * 0.6, 1))
    _add_sprite(img, spr, center[0] - radius * 3, center[1] - radius * 3, strength)


def glow_rect(img, x0, y0, x1, y1, r, color, strength=0.8, spread=18):
    key = ("r", x1 - x0, y1 - y0, r, color, spread)
    spr = _GLOW_CACHE.get(key)
    if spr is None:
        if len(_GLOW_CACHE) > 200:
            _GLOW_CACHE.clear()
        p = spread * 3
        spr = np.zeros((y1 - y0 + 2 * p, x1 - x0 + 2 * p, 3), np.uint8)
        rounded_rect(spr, p, p, p + x1 - x0, p + y1 - y0, r, color)
        spr = _GLOW_CACHE[key] = cv2.GaussianBlur(spr, (0, 0), spread)
    _add_sprite(img, spr, x0 - spread * 3, y0 - spread * 3, strength)


def circle_alpha(img, center, radius, color, thickness, alpha):
    x, y = center
    R = int(radius + thickness + 2)
    x0, y0, x1, y1 = _clip(img, x - R, y - R, x + R, y + R)
    if x0 >= x1 or y0 >= y1 or alpha <= 0:
        return
    roi = img[y0:y1, x0:x1]
    over = roi.copy()
    cv2.circle(over, (x - x0, y - y0), int(radius), color, int(thickness), cv2.LINE_AA)
    roi[:] = cv2.addWeighted(over, alpha, roi, 1 - alpha, 0)


def _blend_mask(img, mask, x, y, color, alpha=1.0):
    h, w = mask.shape
    x0, y0, x1, y1 = _clip(img, x, y, x + w, y + h)
    if x0 >= x1 or y0 >= y1:
        return
    m = mask[y0 - y:y1 - y, x0 - x:x1 - x]
    if alpha != 1.0:
        m = m * np.float32(alpha)
    roi = img[y0:y1, x0:x1]
    solid = np.empty_like(roi)
    solid[:] = color
    roi[:] = cv2.blendLinear(solid, roi, m, 1.0 - m)


# ---------------------------------------------------------------------------
# Texto con fuentes TrueType (cacheado: cada texto se rasteriza una sola vez)
# ---------------------------------------------------------------------------
class Fonts:
    def __init__(self):
        self._fonts = {}
        self._cache = {}

    def _font(self, size, weight):
        key = (size, weight)
        if key not in self._fonts:
            font = None
            for name in FONT_FILES[weight]:
                path = os.path.join(FONT_DIR, name)
                if os.path.exists(path):
                    font = ImageFont.truetype(path, size)
                    break
            self._fonts[key] = font or ImageFont.load_default()
        return self._fonts[key]

    def sprite(self, text, size, weight):
        """(mascara alfa, y de la parte alta de mayusculas, y del centro, y de la linea base)."""
        key = (text, size, weight)
        spr = self._cache.get(key)
        if spr is None:
            font = self._font(size, weight)
            left, _, right, _ = font.getbbox(text)
            ascent, descent = font.getmetrics()
            im = Image.new("L", (max(right - left, 1) + 2, ascent + descent + 2), 0)
            ImageDraw.Draw(im).text((1 - left, 1), text, font=font, fill=255)
            cap_top = font.getbbox("H")[1] + 1
            spr = (np.asarray(im, np.float32) / 255.0, cap_top, (cap_top + ascent + 1) // 2, ascent + 1)
            if len(self._cache) > 3000:
                self._cache.clear()
            self._cache[key] = spr
        return spr

    def width(self, text, size, weight="regular"):
        return self.sprite(text, size, weight)[0].shape[1]

    def draw(self, img, text, x, y, size, color=TEXT, weight="regular", anchor="lt",
             shadow=True, alpha=1.0):
        """anchor = horizontal (l/c/r) + vertical (t = alto de mayusculas, m = centro, b = linea base)."""
        mask, cap_top, mid, base = self.sprite(text, size, weight)
        w = mask.shape[1]
        if anchor[0] == "c":
            x -= w // 2
        elif anchor[0] == "r":
            x -= w
        y -= {"t": cap_top, "m": mid, "b": base}[anchor[1]]
        x, y = int(x), int(y)
        if shadow:
            _blend_mask(img, mask, x + 1, y + 2, (0, 0, 0), 0.55 * alpha)
        _blend_mask(img, mask, x, y, color, alpha)
        return w


# ---------------------------------------------------------------------------
# Interfaz completa
# ---------------------------------------------------------------------------
PALM_BONES = {(0, 1), (0, 5), (5, 9), (9, 13), (13, 17), (0, 17)}
CONFETTI_COLORS = [(66, 66, 244), (66, 200, 255), (80, 220, 120), (240, 160, 60), (220, 80, 160),
                   (255, 255, 255), (70, 195, 255)]


class PianoUI:
    def __init__(self, notes, finger_names, colors, hand_ids, song_title="Jingle Bells"):
        self.notes = notes
        self.finger_names = finger_names
        self.colors = colors
        self.hand_ids = hand_ids   # {"L": {punta: id_dedo}, "R": {punta: id_dedo}}
        self.song_title = song_title
        self.fonts = Fonts()
        self.snow_on = True
        self.effects = []      # (t0, x, y, color, texto, acierto)
        self.particles = []    # [x, y, vx, vy, vida, vida_max, color, radio]
        self.confetti = []     # [x, y, vx, vy, angulo, giro, color, tam]
        self.snow = None
        self.key_flash = {}    # id_dedo -> instante de la ultima pulsacion
        self._key_sprites = {}
        self._beam = {}
        self._shade = {}
        self._press = [0.0] * len(notes)   # animacion de hundido de cada tecla (0..1)
        self._key_centers = {}
        self._last_pos = None
        self._s = 1.0
        self._car = None             # posicion animada del carrusel
        self._car_goal = None
        self._arrow = (-10.0, 0)     # (instante, direccion) del ultimo cambio de cancion
        self._picked_t = -10.0       # instante en que se eligio una cancion (pulso de la tarjeta)
        self._fps = 0.0
        self._last = time.monotonic()
        self.reset_song()

    def set_keys(self, notes):
        """Cambia el teclado (10 teclas (nombre, midi)): cada cancion usa el suyo."""
        self.notes = notes

    def reset_song(self):
        self.ok = self.fail = self.streak = self.best = 0
        self.t_start = self.t_end = None
        self._streak_t = -10.0
        self._lane_off = 0.0
        self._last_pos = None
        self.confetti = []
        self.new_record = False

    def precision(self):
        """Porcentaje de aciertos con la guia activa (None si aun no se ha tocado nada)."""
        total = self.ok + self.fail
        return round(100 * self.ok / total) if total else None

    # --- eventos -----------------------------------------------------------
    def note_hit(self, fid, pos, correct, guided=True):
        """guided = la guia esta activa y la cancion no ha terminado (cuenta para las estadisticas)."""
        now = time.monotonic()
        self.key_flash[fid] = now
        if guided:
            if self.t_start is None:
                self.t_start = now
            if correct:
                self.ok += 1
                self.streak += 1
                self.best = max(self.best, self.streak)
                self._streak_t = now
            else:
                self.fail += 1
                self.streak = 0
        color = self.colors[fid]
        if pos is not None:
            self.effects.append((now, pos[0], pos[1], color, self.notes[fid][0], correct and guided))
            self._burst(pos[0], pos[1], color, 16, up=False)
        kc = self._key_centers.get(fid)
        if kc is not None:
            self._burst(kc[0], kc[1], color, 10, up=True)

    def _burst(self, x, y, color, n, up):
        s = self._s
        for _ in range(n):
            if up:
                a, v = -math.pi / 2 + random.uniform(-0.6, 0.6), random.uniform(180, 380) * s
            else:
                a, v = random.uniform(0, 2 * math.pi), random.uniform(120, 300) * s
            life = random.uniform(0.45, 0.8)
            self.particles.append([x, y, math.cos(a) * v, math.sin(a) * v, life, life,
                                   _mix(color, (255, 255, 255), random.uniform(0.1, 0.6)),
                                   random.uniform(2.5, 4.5) * s])
        del self.particles[:-400]

    # --- dibujo principal ----------------------------------------------------
    def _tick(self):
        now = time.monotonic()
        dt = min(max(now - self._last, 1e-3), 0.1)
        self._last = now
        self._fps = 0.9 * self._fps + 0.1 / dt if self._fps else 1.0 / dt
        return now, dt

    def render(self, img, *, hands, tips, active, target, mode, thr, deltas, lowest,
               line_y, song, song_pos, show_guide, connections, countdown=None, fist=None):
        """countdown = segundos que faltan para empezar (o None).
        fist = (progreso 0..1, punto en pantalla) para el anillo del puno al terminar (o None)."""
        now, dt = self._tick()
        h, w = img.shape[:2]
        s = self._s = min(w / 1280, h / 720)
        kb = self._kb_layout(w, h, s)
        self._key_centers = {i: (x + kb["key_w"] // 2, kb["ky"]) for i, x in enumerate(kb["xs"])}
        self._update_song(song, song_pos, now, dt, w, h, s)

        self._shade_edges(img, s)
        if self.snow_on:
            self._draw_snow(img, s, now, dt)
        if mode == "linea":
            self._draw_line(img, s, line_y)
        if show_guide and song_pos < len(song):
            self._draw_lane(img, s, kb, song, song_pos, now)
        self._draw_hands(img, s, hands, connections)
        self._draw_tips(img, s, tips, active, target, mode, thr, deltas, lowest, now)
        self._draw_effects(img, s, now)
        self._draw_particles(img, dt)

        self._draw_status(img, s, mode, thr, {side for side, _ in hands})
        if show_guide:
            self._draw_guide(img, s, song, song_pos, now)
        self._draw_keyboard(img, s, kb, active, target, now, dt)
        celebrating = self.t_end is not None and now - self.t_end < 6.5
        if not hands and not celebrating and countdown is None:
            self._draw_no_hands(img, s)
        self._draw_celebration(img, s, now, dt)
        if countdown is not None:
            self._draw_countdown(img, s, countdown, bool(hands))
        if fist is not None and fist[1] is not None:
            self._draw_fist_ring(img, s, fist[1], fist[0],
                                 "Pulgar ↑ repetir  ·  Puño: otra canción  ·  Pulgar ↓ salir", fist[2])

    def _update_song(self, song, pos, now, dt, w, h, s):
        if self._last_pos is not None:
            if pos == self._last_pos + 1:
                self._lane_off += 1.0          # las notas de la guia bajan una posicion
            elif pos < self._last_pos:
                self._lane_off = 0.0
            if pos >= len(song) > self._last_pos:
                self.t_end = now
                self._spawn_confetti(w, h, s)
        self._last_pos = pos
        self._lane_off -= self._lane_off * min(1.0, dt * 10)

    def _kb_layout(self, w, h, s):
        n = len(self.notes)
        m = int(16 * s)
        pad = int(10 * s) + 2
        gap = max(3, int(6 * s))
        hand_gap = int(26 * s)
        kb_h = int(118 * s)
        top = h - m - kb_h
        kx0, kx1 = m + pad, w - m - pad
        key_w = (kx1 - kx0 - (n - 2) * gap - hand_gap) // n
        xs = [kx0 + i * (key_w + gap) + (hand_gap - gap if i >= n // 2 else 0) for i in range(n)]
        return dict(m=m, pad=pad, top=top, kb_h=kb_h, xs=xs, key_w=key_w, ky=top + pad,
                    key_h=kb_h - 2 * pad, r=int(10 * s) + 2, sh=max(2, int(4 * s)))

    # --- fondo ----------------------------------------------------------------
    def _shade_edges(self, img, s):
        """Oscurece arriba y abajo para que se lean los paneles."""
        h, w = img.shape[:2]
        key = (h, w)
        if key not in self._shade:
            if len(self._shade) > 4:
                self._shade.clear()
            top = int(190 * s)
            bot = int(230 * s)
            # factores 0..255 ya expandidos a la imagen: cv2.multiply en uint8 es muy rapido
            ft = np.repeat(np.linspace(115, 255, top)[:, None], w, axis=1).astype(np.uint8)
            fb = np.repeat(np.linspace(255, 115, bot)[:, None], w, axis=1).astype(np.uint8)
            self._shade[key] = (top, cv2.merge([ft] * 3), bot, cv2.merge([fb] * 3))
        top, ft, bot, fb = self._shade[key]
        img[:top] = cv2.multiply(img[:top], ft, scale=1 / 255)
        img[h - bot:] = cv2.multiply(img[h - bot:], fb, scale=1 / 255)

    def _draw_snow(self, img, s, now, dt):
        h, w = img.shape[:2]
        if self.snow is None:
            rng = np.random.default_rng()
            n = 90  # columnas: x, y (0..1), tamano, velocidad, fase del vaiven
            self.snow = np.column_stack([rng.random(n), rng.random(n), rng.uniform(0.8, 2.6, n),
                                         rng.uniform(0.03, 0.08, n), rng.uniform(0, 2 * np.pi, n)])
        sn = self.snow
        sn[:, 1] += sn[:, 3] * dt * (0.6 + 0.25 * sn[:, 2])   # los copos grandes caen mas rapido
        wrap = sn[:, 1] > 1.02
        sn[wrap, 1] = -0.02
        sn[wrap, 0] = np.random.random(int(wrap.sum()))
        xs = ((sn[:, 0] + 0.012 * np.sin(now * 0.8 + sn[:, 4])) * w).astype(int)
        ys = (sn[:, 1] * h).astype(int)
        for x, y, r in zip(xs, ys, sn[:, 2]):
            cv2.circle(img, (int(x), int(y)), max(1, int(round(r * s))),
                       (250, 248, 245) if r > 1.6 else (210, 205, 200), -1, cv2.LINE_AA)

    # --- guia tipo "Synthesia": las proximas notas bajan hacia su tecla -----------
    def _draw_lane(self, img, s, kb, song, pos, now):
        slot_h = int(28 * s) + 2
        slot = slot_h + int(7 * s)
        n_show = 5
        base = kb["top"] - int(12 * s)
        key_w = kb["key_w"]
        inset = int(key_w * 0.14)
        beam_h = n_show * slot + int(20 * s)
        self._draw_beam(img, kb["xs"][song[pos]], base - beam_h, key_w, beam_h,
                        0.32 + 0.1 * math.sin(now * 5))

        upcoming = song[pos:pos + n_show + 1]
        for k in range(len(upcoming) - 1, -1, -1):   # de arriba a abajo: la siguiente queda encima
            n = upcoming[k]
            yb = int(base - (k + self._lane_off) * slot)
            yt = yb - slot_h
            fade = 1.0 - k / (n_show + 0.5)
            if fade <= 0 or yt < 0:
                continue
            x0, x1 = kb["xs"][n] + inset, kb["xs"][n] + key_w - inset
            panel(img, x0, yt, x1, yb, slot_h // 2, self.colors[n],
                  0.92 if k == 0 else 0.2 + 0.5 * fade, border=None)
            if k == 0:
                rounded_rect(img, x0 - 2, yt - 2, x1 + 1, yb + 1, slot_h // 2 + 2, (255, 255, 255),
                             max(2, int(2 * s)))
            self.fonts.draw(img, self.notes[n][0], (x0 + x1) // 2, (yt + yb) // 2, int(14 * s) + 2,
                            (255, 255, 255), "bold" if k == 0 else "semibold", "cm",
                            alpha=1.0 if k == 0 else 0.3 + 0.6 * fade)

    def _draw_beam(self, img, x, y, w, h, strength):
        key = (w, h)
        spr = self._beam.get(key)
        if spr is None:
            if len(self._beam) > 20:
                self._beam.clear()
            t = np.linspace(0, 1, h, dtype=np.float32)[:, None] ** 1.6     # mas intenso abajo
            xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
            prof = np.clip(1 - xx ** 2, 0, 1) ** 0.7                       # mas intenso al centro
            spr = ((t * prof)[..., None] * np.array(ACCENT, np.float32)).astype(np.uint8)
            self._beam[key] = spr
        _add_sprite(img, spr, x, y, strength)

    # --- manos ---------------------------------------------------------------
    def _draw_hands(self, img, s, hands, connections):
        if not hands:
            return
        pts_all = np.array([p for _, pts in hands for p in pts])
        pad = int(30 * s)
        x0, y0, x1, y1 = _clip(img, pts_all[:, 0].min() - pad, pts_all[:, 1].min() - pad,
                               pts_all[:, 0].max() + pad, pts_all[:, 1].max() + pad)
        if x0 >= x1 or y0 >= y1:
            return
        roi = img[y0:y1, x0:x1]
        layer = roi.copy()
        th = max(2, int(3 * s))
        for side, pts in hands:
            ids = self.hand_ids[side]
            loc = [(x - x0, y - y0) for x, y in pts]
            for a, b in connections:
                if (a, b) in PALM_BONES:
                    col = (255, 255, 255)
                else:  # cada dedo con el color de su nota
                    col = _mix(self.colors[ids[((b - 1) // 4 + 1) * 4]], (255, 255, 255), 0.25)
                cv2.line(layer, loc[a], loc[b], col, th, cv2.LINE_AA)
            for i, p in enumerate(loc):
                if i not in TIP_IDS:
                    cv2.circle(layer, p, max(3, int(4 * s)), (255, 255, 255), -1, cv2.LINE_AA)
        roi[:] = cv2.addWeighted(layer, 0.6, roi, 0.4, 0)

    def _draw_tips(self, img, s, tips, active, target, mode, thr, deltas, lowest, now):
        for fid, x, y in tips:
            color = self.colors[fid]
            pressed = fid in active
            r = int((15 if pressed else 10) * s) + 1
            if mode == "linea" and lowest and fid == lowest[0] and not pressed:
                r = int(13 * s) + 1
            if pressed:
                glow(img, (x, y), int(30 * s), color, 0.9)
            cv2.circle(img, (x, y), r + max(2, int(3 * s)), (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(img, (x, y), r, color, -1, cv2.LINE_AA)

            if mode == "dedos":
                # anillo que se va llenando segun cuanto ha bajado el dedo
                level = min(max(deltas.get(fid, 0.0) / thr, 0.0), 1.0)
                ring = r + int(8 * s)
                circle_alpha(img, (x, y), ring, (40, 40, 40), max(2, int(3 * s)), 0.45)
                if level > 0.02:
                    cv2.ellipse(img, (x, y), (ring, ring), -90, 0, int(360 * level),
                                color if not pressed else (255, 255, 255), max(2, int(3 * s)), cv2.LINE_AA)

            if fid == target:
                pulse = 0.5 + 0.5 * math.sin(now * 7)
                rad = r + int((16 + 4 * pulse) * s)
                circle_alpha(img, (x, y), rad, ACCENT, max(2, int(3 * s)), 0.6 + 0.4 * pulse)

            # nombre de la nota solo en el dedo pulsado y en el que toca (si no, se pisan)
            if pressed or fid == target:
                self.fonts.draw(img, self.notes[fid][0], x, y - r - int(16 * s), int(17 * s) + 2,
                                ACCENT if fid == target and not pressed else TEXT, "semibold", "cb")

    # --- efectos -------------------------------------------------------------
    def _draw_effects(self, img, s, now):
        alive = []
        for eff in self.effects:
            t0, x, y, color, text, correct = eff
            age = now - t0
            if age > 0.9:
                continue
            alive.append(eff)
            p = min(age / 0.55, 1.0)
            if p < 1:
                rad = int((18 + 60 * _ease_out(p)) * s)
                circle_alpha(img, (x, y), rad, ACCENT if correct else color,
                             max(1, int((5 * (1 - p) + 1) * s)), 0.9 * (1 - p))
            q = age / 0.9
            self.fonts.draw(img, text, x, y - int((48 + 60 * _ease_out(q)) * s), int(30 * s) + 2,
                            ACCENT if correct else _mix(color, (255, 255, 255), 0.35), "bold", "cb",
                            alpha=1 - q * q)
        self.effects = alive

    def _draw_particles(self, img, dt):
        g = 520 * self._s
        alive = []
        for p in self.particles:
            p[4] -= dt
            if p[4] <= 0:
                continue
            p[3] += g * dt
            p[2] *= 1 - 1.5 * dt
            p[0] += p[2] * dt
            p[1] += p[3] * dt
            cv2.circle(img, (int(p[0]), int(p[1])), max(1, int(p[7] * p[4] / p[5])), p[6], -1, cv2.LINE_AA)
            alive.append(p)
        self.particles = alive

    def _spawn_confetti(self, w, h, s):
        rnd = random.random
        self.confetti = [[rnd() * w, -rnd() * h * 0.6, (rnd() - 0.5) * 120 * s, (150 + rnd() * 170) * s,
                          rnd() * 6.28, (rnd() - 0.5) * 10, random.choice(CONFETTI_COLORS), (5 + rnd() * 5) * s]
                         for _ in range(170)]

    def _draw_celebration(self, img, s, now, dt):
        if self.t_end is None:
            return
        h, w = img.shape[:2]
        alive = []
        for c in self.confetti:
            c[0] += (c[2] + 40 * s * math.sin(now * 2 + c[4])) * dt   # vaiven al caer
            c[1] += c[3] * dt
            c[4] += c[5] * dt
            if c[1] > h + 20:
                continue
            alive.append(c)
            ca, sa = math.cos(c[4]), math.sin(c[4])
            hw, hh = c[7], max(1.0, c[7] * 0.5 * abs(math.sin(c[4] * 1.7)))   # "gira" en 3D
            pts = np.array([(c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca)
                            for dx, dy in ((-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh))], np.int32)
            cv2.fillPoly(img, [pts], c[6], cv2.LINE_AA)
        self.confetti = alive

        age = now - self.t_end
        if age >= 6.5:
            return
        k = min(age / 0.35, 1.0, (6.5 - age) / 0.5)
        total = self.ok + self.fail
        prec = f"{round(100 * self.ok / total)} %" if total else "—"
        secs = int(self.t_end - self.t_start) if self.t_start else 0
        t1 = "¡Nuevo récord!" if self.new_record else "¡Canción completa!"
        t2 = f"Precisión {prec}   ·   Mejor racha {self.best}   ·   Tiempo {secs // 60}:{secs % 60:02d}"
        t3 = "Pulgar ↑ repetir  ·  Puño: otra canción  ·  Pulgar ↓ salir"
        s1, s2, s3 = int(44 * s) + 2, int(18 * s) + 2, int(15 * s) + 2
        pw = max(self.fonts.width(t1, s1, "bold"), self.fonts.width(t2, s2),
                 self.fonts.width(t3, s3)) + int(80 * s)
        ph = int(170 * s)
        x0 = (w - pw) // 2
        y0 = int(h * 0.40) - ph // 2 - int((1 - _ease_out(min(age / 0.35, 1.0))) * 30 * s)
        panel(img, x0, y0, x0 + pw, y0 + ph, int(22 * s), alpha=0.78 * k, border=BORDER if k >= 1 else None)
        self.fonts.draw(img, t1, w // 2, y0 + int(52 * s), s1, ACCENT, "bold", "cm", alpha=k)
        self.fonts.draw(img, t2, w // 2, y0 + int(104 * s), s2, TEXT, "regular", "cm", alpha=k)
        self.fonts.draw(img, t3, w // 2, y0 + int(140 * s), s3, MUTED, "regular", "cm", shadow=False, alpha=k)

    def _draw_line(self, img, s, line_y):
        w = img.shape[1]
        layer_y0, layer_y1 = max(line_y - 3, 0), line_y + 4
        roi = img[layer_y0:layer_y1]
        over = roi.copy()
        cv2.line(over, (0, line_y - layer_y0), (w, line_y - layer_y0), GOLD, max(2, int(3 * s)), cv2.LINE_AA)
        roi[:] = cv2.addWeighted(over, 0.8, roi, 0.2, 0)
        self._chip(img, s, w - int(14 * s), line_y - int(22 * s), "Línea del teclado  ·  W / S",
                   dot=GOLD, align_right=True)

    # --- paneles -------------------------------------------------------------
    def _chip(self, img, s, x, y, text, dot=None, meter=None, draw=True, align_right=False,
              text_color=TEXT):
        """Pastilla redondeada. Devuelve su ancho. y = centro vertical."""
        size = int(14 * s) + 2
        hgt = int(28 * s) + 2
        px = int(11 * s) + 2
        gap = int(7 * s) + 1
        dot_r = int(4 * s) + 1
        meter_w = int(64 * s)
        width = px + self.fonts.width(text, size) + px
        if dot is not None:
            width += dot_r * 2 + gap
        if meter is not None:
            width += gap + meter_w
        if not draw:
            return width
        if align_right:
            x -= width
        x, y0 = int(x), int(y - hgt // 2)
        rounded_rect(img, x, y0, x + width, y0 + hgt, hgt // 2, CHIP)
        cx = x + px
        if dot is not None:
            cv2.circle(img, (cx + dot_r, int(y)), dot_r, dot, -1, cv2.LINE_AA)
            cx += dot_r * 2 + gap
        cx += self.fonts.draw(img, text, cx, y, size, text_color, "regular", "lm", shadow=False)
        if meter is not None:
            mh = max(4, int(6 * s))
            mx0 = cx + gap
            rounded_rect(img, mx0, int(y - mh / 2), mx0 + meter_w, int(y + mh / 2), mh // 2, TRACK)
            fill = int(meter_w * min(max(meter, 0.0), 1.0))
            if fill > mh:
                rounded_rect(img, mx0, int(y - mh / 2), mx0 + fill, int(y + mh / 2), mh // 2, ACCENT)
        return width

    def _draw_status(self, img, s, mode, thr, sides):
        m = int(16 * s)
        pad = int(16 * s)
        title_size = int(27 * s) + 2
        hint_size = int(12 * s) + 2
        gap = int(8 * s)

        chips = []
        if mode == "dedos":
            chips.append(dict(text="Modo dedos", dot=GOLD))
            # thr bajo = mas sensible -> la barra se llena mas
            chips.append(dict(text="Sensibilidad", meter=(1.0 - thr) / 0.9))
        else:
            chips.append(dict(text="Modo línea", dot=GOLD))
        chips.append(dict(text="Mano I", dot=ACCENT if "L" in sides else (95, 90, 88)))
        chips.append(dict(text="Mano D", dot=ACCENT if "R" in sides else (95, 90, 88)))
        chips.append(dict(text=f"{self._fps:4.0f} fps", text_color=MUTED))

        widths = [self._chip(img, s, 0, 0, draw=False, **c) for c in chips]
        chips_w = sum(widths) + gap * (len(chips) - 1)
        ws = "sensibilidad" if mode == "dedos" else "mover línea"
        hint = f"M modo  ·  W/S {ws}  ·  G guía  ·  N nieve  ·  R reiniciar  ·  C canciones  ·  Q salir"
        title = "Piano de dedos"
        inner_w = max(self.fonts.width(title, title_size, "bold"), chips_w,
                      self.fonts.width(hint, hint_size))
        chip_h = int(28 * s) + 2
        row1 = int(title_size * 1.15)
        height = pad + row1 + gap + chip_h + gap + int(hint_size * 1.3) + pad - int(4 * s)

        x0, y0 = m, m
        panel(img, x0, y0, x0 + inner_w + 2 * pad, y0 + height, int(16 * s))
        y = y0 + pad
        tw = self.fonts.draw(img, title, x0 + pad, y, title_size, TEXT, "bold", "lt")
        # pequeno acento musical: tres barras doradas junto al titulo
        bx = x0 + pad + tw + int(12 * s)
        for k, bh in enumerate((0.55, 1.0, 0.75)):
            bw = max(3, int(4 * s))
            hh = int(title_size * 0.62 * bh)
            by1 = y + int(title_size * 0.72)
            rounded_rect(img, bx + k * (bw + int(4 * s)), by1 - hh, bx + k * (bw + int(4 * s)) + bw, by1,
                         bw // 2, GOLD)
        y += row1 + gap + chip_h // 2
        x = x0 + pad
        for c, cw in zip(chips, widths):
            self._chip(img, s, x, y, **c)
            x += cw + gap
        y += chip_h // 2 + gap
        self.fonts.draw(img, hint, x0 + pad, y, hint_size, MUTED, "regular", "lt", shadow=False)

    def _draw_guide(self, img, s, song, pos, now):
        h, w = img.shape[:2]
        m = int(16 * s)
        pad = int(16 * s)
        pw = min(max(int(0.33 * w), int(420 * s)), w // 2 - 2 * m)
        x1 = w - m
        x0 = x1 - pw
        y0 = m
        title_size = int(19 * s) + 2
        pill_h = int(40 * s) + 2
        bar_h = max(5, int(7 * s))
        gap = int(10 * s)
        stat_size = int(13 * s) + 2
        height = pad + int(title_size * 1.1) + gap + bar_h + gap + pill_h + gap + int(stat_size * 1.2) + pad
        panel(img, x0, y0, x1, y0 + height, int(16 * s))

        y = y0 + pad
        self.fonts.draw(img, self.song_title, x0 + pad, y, title_size, TEXT, "semibold", "lt")
        self.fonts.draw(img, f"{pos} / {len(song)}", x1 - pad, y, int(15 * s) + 2, MUTED, "regular", "rt",
                        shadow=False)
        y += int(title_size * 1.1) + gap
        bx0, bx1 = x0 + pad, x1 - pad
        rounded_rect(img, bx0, y, bx1, y + bar_h, bar_h // 2, TRACK)
        fill = int((bx1 - bx0) * pos / max(len(song), 1))
        if fill > bar_h:
            rounded_rect(img, bx0, y, bx0 + fill, y + bar_h, bar_h // 2, ACCENT)
        y += bar_h + gap
        cy = y + pill_h // 2

        # estadisticas (abajo del todo)
        total = self.ok + self.fail
        hot = self.streak >= 2 and now - self._streak_t < 0.5
        segs = [("Racha ", MUTED, "regular"), (str(self.streak), GOLD if hot else TEXT, "bold"),
                ("    Mejor ", MUTED, "regular"), (str(self.best), TEXT, "bold"),
                ("    Precisión ", MUTED, "regular"),
                (f"{round(100 * self.ok / total)} %" if total else "—", TEXT, "bold")]
        sy = y + pill_h + gap
        sx = bx0
        for text, color, weight in segs:
            sx += self.fonts.draw(img, text, sx, sy, stat_size, color, weight, "lt", shadow=False)

        if pos >= len(song):
            self.fonts.draw(img, "¡Canción completa!", bx0, cy, int(17 * s) + 2, ACCENT, "bold", "lm")
            self.fonts.draw(img, "Pulgar: repetir  ·  Puño: menú", bx1, cy, int(12 * s) + 2, MUTED, "regular", "rm",
                            shadow=False)
            return

        # siguiente nota: pastilla grande verde con nota y dedo
        nxt = song[pos]
        big = int(19 * s) + 2
        small = int(13 * s) + 2
        name_w = self.fonts.width(self.notes[nxt][0], big, "bold")
        finger_w = self.fonts.width(self.finger_names[nxt], small, "semibold")
        px = int(14 * s)
        first_w = px + name_w + int(8 * s) + finger_w + px
        rounded_rect(img, bx0, y, bx0 + first_w, y + pill_h, pill_h // 2, ACCENT)
        self.fonts.draw(img, self.notes[nxt][0], bx0 + px, cy, big, DARK_TEXT, "bold", "lm", shadow=False)
        self.fonts.draw(img, self.finger_names[nxt], bx0 + px + name_w + int(8 * s), cy, small,
                        (60, 90, 60), "semibold", "lm", shadow=False)

        # las siguientes, cada vez mas tenues
        x = bx0 + first_w + int(8 * s)
        ph = int(30 * s) + 2
        size = int(15 * s) + 2
        dot_r = int(4 * s) + 1
        for k, n in enumerate(song[pos + 1:pos + 9]):
            name = self.notes[n][0]
            pw_k = int(10 * s) + dot_r * 2 + int(6 * s) + self.fonts.width(name, size) + int(10 * s)
            if x + pw_k > bx1:
                break
            fade = k / 8
            rounded_rect(img, x, cy - ph // 2, x + pw_k, cy + ph // 2, ph // 2, _mix(CHIP, PANEL, fade))
            cv2.circle(img, (x + int(10 * s) + dot_r, cy), dot_r, _mix(self.colors[n], PANEL, fade * 0.8),
                       -1, cv2.LINE_AA)
            self.fonts.draw(img, name, x + int(10 * s) + dot_r * 2 + int(6 * s), cy, size,
                            _mix(TEXT, MUTED, fade), "regular", "lm", shadow=False)
            x += pw_k + int(6 * s)

    def _draw_no_hands(self, img, s):
        h, w = img.shape[:2]
        t1 = "Coloca las manos frente a la cámara"
        t2 = "con los dedos apuntando hacia ella"
        s1, s2 = int(24 * s) + 2, int(16 * s) + 2
        pw = max(self.fonts.width(t1, s1, "semibold"), self.fonts.width(t2, s2)) + int(56 * s)
        ph = int(96 * s)
        x0, y0 = (w - pw) // 2, int(h * 0.42) - ph // 2
        panel(img, x0, y0, x0 + pw, y0 + ph, int(18 * s), alpha=0.7)
        self.fonts.draw(img, t1, w // 2, y0 + int(34 * s), s1, TEXT, "semibold", "cm")
        self.fonts.draw(img, t2, w // 2, y0 + int(66 * s), s2, MUTED, "regular", "cm", shadow=False)

    # --- teclado ---------------------------------------------------------------
    def _key_sprite(self, w, h, r, fid):
        key = (w, h, r, fid)
        spr = self._key_sprites.get(key)
        if spr is None:
            if len(self._key_sprites) > 100:
                self._key_sprites.clear()
            if fid is None:
                top, bottom = (222, 220, 218), (253, 253, 253)
            else:
                c = self.colors[fid]
                top, bottom = _mix(c, (0, 0, 0), 0.25), _mix(c, (255, 255, 255), 0.3)
            t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
            rgb = np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t
            rgb = np.repeat(rgb, w, axis=1)
            # brillo suave en el borde inferior, como una tecla de verdad
            rgb[-max(2, h // 18):] = np.minimum(rgb[-max(2, h // 18):] + 18, 255)
            mask = np.zeros((h, w), np.uint8)
            rounded_rect(mask, 0, 0, w - 1, h - 1, r, 255)
            wgt = mask.astype(np.float32) / 255.0
            spr = (rgb.astype(np.uint8), wgt, 1.0 - wgt)
            self._key_sprites[key] = spr
        return spr

    def _draw_keyboard(self, img, s, kb, active, target, now, dt):
        h, w = img.shape[:2]
        m, top, xs, key_w = kb["m"], kb["top"], kb["xs"], kb["key_w"]
        ky, key_h, r, sh = kb["ky"], kb["key_h"], kb["r"], kb["sh"]
        panel(img, m, top, w - m, h - m, int(18 * s), alpha=0.6)

        # el hundido se anima en lugar de saltar
        for i in range(len(xs)):
            goal = 1.0 if i in active else 0.0
            self._press[i] += (goal - self._press[i]) * min(1.0, dt * 22)

        # 1a pasada: brillos y sombras (debajo de TODAS las teclas, para no aclarar a las vecinas)
        for i, x in enumerate(xs):
            flash = max(0.0, 1.0 - (now - self.key_flash.get(i, -10.0)) / 0.45)
            level = max(self._press[i], flash)
            if level > 0.02:
                glow_rect(img, x, ky, x + key_w, ky + key_h, r, self.colors[i], 0.85 * level, int(14 * s) + 2)
        for i, x in enumerate(xs):
            if self._press[i] < 0.5:  # sombra: la tecla "flota" sobre el panel
                rounded_rect(img, x, ky + sh, x + key_w - 1, ky + key_h - 1 + sh - 1, r, (14, 11, 9))

        # 2a pasada: las teclas
        for i, (name, _) in enumerate(self.notes):
            x = xs[i]
            cx = x + key_w // 2
            p = self._press[i]
            lit = p > 0.5
            dy = int(round(p * (sh - 1)))

            # todas las teclas se ven igual (tambien los sostenidos: el nombre ya lo indica)
            white, wgt, inv = self._key_sprite(key_w, key_h - sh, r, None)
            if p > 0.04:
                colored = self._key_sprite(key_w, key_h - sh, r, i)[0]
                rgb = colored if p > 0.96 else cv2.addWeighted(white, 1 - p, colored, p, 0)
            else:
                rgb = white
            roi = img[ky + dy:ky + dy + key_h - sh, x:x + key_w]
            if roi.shape[:2] == wgt.shape:
                roi[:] = cv2.blendLinear(rgb, roi, wgt, inv)

            if i == target:
                pulse = 0.5 + 0.5 * math.sin(now * 7)
                rounded_rect(img, x - 2, ky + dy - 2, x + key_w + 1, ky + dy + key_h - sh + 1, r + 2,
                             ACCENT, max(2, int((2 + 2 * pulse) * s)))

            cv2.circle(img, (cx, ky + dy + int(15 * s)), int(4 * s) + 1,
                       (255, 255, 255) if lit else self.colors[i], -1, cv2.LINE_AA)
            self.fonts.draw(img, name, cx, ky + dy + int(key_h * 0.47), int(22 * s) + 2,
                            (255, 255, 255) if lit else DARK_TEXT, "bold", "cm", shadow=lit)
            self.fonts.draw(img, self.finger_names[i], cx, ky + dy + key_h - sh - int(15 * s), int(12 * s) + 2,
                            (255, 255, 255) if lit else (120, 110, 104),
                            "regular", "cm", shadow=False)

    # --- cuenta atras y anillo del puno ------------------------------------------
    def _draw_countdown(self, img, s, remaining, has_hands):
        h, w = img.shape[:2]
        cx, cy = w // 2, int(h * 0.44)
        num = max(1, math.ceil(remaining))
        frac = remaining - math.floor(remaining) if remaining % 1 else 1.0   # 1 -> 0 en cada segundo
        pop = _ease_out(min((1.0 - frac) / 0.25, 1.0))                        # aparece con un "pop"
        R = int(92 * s)
        panel(img, cx - R, cy - R, cx + R, cy + R, R, PANEL, 0.72, border=None)
        circle_alpha(img, (cx, cy), R - int(10 * s), TRACK, max(3, int(6 * s)), 0.8)
        cv2.ellipse(img, (cx, cy), (R - int(10 * s), R - int(10 * s)), -90, 0, int(360 * frac), ACCENT,
                    max(3, int(6 * s)), cv2.LINE_AA)
        size = int((70 + 26 * (1 - pop)) * s / 4) * 4 + 4    # tamano en pasos de 4 px (menos sprites)
        self.fonts.draw(img, str(num), cx, cy, size, TEXT, "bold", "cm", alpha=0.35 + 0.65 * pop)
        self.fonts.draw(img, self.song_title, cx, cy - R - int(46 * s), int(30 * s) + 2, TEXT, "bold", "cm")
        hint = ("Deja los dedos quietos un momento…" if has_hands
                else "Coloca las manos frente a la cámara")
        self.fonts.draw(img, hint, cx, cy + R + int(36 * s), int(17 * s) + 2, MUTED, "regular", "cm")

    def _draw_fist_ring(self, img, s, pt, progress, label, pose="fist"):
        """Anillo que se llena mientras se mantiene la pose
        (verde = puno, dorado = pulgar arriba, rojo = pulgar abajo / salir)."""
        R = int(46 * s)
        color = {"thumb": GOLD, "down": RED}.get(pose, ACCENT)
        circle_alpha(img, pt, R, (30, 30, 30), max(3, int(6 * s)), 0.5)
        if progress > 0.01:
            glow(img, pt, int(R * 0.8), color, 0.35 * progress)
            cv2.ellipse(img, pt, (R, R), -90, 0, int(360 * progress), color, max(3, int(6 * s)), cv2.LINE_AA)
            label = {"thumb": "Mantén el pulgar", "down": "Mantén para salir"}.get(pose, "Mantén el puño")
        self.fonts.draw(img, label, pt[0], pt[1] + R + int(26 * s), int(15 * s) + 2,
                        color if progress > 0.01 else TEXT, "semibold", "cm")

    # --- menu de canciones (carrusel) ---------------------------------------------
    def song_picked(self):
        self._picked_t = time.monotonic()

    def render_menu(self, img, *, hands, songs, pos, fist_progress, fist_pt, records, connections,
                    pose="fist"):
        """pos = posicion del carrusel sin limite (la cancion es songs[pos % len(songs)]).
        pose = pose cuya carga se esta mostrando ("fist" elige la cancion, "down" cierra)."""
        pick_progress = fist_progress if pose == "fist" else 0.0
        now, dt = self._tick()
        h, w = img.shape[:2]
        s = self._s = min(w / 1280, h / 720)
        if self._car is None:
            self._car = self._car_goal = float(pos)
        if pos != self._car_goal:
            self._arrow = (now, 1 if pos > self._car_goal else -1)
            self._car_goal = pos
        self._car += (pos - self._car) * min(1.0, dt * 9)

        img[:] = cv2.convertScaleAbs(img, alpha=0.4, beta=6)     # la camara queda de fondo, oscurecida
        if self.snow_on:
            self._draw_snow(img, s, now, dt)
        self._draw_hands(img, s, hands, connections)

        cx = w // 2
        self.fonts.draw(img, "Elige una canción", cx, int(64 * s), int(40 * s) + 2, TEXT, "bold", "cm")
        self.fonts.draw(img, "Desliza la mano para cambiar  ·  Haz un puño para tocar", cx, int(108 * s),
                        int(17 * s) + 2, MUTED, "regular", "cm", shadow=False)

        # tarjetas: de la mas lejana a la central (la central queda encima)
        n = len(songs)
        cy = int(h * 0.5)
        spacing = int(560 * s)
        base = math.floor(self._car)
        order = sorted(range(base - 2, base + 4), key=lambda j: -abs(j - self._car))
        sel = round(self._car)
        for j in order:
            off = j - self._car
            if abs(off) > 2.2:
                continue
            scale = max(0.7, 1 - 0.17 * abs(off))
            alpha = max(0.0, 1 - 0.45 * abs(off))
            x = cx + int(off * spacing * (1 - 0.06 * abs(off)))
            song = songs[j % n]
            self._draw_card(img, s, x, cy, scale, alpha, song, j % n, n, records.get(song["title"]),
                            j == sel, pick_progress if j == sel else 0.0, now)

        # flechas a los lados (se iluminan al cambiar)
        t_arrow, d_arrow = self._arrow
        for d in (-1, 1):
            lit = d == d_arrow and now - t_arrow < 0.35
            ax = cx + d * int(283 * s)
            R = int(26 * s)
            rounded_rect(img, ax - R, cy - R, ax + R, cy + R, R, ACCENT if lit else CHIP)
            k = int(8 * s)
            pts = np.array([(ax - d * k // 2, cy - k), (ax + d * k // 2, cy), (ax - d * k // 2, cy + k)],
                           np.int32)
            cv2.polylines(img, [pts], False, DARK_TEXT if lit else TEXT, max(2, int(3 * s)), cv2.LINE_AA)

        # puntos de pagina
        dy = cy + int(205 * s)
        dot = int(5 * s) + 1
        gap = int(20 * s)
        x0 = cx - (n - 1) * gap // 2
        for i in range(n):
            if i == pos % n:
                rounded_rect(img, x0 + i * gap - dot * 2, dy - dot, x0 + i * gap + dot * 2, dy + dot, dot, ACCENT)
            else:
                cv2.circle(img, (x0 + i * gap, dy), dot - 1, TRACK, -1, cv2.LINE_AA)

        # ayuda abajo
        chips = [dict(text="← →  Desliza la mano", dot=GOLD), dict(text="Puño  Elegir", dot=ACCENT),
                 dict(text="Pulgar ↓  Salir", dot=RED), dict(text="Teclado:  ← →  Enter", text_color=MUTED)]
        widths = [self._chip(img, s, 0, 0, draw=False, **c) for c in chips]
        g = int(10 * s)
        x = cx - (sum(widths) + g * (len(chips) - 1)) // 2
        for c, cw in zip(chips, widths):
            self._chip(img, s, x, h - int(46 * s), **c)
            x += cw + g

        if fist_pt is not None:
            self._draw_fist_ring(img, s, fist_pt, fist_progress, "Haz un puño para elegir", pose)
        elif not hands:
            self.fonts.draw(img, "Muestra la mano a la cámara", cx, h - int(96 * s), int(16 * s) + 2,
                            TEXT, "semibold", "cm")

    def _draw_card(self, img, s, cx, cy, scale, alpha, song, idx, n, record, selected, progress, now):
        k = round(s * scale * 20) / 20          # escala en pasos (menos tamanos de letra distintos)
        cw, ch = int(470 * k), int(322 * k)
        x0, y0 = cx - cw // 2, cy - ch // 2
        x1, y1 = x0 + cw, y0 + ch
        if x1 < 0 or x0 > img.shape[1]:
            return
        card_bg = (44, 34, 28)
        pick = max(0.0, 1.0 - (now - self._picked_t) / 0.6) if selected else 0.0
        if selected:
            glow_rect(img, x0, y0, x1, y1, int(24 * k), ACCENT, 0.25 + 0.55 * max(progress, pick),
                      int(18 * s) + 2)
        panel(img, x0, y0, x1, y1, int(24 * k), card_bg, 0.96,   # opaca: la nieve no se transparenta
              border=ACCENT if selected else _mix(BORDER, card_bg, 1 - alpha))
        pad = int(28 * k)
        inner = cw - 2 * pad

        def T(text, x, y, size, color, weight="regular", anchor="lt", shadow=True):
            return self.fonts.draw(img, text, x, y, int(size * k) + 2, color, weight, anchor,
                                   shadow=shadow, alpha=alpha)

        y = y0 + pad
        T(f"Canción {idx + 1} de {n}", x0 + pad, y, 13, MUTED, shadow=False)
        # dificultad: tres puntos
        r = max(2, int(5 * k))
        for i in range(3):
            col = GOLD if 2 - i < song["difficulty"] else TRACK
            cv2.circle(img, (x1 - pad - r - i * (3 * r), y + r), r, _mix(col, card_bg, 1 - alpha), -1,
                       cv2.LINE_AA)
        y += int(30 * k)

        size = 32
        while size > 16 and self.fonts.width(song["title"], int(size * k) + 2, "bold") > inner:
            size -= 2
        T(song["title"], x0 + pad, y, size, TEXT, "bold")
        y += int(46 * k)
        T(song["subtitle"], x0 + pad, y, 15, MUTED, shadow=False)
        y += int(34 * k)

        # la melodia en miniatura: una barra por nota, mas alta cuanto mas aguda
        notes = song["notes"]
        sh = int(70 * k)
        bw = inner / len(notes)
        for i, note in enumerate(notes):
            bh = int((0.22 + 0.78 * note / 9) * sh)
            bx0 = x0 + pad + int(i * bw)
            bx1 = x0 + pad + int((i + 1) * bw) - (1 if bw > 3 else 0)
            cv2.rectangle(img, (bx0, y + sh - bh), (max(bx0, bx1 - 1), y + sh),
                          _mix(self.colors[note], card_bg, 1 - alpha), -1)
        y += sh + int(22 * k)

        nw = T(str(len(notes)), x0 + pad, y, 34, TEXT, "bold")
        keys = song.get("keys")
        span = f"  ·  {keys[0][0]}–{keys[-1][0]}" if keys else ""
        T("notas" + span, x0 + pad + nw + int(8 * k), y + int(14 * k), 16, MUTED, shadow=False)
        T(f"Récord  {record} %" if record is not None else "Sin récord", x1 - pad, y + int(14 * k), 15,
          GOLD if record is not None else MUTED, "semibold" if record is not None else "regular", "rt",
          shadow=False)

        if selected and progress > 0.01:   # barra de carga del puno dentro de la tarjeta
            bh = max(4, int(6 * k))
            by = y1 - int(14 * k)
            rounded_rect(img, x0 + pad, by, x0 + pad + max(bh, int(inner * progress)), by + bh, bh // 2, ACCENT)

    # --- despedida al cerrar con el gesto ---------------------------------------
    def draw_farewell(self, img, k):
        """k = 0..1: la imagen se va oscureciendo y aparece el mensaje."""
        h, w = img.shape[:2]
        s = min(w / 1280, h / 720)
        img[:] = cv2.convertScaleAbs(img, alpha=1.0 - 0.85 * k)
        a = min(k / 0.4, 1.0)
        pw, ph = int(460 * s), int(170 * s)
        x0, y0 = (w - pw) // 2, int(h * 0.45) - int(70 * s)
        panel(img, x0, y0, x0 + pw, y0 + ph, int(22 * s), alpha=0.92 * a, border=BORDER if a >= 1 else None)
        self.fonts.draw(img, "¡Hasta pronto!", w // 2, int(h * 0.45), int(48 * s) + 2, TEXT, "bold", "cm",
                        alpha=a)
        self.fonts.draw(img, "Cerrando el piano…", w // 2, int(h * 0.45) + int(56 * s), int(17 * s) + 2,
                        MUTED, "regular", "cm", shadow=False, alpha=a)
