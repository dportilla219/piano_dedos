"""
Gestos con la mano (usa los puntos de MediaPipe, normalizados 0..1).

- Deslizar la mano a la izquierda / derecha -> siguiente / anterior cancion.
- Mantener el puno cerrado un momento       -> "select" (elegir cancion / volver al menu).
- Mantener el pulgar arriba un momento      -> "repeat" (repetir la cancion al terminar).
- Mantener el pulgar abajo 1,5 s            -> "quit" (cerrar la aplicacion).
"""
import math
from collections import deque

PALM = (0, 5, 9, 13, 17)
FINGERS = ((8, 6), (12, 10), (16, 14), (20, 18))  # (punta, articulacion media) de indice..menique
POSE_EVENTS = {"fist": "select", "thumb": "repeat", "down": "quit"}
QUIT_HOLD = 1.5   # cerrar pide mantener mas tiempo: no debe pasar sin querer


def _dist(a, b, aspect):
    # x e y estan normalizados por ancho y alto distintos: se corrige con la relacion de aspecto
    return math.hypot((a.x - b.x) * aspect, a.y - b.y)


def _folded(lms, aspect):
    """Un dedo esta doblado si su punta queda mas cerca de la muneca que su articulacion media."""
    wrist = lms[0]
    return [_dist(lms[tip], wrist, aspect) < _dist(lms[pip], wrist, aspect) for tip, pip in FINGERS]


def is_thumb_up(lms, aspect):
    """Pulgar arriba: los dedos doblados y el pulgar estirado hacia arriba, de modo que su punta es
    claramente el punto mas alto de la mano (en un puno lo mas alto son los nudillos doblados)."""
    folded = _folded(lms, aspect)
    ps = palm_size(lms, aspect)
    straight_up = lms[4].y < lms[3].y < lms[2].y
    highest = lms[4].y < min(lms[i].y for i in range(5, 21)) - 0.25 * ps
    return folded[1] and sum(folded) >= 3 and straight_up and highest


def is_thumb_down(lms, aspect):
    """Pulgar abajo: como el pulgar arriba pero al reves; la punta es el punto mas bajo de la mano."""
    folded = _folded(lms, aspect)
    ps = palm_size(lms, aspect)
    straight_down = lms[4].y > lms[3].y > lms[2].y
    lowest = lms[4].y > max(lms[i].y for i in range(5, 21)) + 0.25 * ps
    return folded[1] and sum(folded) >= 3 and straight_down and lowest


def is_fist(lms, aspect):
    folded = _folded(lms, aspect)
    return (folded[0] and folded[1] and sum(folded) >= 3
            and not is_thumb_up(lms, aspect) and not is_thumb_down(lms, aspect))


def palm_center(lms):
    return (sum(lms[i].x for i in PALM) / len(PALM), sum(lms[i].y for i in PALM) / len(PALM))


def palm_size(lms, aspect):
    return _dist(lms[0], lms[9], aspect)


class HandGestures:
    def __init__(self, hold=0.8, swipe_dist=0.18, swipe_time=0.45):
        self.hold = hold                # segundos que hay que mantener la pose
        self.swipe_dist = swipe_dist    # fraccion del ancho que debe recorrer la mano
        self.swipe_time = swipe_time    # ... en como mucho este tiempo
        self.reset()

    def reset(self):
        self.history = deque()          # (t, x, y) del centro de la mano
        self.hold_t0 = None
        self.pose = None                # pose que se esta manteniendo: "fist", "thumb", "down" o None
        self.shown_pose = None          # ultima pose con carga (para dibujar el anillo mientras baja)
        self.progress = 0.0             # 0..1 para dibujar el anillo de carga
        self.need_open = True           # hay que abrir la mano antes de que cuente otra pose
        self.last_swipe_t = -10.0
        self.last_swipe_dir = 0
        self.palm = None                # centro de la mano seguida (normalizado)

    def update(self, hand_landmarks, now, aspect, poses=("fist",)):
        """Devuelve "next", "prev", "select", "repeat", "quit" o None.
        poses = poses que cuentan ahora ("fist" -> "select", "thumb" -> "repeat", "down" -> "quit")."""
        if not hand_landmarks:
            self.history.clear()
            self.hold_t0, self.pose, self.progress, self.palm = None, None, 0.0, None
            return None

        lms = max(hand_landmarks, key=lambda l: palm_size(l, aspect))  # la mano mas cercana
        c = palm_center(lms)
        if self.palm is not None and abs(c[0] - self.palm[0]) > 0.15:
            self.history.clear()        # salto imposible en un frame: se ha cambiado de mano
        self.palm = c
        if is_thumb_up(lms, aspect):
            pose = "thumb"
        elif is_thumb_down(lms, aspect):
            pose = "down"
        elif is_fist(lms, aspect):
            pose = "fist"
        else:
            pose = None

        # --- pose mantenida (puno / pulgar arriba) ---
        if pose is not None:
            self.history.clear()        # con la mano cerrada no se desliza
            if self.need_open or pose not in poses:
                self.hold_t0, self.pose = None, None
                self.progress = max(0.0, self.progress - 0.15)
                return None
            if pose != self.pose:       # cambio de pose: la carga empieza de cero
                self.pose, self.hold_t0 = pose, now
            self.shown_pose = pose
            hold = QUIT_HOLD if pose == "down" else self.hold
            self.progress = min((now - self.hold_t0) / hold, 1.0)
            if self.progress >= 1.0:
                self.need_open, self.hold_t0, self.pose = True, None, None
                return POSE_EVENTS[pose]
            return None
        self.need_open = False
        self.hold_t0, self.pose = None, None
        self.progress = max(0.0, self.progress - 0.15)

        # --- deslizar = cambiar de cancion ---
        self.history.append((now, c[0], c[1]))
        while now - self.history[0][0] > self.swipe_time:
            self.history.popleft()
        _, x0, y0 = self.history[0]
        dx, dy = c[0] - x0, c[1] - y0
        if abs(dx) > self.swipe_dist and abs(dy) < abs(dx) * 0.7:
            d = 1 if dx > 0 else -1
            self.history.clear()
            # la mano que vuelve a su sitio tras deslizar no debe contar como gesto contrario
            since = now - self.last_swipe_t
            if since < 0.45 or (d == -self.last_swipe_dir and since < 1.0):
                return None
            self.last_swipe_t, self.last_swipe_dir = now, d
            return "next" if d < 0 else "prev"   # como en el movil: deslizar a la izquierda = siguiente
        return None
