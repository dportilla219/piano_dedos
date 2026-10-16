/*
Gestos con la mano (usa los puntos de MediaPipe, normalizados 0..1). Version web de gestos.py.

- Deslizar la mano a la izquierda / derecha -> siguiente / anterior cancion.
- Mantener el puno cerrado un momento       -> "select" (elegir cancion / volver al menu).
- Mantener el pulgar arriba un momento      -> "repeat" (repetir la cancion al terminar).
- Mantener el pulgar abajo 1,5 s            -> "quit" (salir).
*/
const PALM = [0, 5, 9, 13, 17];
const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]];  // (punta, articulacion media) de indice..menique
const POSE_EVENTS = { fist: "select", thumb: "repeat", down: "quit" };
const QUIT_HOLD = 1.5;   // salir pide mantener mas tiempo: no debe pasar sin querer

function dist(a, b, aspect) {
  // x e y estan normalizados por ancho y alto distintos: se corrige con la relacion de aspecto
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** Un dedo esta doblado si su punta queda mas cerca de la muneca que su articulacion media. */
function folded(lms, aspect) {
  const wrist = lms[0];
  return FINGERS.map(([tip, pip]) => dist(lms[tip], wrist, aspect) < dist(lms[pip], wrist, aspect));
}

const count = (arr) => arr.filter(Boolean).length;

function minY(lms) {
  let m = Infinity;
  for (let i = 5; i <= 20; i++) m = Math.min(m, lms[i].y);
  return m;
}

function maxY(lms) {
  let m = -Infinity;
  for (let i = 5; i <= 20; i++) m = Math.max(m, lms[i].y);
  return m;
}

export function palmSize(lms, aspect) {
  return dist(lms[0], lms[9], aspect);
}

export function palmCenter(lms) {
  let x = 0, y = 0;
  for (const i of PALM) { x += lms[i].x; y += lms[i].y; }
  return [x / PALM.length, y / PALM.length];
}

/** Pulgar arriba: los dedos doblados y el pulgar estirado hacia arriba, de modo que su punta es
 *  claramente el punto mas alto de la mano (en un puno lo mas alto son los nudillos doblados). */
export function isThumbUp(lms, aspect) {
  const f = folded(lms, aspect);
  const ps = palmSize(lms, aspect);
  const straightUp = lms[4].y < lms[3].y && lms[3].y < lms[2].y;
  const highest = lms[4].y < minY(lms) - 0.25 * ps;
  return f[1] && count(f) >= 3 && straightUp && highest;
}

/** Pulgar abajo: como el pulgar arriba pero al reves; la punta es el punto mas bajo de la mano. */
export function isThumbDown(lms, aspect) {
  const f = folded(lms, aspect);
  const ps = palmSize(lms, aspect);
  const straightDown = lms[4].y > lms[3].y && lms[3].y > lms[2].y;
  const lowest = lms[4].y > maxY(lms) + 0.25 * ps;
  return f[1] && count(f) >= 3 && straightDown && lowest;
}

export function isFist(lms, aspect) {
  const f = folded(lms, aspect);
  return f[0] && f[1] && count(f) >= 3 && !isThumbUp(lms, aspect) && !isThumbDown(lms, aspect);
}

export class HandGestures {
  constructor(hold = 0.8, swipeDist = 0.18, swipeTime = 0.45) {
    this.hold = hold;              // segundos que hay que mantener la pose
    this.swipeDist = swipeDist;    // fraccion del ancho que debe recorrer la mano
    this.swipeTime = swipeTime;    // ... en como mucho este tiempo
    this.reset();
  }

  reset() {
    this.history = [];             // [t, x, y] del centro de la mano
    this.holdT0 = null;
    this.pose = null;              // pose que se esta manteniendo: "fist", "thumb", "down" o null
    this.shownPose = null;         // ultima pose con carga (para dibujar el anillo mientras baja)
    this.progress = 0.0;           // 0..1 para dibujar el anillo de carga
    this.needOpen = true;          // hay que abrir la mano antes de que cuente otra pose
    this.lastSwipeT = -10.0;
    this.lastSwipeDir = 0;
    this.palm = null;              // centro de la mano seguida (normalizado)
  }

  /** Devuelve "next", "prev", "select", "repeat", "quit" o null.
   *  poses = poses que cuentan ahora ("fist" -> "select", "thumb" -> "repeat", "down" -> "quit"). */
  update(handLandmarks, now, aspect, poses = ["fist"]) {
    if (!handLandmarks.length) {
      this.history = [];
      this.holdT0 = null; this.pose = null; this.progress = 0.0; this.palm = null;
      return null;
    }

    // la mano mas cercana
    const lms = handLandmarks.reduce((a, b) => (palmSize(b, aspect) > palmSize(a, aspect) ? b : a));
    const c = palmCenter(lms);
    if (this.palm !== null && Math.abs(c[0] - this.palm[0]) > 0.15) {
      this.history = [];           // salto imposible en un frame: se ha cambiado de mano
    }
    this.palm = c;
    let pose = null;
    if (isThumbUp(lms, aspect)) pose = "thumb";
    else if (isThumbDown(lms, aspect)) pose = "down";
    else if (isFist(lms, aspect)) pose = "fist";

    // --- pose mantenida (puno / pulgar arriba / pulgar abajo) ---
    if (pose !== null) {
      this.history = [];           // con la mano cerrada no se desliza
      if (this.needOpen || !poses.includes(pose)) {
        this.holdT0 = null; this.pose = null;
        this.progress = Math.max(0.0, this.progress - 0.15);
        return null;
      }
      if (pose !== this.pose) {    // cambio de pose: la carga empieza de cero
        this.pose = pose; this.holdT0 = now;
      }
      this.shownPose = pose;
      const hold = pose === "down" ? QUIT_HOLD : this.hold;
      this.progress = Math.min((now - this.holdT0) / hold, 1.0);
      if (this.progress >= 1.0) {
        this.needOpen = true; this.holdT0 = null; this.pose = null;
        return POSE_EVENTS[pose];
      }
      return null;
    }
    this.needOpen = false;
    this.holdT0 = null; this.pose = null;
    this.progress = Math.max(0.0, this.progress - 0.15);

    // --- deslizar = cambiar de cancion ---
    this.history.push([now, c[0], c[1]]);
    while (now - this.history[0][0] > this.swipeTime) this.history.shift();
    const [, x0, y0] = this.history[0];
    const dx = c[0] - x0, dy = c[1] - y0;
    if (Math.abs(dx) > this.swipeDist && Math.abs(dy) < Math.abs(dx) * 0.7) {
      const d = dx > 0 ? 1 : -1;
      this.history = [];
      // la mano que vuelve a su sitio tras deslizar no debe contar como gesto contrario
      const since = now - this.lastSwipeT;
      if (since < 0.45 || (d === -this.lastSwipeDir && since < 1.0)) return null;
      this.lastSwipeT = now; this.lastSwipeDir = d;
      return d < 0 ? "next" : "prev";   // como en el movil: deslizar a la izquierda = siguiente
    }
    return null;
  }
}
