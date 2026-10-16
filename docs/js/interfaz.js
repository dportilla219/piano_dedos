/*
Interfaz grafica del piano de dedos (version web de interfaz.py, dibujada en un <canvas>).

- Paneles translucidos con esquinas redondeadas, teclado con relieve y brillo al pulsar.
- Guia tipo "Synthesia": las proximas notas bajan hacia su tecla.
- Efectos: onda, chispas y nombre de la nota al tocar; confeti al terminar; nieve opcional.

Las medidas estan pensadas para 1280x720 y se escalan con s = min(ancho / 1280, alto / 720).
Colores en RGB.
*/

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------
export const PANEL = [22, 26, 34];        // fondo de paneles (azul noche)
const BORDER = [70, 78, 90];
const CHIP = [46, 52, 62];
const TRACK = [70, 78, 88];
const TEXT = [238, 242, 246];
const MUTED = [158, 165, 175];
const ACCENT = [140, 225, 130];          // verde: siguiente nota de la guia
const GOLD = [255, 195, 70];
const RED = [240, 90, 90];               // salir
const DARK_TEXT = [36, 40, 48];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

const TIP_IDS = new Set([4, 8, 12, 16, 20]);
const PALM_BONES = new Set(["0-1", "0-5", "5-9", "9-13", "13-17", "0-17"]);
const CONFETTI_COLORS = [[244, 66, 66], [255, 200, 66], [120, 220, 80], [60, 160, 240], [160, 80, 220],
  [255, 255, 255], [255, 195, 70]];

const FAMILY = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif';
const WEIGHTS = { regular: 400, semibold: 600, bold: 700 };

const I = Math.trunc;
const TAU = Math.PI * 2;
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (c1, c2, t) => c1.map((a, i) => I(a * (1 - t) + c2[i] * t));
const easeOut = (p) => 1 - (1 - p) ** 3;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const now_ = () => performance.now() / 1000;
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Primitivas de dibujo
// ---------------------------------------------------------------------------
function rrPath(ctx, x0, y0, x1, y1, r) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

function roundedRect(ctx, x0, y0, x1, y1, r, color, thickness = -1, alpha = 1) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  if (thickness < 0) {
    rrPath(ctx, x0, y0, x1, y1, r);
    ctx.fillStyle = rgba(color);
    ctx.fill();
  } else {
    rrPath(ctx, x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, r);
    ctx.strokeStyle = rgba(color);
    ctx.lineWidth = thickness;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Rectangulo redondeado translucido (tipo cristal oscuro). */
function panel(ctx, x0, y0, x1, y1, r, color = PANEL, alpha = 0.62, border = BORDER) {
  if (x1 <= x0 || y1 <= y0) return;
  roundedRect(ctx, x0, y0, x1, y1, r, color, -1, alpha);
  if (border) roundedRect(ctx, x0, y0, x1 - 1, y1 - 1, r, border, 1);
}

function circle(ctx, x, y, r, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.5), 0, TAU);
  ctx.fillStyle = rgba(color);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function circleAlpha(ctx, x, y, radius, color, thickness, alpha) {
  if (alpha <= 0 || radius <= 0) return;
  ctx.globalAlpha = Math.min(alpha, 1);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = thickness;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Arco que se va llenando desde arriba en el sentido de las agujas del reloj (frac 0..1). */
function arcProgress(ctx, x, y, R, frac, color, thickness) {
  if (frac <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(frac, 1));
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** Halo de luz aditivo alrededor de un punto. */
function glow(ctx, x, y, radius, color, strength = 0.8) {
  if (strength <= 0 || radius <= 0) return;
  const R = radius * 3;
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, rgba(color, Math.min(strength, 1)));
  g.addColorStop(0.33, rgba(color, Math.min(strength, 1) * 0.5));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  ctx.restore();
}

/** Brillo difuso alrededor de un rectangulo (se dibuja solo la sombra, desplazada fuera de la vista). */
function glowRect(ctx, dpr, x0, y0, x1, y1, r, color, strength = 0.8, spread = 18) {
  if (strength <= 0) return;
  const OFF = 20000;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = rgba(color, Math.min(strength, 1));
  ctx.shadowBlur = spread * 2 * dpr;
  ctx.shadowOffsetX = OFF * dpr;
  rrPath(ctx, x0 - OFF, y0, x1 - OFF, y1, r);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------
class Fonts {
  constructor(ctx) {
    this.ctx = ctx;
    this._w = new Map();
  }

  font(size, weight) {
    return `${WEIGHTS[weight]} ${size}px ${FAMILY}`;
  }

  width(text, size, weight = "regular") {
    const key = `${weight}|${size}|${text}`;
    let w = this._w.get(key);
    if (w === undefined) {
      this.ctx.font = this.font(size, weight);
      w = Math.ceil(this.ctx.measureText(text).width);
      if (this._w.size > 3000) this._w.clear();
      this._w.set(key, w);
    }
    return w;
  }

  /** anchor = horizontal (l/c/r) + vertical (t = alto de mayusculas, m = centro, b = linea base). */
  draw(text, x, y, size, color = TEXT, weight = "regular", anchor = "lt", shadow = true, alpha = 1.0) {
    const ctx = this.ctx;
    const w = this.width(text, size, weight);
    if (alpha <= 0) return w;
    if (anchor[0] === "c") x -= w / 2;
    else if (anchor[0] === "r") x -= w;
    y += { t: 0.7 * size, m: 0.35 * size, b: 0 }[anchor[1]];
    ctx.font = this.font(size, weight);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    if (shadow) {
      ctx.globalAlpha = 0.55 * alpha;
      ctx.fillStyle = "#000";
      ctx.fillText(text, x + 1, y + 2);
    }
    ctx.globalAlpha = Math.min(alpha, 1);
    ctx.fillStyle = rgba(color);
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
    return w;
  }
}

// ---------------------------------------------------------------------------
// Interfaz completa
// ---------------------------------------------------------------------------
export class PianoUI {
  constructor(ctx, notes, fingerNames, colors, handIds, songTitle = "Jingle Bells") {
    this.ctx = ctx;
    this.dpr = 1;
    this.w = 1280;
    this.h = 720;
    this.notes = notes;
    this.fingerNames = fingerNames;
    this.colors = colors;
    this.handIds = handIds;     // {L: {punta: id_dedo}, R: {punta: id_dedo}}
    this.songTitle = songTitle;
    this.fonts = new Fonts(ctx);
    this.snowOn = true;
    this.fps = 0;
    this.effects = [];          // {t0, x, y, color, text, correct}
    this.particles = [];        // [x, y, vx, vy, vida, vida_max, color, radio]
    this.confetti = [];         // [x, y, vx, vy, angulo, giro, color, tam]
    this.snow = null;
    this.keyFlash = {};         // id_dedo -> instante de la ultima pulsacion
    this._beam = new Map();
    this._press = new Array(notes.length).fill(0);   // animacion de hundido de cada tecla (0..1)
    this._keyCenters = {};
    this._lastPos = null;
    this._s = 1.0;
    this._car = null;           // posicion animada del carrusel
    this._carGoal = null;
    this._arrow = [-10.0, 0];   // (instante, direccion) del ultimo cambio de cancion
    this._pickedT = -10.0;      // instante en que se eligio una cancion (pulso de la tarjeta)
    this._last = now_();
    this.resetSong();
  }

  setKeys(notes) {
    this.notes = notes;
  }

  resetSong() {
    this.ok = this.fail = this.streak = this.best = 0;
    this.tStart = this.tEnd = null;
    this._streakT = -10.0;
    this._laneOff = 0.0;
    this._lastPos = null;
    this.confetti = [];
    this.newRecord = false;
  }

  /** Porcentaje de aciertos con la guia activa (null si aun no se ha tocado nada). */
  precision() {
    const total = this.ok + this.fail;
    return total ? Math.round((100 * this.ok) / total) : null;
  }

  // --- eventos -----------------------------------------------------------
  /** guided = la guia esta activa y la cancion no ha terminado (cuenta para las estadisticas). */
  noteHit(fid, pos, correct, guided = true) {
    const now = now_();
    this.keyFlash[fid] = now;
    if (guided) {
      if (this.tStart === null) this.tStart = now;
      if (correct) {
        this.ok += 1;
        this.streak += 1;
        this.best = Math.max(this.best, this.streak);
        this._streakT = now;
      } else {
        this.fail += 1;
        this.streak = 0;
      }
    }
    const color = this.colors[fid];
    if (pos) {
      this.effects.push({ t0: now, x: pos[0], y: pos[1], color, text: this.notes[fid][0], correct: correct && guided });
      this._burst(pos[0], pos[1], color, 16, false);
    }
    const kc = this._keyCenters[fid];
    if (kc) this._burst(kc[0], kc[1], color, 10, true);
  }

  _burst(x, y, color, n, up) {
    const s = this._s;
    for (let i = 0; i < n; i++) {
      let a, v;
      if (up) { a = -Math.PI / 2 + rand(-0.6, 0.6); v = rand(180, 380) * s; }
      else { a = rand(0, TAU); v = rand(120, 300) * s; }
      const life = rand(0.45, 0.8);
      this.particles.push([x, y, Math.cos(a) * v, Math.sin(a) * v, life, life,
        mix(color, WHITE, rand(0.1, 0.6)), rand(2.5, 4.5) * s]);
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  // --- dibujo principal ----------------------------------------------------
  _tick() {
    const now = now_();
    const dt = clamp(now - this._last, 1e-3, 0.1);
    this._last = now;
    return [now, dt];
  }

  /** countdown = segundos que faltan para empezar (o null).
   *  fist = [progreso 0..1, punto en pantalla, pose] para el anillo al terminar (o null). */
  render({ hands, tips, active, target, mode, thr, deltas, lowest, lineY, song, songPos, showGuide,
    connections, countdown = null, fist = null }) {
    const [now, dt] = this._tick();
    const { w, h } = this;
    const s = (this._s = Math.min(w / 1280, h / 720));
    const kb = this._kbLayout(w, h, s);
    this._keyCenters = {};
    kb.xs.forEach((x, i) => { this._keyCenters[i] = [x + I(kb.keyW / 2), kb.ky]; });
    this._updateSong(song, songPos, now, dt, w, h, s);

    this._shadeEdges(s);
    if (this.snowOn) this._drawSnow(s, now, dt);
    if (mode === "linea") this._drawLine(s, lineY);
    if (showGuide && songPos < song.length) this._drawLane(s, kb, song, songPos, now);
    this._drawHands(s, hands, connections);
    this._drawTips(s, tips, active, target, mode, thr, deltas, lowest, now);
    this._drawEffects(s, now);
    this._drawParticles(dt);

    this._drawStatus(s, mode, thr, new Set(hands.map(([side]) => side)));
    if (showGuide) this._drawGuide(s, song, songPos, now);
    this._drawKeyboard(s, kb, active, target, now, dt);
    const celebrating = this.tEnd !== null && now - this.tEnd < 6.5;
    if (!hands.length && !celebrating && countdown === null) this._drawNoHands(s);
    this._drawCelebration(s, now, dt);
    if (countdown !== null) this._drawCountdown(s, countdown, hands.length > 0);
    if (fist && fist[1]) {
      this._drawFistRing(s, fist[1], fist[0], "Pulgar ↑ repetir  ·  Puño: otra canción  ·  Pulgar ↓ salir", fist[2]);
    }
  }

  _updateSong(song, pos, now, dt, w, h, s) {
    if (this._lastPos !== null) {
      if (pos === this._lastPos + 1) this._laneOff += 1.0;   // las notas de la guia bajan una posicion
      else if (pos < this._lastPos) this._laneOff = 0.0;
      if (pos >= song.length && song.length > this._lastPos) {
        this.tEnd = now;
        this._spawnConfetti(w, h, s);
      }
    }
    this._lastPos = pos;
    this._laneOff -= this._laneOff * Math.min(1.0, dt * 10);
  }

  _kbLayout(w, h, s) {
    const n = this.notes.length;
    const m = I(16 * s);
    const pad = I(10 * s) + 2;
    const gap = Math.max(3, I(6 * s));
    const handGap = I(26 * s);
    const kbH = I(118 * s);
    const top = h - m - kbH;
    const kx0 = m + pad, kx1 = w - m - pad;
    const keyW = Math.floor((kx1 - kx0 - (n - 2) * gap - handGap) / n);
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(kx0 + i * (keyW + gap) + (i >= Math.floor(n / 2) ? handGap - gap : 0));
    return { m, pad, top, kbH, xs, keyW, ky: top + pad, keyH: kbH - 2 * pad, r: I(10 * s) + 2,
      sh: Math.max(2, I(4 * s)) };
  }

  // --- fondo ----------------------------------------------------------------
  /** Oscurece arriba y abajo para que se lean los paneles. */
  _shadeEdges(s) {
    const { ctx, w, h } = this;
    const top = I(190 * s), bot = I(230 * s);
    const dark = 1 - 115 / 255;
    let g = ctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, `rgba(0,0,0,${dark})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, top);
    g = ctx.createLinearGradient(0, h - bot, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, h - bot, w, bot);
  }

  _drawSnow(s, now, dt) {
    const { ctx, w, h } = this;
    if (this.snow === null) {
      // copos: x, y (0..1), tamano, velocidad, fase del vaiven
      this.snow = Array.from({ length: 90 }, () => [Math.random(), Math.random(), rand(0.8, 2.6),
        rand(0.03, 0.08), rand(0, TAU)]);
    }
    for (const f of this.snow) {
      f[1] += f[3] * dt * (0.6 + 0.25 * f[2]);   // los copos grandes caen mas rapido
      if (f[1] > 1.02) { f[1] = -0.02; f[0] = Math.random(); }
      const x = (f[0] + 0.012 * Math.sin(now * 0.8 + f[4])) * w;
      circle(ctx, x, f[1] * h, Math.max(1, Math.round(f[2] * s)), f[2] > 1.6 ? [245, 248, 250] : [200, 205, 210]);
    }
  }

  // --- guia tipo "Synthesia": las proximas notas bajan hacia su tecla -----------
  _drawLane(s, kb, song, pos, now) {
    const slotH = I(28 * s) + 2;
    const slot = slotH + I(7 * s);
    const nShow = 5;
    const base = kb.top - I(12 * s);
    const keyW = kb.keyW;
    const inset = I(keyW * 0.14);
    const beamH = nShow * slot + I(20 * s);
    this._drawBeam(kb.xs[song[pos]], base - beamH, keyW, beamH, 0.32 + 0.1 * Math.sin(now * 5));

    const upcoming = song.slice(pos, pos + nShow + 1);
    for (let k = upcoming.length - 1; k >= 0; k--) {   // de arriba a abajo: la siguiente queda encima
      const n = upcoming[k];
      const yb = I(base - (k + this._laneOff) * slot);
      const yt = yb - slotH;
      const fade = 1.0 - k / (nShow + 0.5);
      if (fade <= 0 || yt < 0) continue;
      const x0 = kb.xs[n] + inset, x1 = kb.xs[n] + keyW - inset;
      panel(this.ctx, x0, yt, x1, yb, I(slotH / 2), this.colors[n], k === 0 ? 0.92 : 0.2 + 0.5 * fade, null);
      if (k === 0) {
        roundedRect(this.ctx, x0 - 2, yt - 2, x1 + 1, yb + 1, I(slotH / 2) + 2, WHITE, Math.max(2, I(2 * s)));
      }
      this.fonts.draw(this.notes[n][0], (x0 + x1) / 2, (yt + yb) / 2, I(14 * s) + 2, WHITE,
        k === 0 ? "bold" : "semibold", "cm", true, k === 0 ? 1.0 : 0.3 + 0.6 * fade);
    }
  }

  _drawBeam(x, y, w, h, strength) {
    if (w <= 0 || h <= 0) return;
    const key = `${w}x${h}`;
    let spr = this._beam.get(key);
    if (!spr) {
      if (this._beam.size > 20) this._beam.clear();
      spr = document.createElement("canvas");
      spr.width = w; spr.height = h;
      const c = spr.getContext("2d");
      const img = c.createImageData(w, h);
      for (let j = 0; j < h; j++) {
        const t = (j / Math.max(h - 1, 1)) ** 1.6;               // mas intenso abajo
        for (let i = 0; i < w; i++) {
          const xx = -1 + (2 * i) / Math.max(w - 1, 1);
          const prof = clamp(1 - xx * xx, 0, 1) ** 0.7;          // mas intenso al centro
          const k = (j * w + i) * 4;
          img.data[k] = ACCENT[0] * t * prof;
          img.data[k + 1] = ACCENT[1] * t * prof;
          img.data[k + 2] = ACCENT[2] * t * prof;
          img.data[k + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      this._beam.set(key, spr);
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp(strength, 0, 1);
    ctx.drawImage(spr, x, y);
    ctx.restore();
  }

  // --- manos ---------------------------------------------------------------
  _drawHands(s, hands, connections) {
    if (!hands.length) return;
    const ctx = this.ctx;
    const th = Math.max(2, I(3 * s));
    ctx.globalAlpha = 0.6;
    ctx.lineCap = "round";
    for (const [side, pts] of hands) {
      const ids = this.handIds[side];
      for (const [a, b] of connections) {
        let col;
        if (PALM_BONES.has(`${a}-${b}`)) col = WHITE;
        else col = mix(this.colors[ids[(Math.floor((b - 1) / 4) + 1) * 4]], WHITE, 0.25);  // cada dedo con su color
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.strokeStyle = rgba(col);
        ctx.lineWidth = th;
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      pts.forEach((p, i) => {
        if (TIP_IDS.has(i)) return;
        ctx.beginPath();
        ctx.arc(p[0], p[1], Math.max(3, I(4 * s)), 0, TAU);
        ctx.fill();
      });
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
  }

  _drawTips(s, tips, active, target, mode, thr, deltas, lowest, now) {
    const ctx = this.ctx;
    for (const [fid, x, y] of tips) {
      const color = this.colors[fid];
      const pressed = active.has(fid);
      let r = I((pressed ? 15 : 10) * s) + 1;
      if (mode === "linea" && lowest && fid === lowest[0] && !pressed) r = I(13 * s) + 1;
      if (pressed) glow(ctx, x, y, I(30 * s), color, 0.9);
      circle(ctx, x, y, r + Math.max(2, I(3 * s)), WHITE);
      circle(ctx, x, y, r, color);

      if (mode === "dedos") {
        // anillo que se va llenando segun cuanto ha bajado el dedo
        const level = clamp((deltas[fid] ?? 0.0) / thr, 0.0, 1.0);
        const ring = r + I(8 * s);
        circleAlpha(ctx, x, y, ring, [40, 40, 40], Math.max(2, I(3 * s)), 0.45);
        if (level > 0.02) arcProgress(ctx, x, y, ring, level, pressed ? WHITE : color, Math.max(2, I(3 * s)));
      }

      if (fid === target) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 7);
        const rad = r + I((16 + 4 * pulse) * s);
        circleAlpha(ctx, x, y, rad, ACCENT, Math.max(2, I(3 * s)), 0.6 + 0.4 * pulse);
      }

      // nombre de la nota solo en el dedo pulsado y en el que toca (si no, se pisan)
      if (pressed || fid === target) {
        this.fonts.draw(this.notes[fid][0], x, y - r - I(16 * s), I(17 * s) + 2,
          fid === target && !pressed ? ACCENT : TEXT, "semibold", "cb");
      }
    }
  }

  // --- efectos -------------------------------------------------------------
  _drawEffects(s, now) {
    const alive = [];
    for (const eff of this.effects) {
      const age = now - eff.t0;
      if (age > 0.9) continue;
      alive.push(eff);
      const p = Math.min(age / 0.55, 1.0);
      if (p < 1) {
        const rad = I((18 + 60 * easeOut(p)) * s);
        circleAlpha(this.ctx, eff.x, eff.y, rad, eff.correct ? ACCENT : eff.color,
          Math.max(1, I((5 * (1 - p) + 1) * s)), 0.9 * (1 - p));
      }
      const q = age / 0.9;
      this.fonts.draw(eff.text, eff.x, eff.y - I((48 + 60 * easeOut(q)) * s), I(30 * s) + 2,
        eff.correct ? ACCENT : mix(eff.color, WHITE, 0.35), "bold", "cb", true, 1 - q * q);
    }
    this.effects = alive;
  }

  _drawParticles(dt) {
    const g = 520 * this._s;
    const alive = [];
    for (const p of this.particles) {
      p[4] -= dt;
      if (p[4] <= 0) continue;
      p[3] += g * dt;
      p[2] *= 1 - 1.5 * dt;
      p[0] += p[2] * dt;
      p[1] += p[3] * dt;
      circle(this.ctx, p[0], p[1], Math.max(1, I((p[7] * p[4]) / p[5])), p[6]);
      alive.push(p);
    }
    this.particles = alive;
  }

  _spawnConfetti(w, h, s) {
    const rnd = Math.random;
    this.confetti = Array.from({ length: 170 }, () => [rnd() * w, -rnd() * h * 0.6, (rnd() - 0.5) * 120 * s,
      (150 + rnd() * 170) * s, rnd() * 6.28, (rnd() - 0.5) * 10,
      CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)], (5 + rnd() * 5) * s]);
  }

  _drawCelebration(s, now, dt) {
    if (this.tEnd === null) return;
    const { ctx, w, h } = this;
    const alive = [];
    for (const c of this.confetti) {
      c[0] += (c[2] + 40 * s * Math.sin(now * 2 + c[4])) * dt;   // vaiven al caer
      c[1] += c[3] * dt;
      c[4] += c[5] * dt;
      if (c[1] > h + 20) continue;
      alive.push(c);
      const hw = c[7], hh = Math.max(1.0, c[7] * 0.5 * Math.abs(Math.sin(c[4] * 1.7)));   // "gira" en 3D
      ctx.save();
      ctx.translate(c[0], c[1]);
      ctx.rotate(c[4]);
      ctx.fillStyle = rgba(c[6]);
      ctx.fillRect(-hw, -hh, 2 * hw, 2 * hh);
      ctx.restore();
    }
    this.confetti = alive;

    const age = now - this.tEnd;
    if (age >= 6.5) return;
    const k = Math.min(age / 0.35, 1.0, (6.5 - age) / 0.5);
    const total = this.ok + this.fail;
    const prec = total ? `${Math.round((100 * this.ok) / total)} %` : "—";
    const secs = this.tStart !== null ? I(this.tEnd - this.tStart) : 0;
    const t1 = this.newRecord ? "¡Nuevo récord!" : "¡Canción completa!";
    const t2 = `Precisión ${prec}   ·   Mejor racha ${this.best}   ·   Tiempo ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const t3 = "Pulgar ↑ repetir  ·  Puño: otra canción  ·  Pulgar ↓ salir";
    const s1 = I(44 * s) + 2, s2 = I(18 * s) + 2, s3 = I(15 * s) + 2;
    const pw = Math.max(this.fonts.width(t1, s1, "bold"), this.fonts.width(t2, s2), this.fonts.width(t3, s3)) + I(80 * s);
    const ph = I(170 * s);
    const x0 = I((w - pw) / 2);
    const y0 = I(h * 0.4) - I(ph / 2) - I((1 - easeOut(Math.min(age / 0.35, 1.0))) * 30 * s);
    panel(ctx, x0, y0, x0 + pw, y0 + ph, I(22 * s), PANEL, 0.78 * k, k >= 1 ? BORDER : null);
    this.fonts.draw(t1, w / 2, y0 + I(52 * s), s1, ACCENT, "bold", "cm", true, k);
    this.fonts.draw(t2, w / 2, y0 + I(104 * s), s2, TEXT, "regular", "cm", true, k);
    this.fonts.draw(t3, w / 2, y0 + I(140 * s), s3, MUTED, "regular", "cm", false, k);
  }

  _drawLine(s, lineY) {
    const { ctx, w } = this;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(w, lineY);
    ctx.strokeStyle = rgba(GOLD);
    ctx.lineWidth = Math.max(2, I(3 * s));
    ctx.stroke();
    ctx.globalAlpha = 1;
    this._chip(s, w - I(14 * s), lineY - I(22 * s), { text: "Línea del teclado  ·  W / S", dot: GOLD, alignRight: true });
  }

  // --- paneles -------------------------------------------------------------
  /** Pastilla redondeada. Devuelve su ancho. y = centro vertical. */
  _chip(s, x, y, { text, dot = null, meter = null, draw = true, alignRight = false, textColor = TEXT }) {
    const size = I(14 * s) + 2;
    const hgt = I(28 * s) + 2;
    const px = I(11 * s) + 2;
    const gap = I(7 * s) + 1;
    const dotR = I(4 * s) + 1;
    const meterW = I(64 * s);
    let width = px + this.fonts.width(text, size) + px;
    if (dot) width += dotR * 2 + gap;
    if (meter !== null) width += gap + meterW;
    if (!draw) return width;
    if (alignRight) x -= width;
    x = I(x);
    const y0 = I(y - hgt / 2);
    roundedRect(this.ctx, x, y0, x + width, y0 + hgt, I(hgt / 2), CHIP);
    let cx = x + px;
    if (dot) {
      circle(this.ctx, cx + dotR, y, dotR, dot);
      cx += dotR * 2 + gap;
    }
    cx += this.fonts.draw(text, cx, y, size, textColor, "regular", "lm", false);
    if (meter !== null) {
      const mh = Math.max(4, I(6 * s));
      const mx0 = cx + gap;
      roundedRect(this.ctx, mx0, I(y - mh / 2), mx0 + meterW, I(y + mh / 2), I(mh / 2), TRACK);
      const fill = I(meterW * clamp(meter, 0.0, 1.0));
      if (fill > mh) roundedRect(this.ctx, mx0, I(y - mh / 2), mx0 + fill, I(y + mh / 2), I(mh / 2), ACCENT);
    }
    return width;
  }

  _drawStatus(s, mode, thr, sides) {
    const m = I(16 * s);
    const pad = I(16 * s);
    const titleSize = I(27 * s) + 2;
    const hintSize = I(12 * s) + 2;
    const gap = I(8 * s);

    const chips = [];
    if (mode === "dedos") {
      chips.push({ text: "Modo dedos", dot: GOLD });
      chips.push({ text: "Sensibilidad", meter: (1.0 - thr) / 0.9 });   // thr bajo = mas sensible
    } else {
      chips.push({ text: "Modo línea", dot: GOLD });
    }
    chips.push({ text: "Mano I", dot: sides.has("L") ? ACCENT : [88, 90, 95] });
    chips.push({ text: "Mano D", dot: sides.has("R") ? ACCENT : [88, 90, 95] });
    chips.push({ text: `${String(Math.round(this.fps)).padStart(4, " ")} fps`, textColor: MUTED });

    const widths = chips.map((c) => this._chip(s, 0, 0, { ...c, draw: false }));
    const chipsW = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
    const ws = mode === "dedos" ? "sensibilidad" : "mover línea";
    const hint = `M modo  ·  W/S ${ws}  ·  G guía  ·  N nieve  ·  R reiniciar  ·  C canciones  ·  Q salir`;
    const title = "Piano de dedos";
    const innerW = Math.max(this.fonts.width(title, titleSize, "bold"), chipsW, this.fonts.width(hint, hintSize));
    const chipH = I(28 * s) + 2;
    const row1 = I(titleSize * 1.15);
    const height = pad + row1 + gap + chipH + gap + I(hintSize * 1.3) + pad - I(4 * s);

    const x0 = m, y0 = m;
    panel(this.ctx, x0, y0, x0 + innerW + 2 * pad, y0 + height, I(16 * s));
    let y = y0 + pad;
    const tw = this.fonts.draw(title, x0 + pad, y, titleSize, TEXT, "bold", "lt");
    // pequeno acento musical: tres barras doradas junto al titulo
    const bx = x0 + pad + tw + I(12 * s);
    [0.55, 1.0, 0.75].forEach((bh, k) => {
      const bw = Math.max(3, I(4 * s));
      const hh = I(titleSize * 0.62 * bh);
      const by1 = y + I(titleSize * 0.72);
      const bxk = bx + k * (bw + I(4 * s));
      roundedRect(this.ctx, bxk, by1 - hh, bxk + bw, by1, I(bw / 2), GOLD);
    });
    y += row1 + gap + I(chipH / 2);
    let x = x0 + pad;
    chips.forEach((c, i) => {
      this._chip(s, x, y, c);
      x += widths[i] + gap;
    });
    y += I(chipH / 2) + gap;
    this.fonts.draw(hint, x0 + pad, y, hintSize, MUTED, "regular", "lt", false);
  }

  _drawGuide(s, song, pos, now) {
    const { ctx, w } = this;
    const m = I(16 * s);
    const pad = I(16 * s);
    const pw = Math.min(Math.max(I(0.33 * w), I(420 * s)), Math.floor(w / 2) - 2 * m);
    const x1 = w - m;
    const x0 = x1 - pw;
    const y0 = m;
    const titleSize = I(19 * s) + 2;
    const pillH = I(40 * s) + 2;
    const barH = Math.max(5, I(7 * s));
    const gap = I(10 * s);
    const statSize = I(13 * s) + 2;
    const height = pad + I(titleSize * 1.1) + gap + barH + gap + pillH + gap + I(statSize * 1.2) + pad;
    panel(ctx, x0, y0, x1, y0 + height, I(16 * s));

    let y = y0 + pad;
    this.fonts.draw(this.songTitle, x0 + pad, y, titleSize, TEXT, "semibold", "lt");
    this.fonts.draw(`${pos} / ${song.length}`, x1 - pad, y, I(15 * s) + 2, MUTED, "regular", "rt", false);
    y += I(titleSize * 1.1) + gap;
    const bx0 = x0 + pad, bx1 = x1 - pad;
    roundedRect(ctx, bx0, y, bx1, y + barH, I(barH / 2), TRACK);
    const fill = I(((bx1 - bx0) * pos) / Math.max(song.length, 1));
    if (fill > barH) roundedRect(ctx, bx0, y, bx0 + fill, y + barH, I(barH / 2), ACCENT);
    y += barH + gap;
    const cy = y + I(pillH / 2);

    // estadisticas (abajo del todo)
    const total = this.ok + this.fail;
    const hot = this.streak >= 2 && now - this._streakT < 0.5;
    const segs = [["Racha ", MUTED, "regular"], [String(this.streak), hot ? GOLD : TEXT, "bold"],
      ["    Mejor ", MUTED, "regular"], [String(this.best), TEXT, "bold"],
      ["    Precisión ", MUTED, "regular"],
      [total ? `${Math.round((100 * this.ok) / total)} %` : "—", TEXT, "bold"]];
    const sy = y + pillH + gap;
    let sx = bx0;
    for (const [text, color, weight] of segs) {
      sx += this.fonts.draw(text.replace(/ /g, " "), sx, sy, statSize, color, weight, "lt", false);
    }

    if (pos >= song.length) {
      this.fonts.draw("¡Canción completa!", bx0, cy, I(17 * s) + 2, ACCENT, "bold", "lm");
      this.fonts.draw("Pulgar: repetir  ·  Puño: menú", bx1, cy, I(12 * s) + 2, MUTED, "regular", "rm", false);
      return;
    }

    // siguiente nota: pastilla grande verde con nota y dedo
    const nxt = song[pos];
    const big = I(19 * s) + 2;
    const small = I(13 * s) + 2;
    const nameW = this.fonts.width(this.notes[nxt][0], big, "bold");
    const fingerW = this.fonts.width(this.fingerNames[nxt], small, "semibold");
    const px = I(14 * s);
    const firstW = px + nameW + I(8 * s) + fingerW + px;
    roundedRect(ctx, bx0, y, bx0 + firstW, y + pillH, I(pillH / 2), ACCENT);
    this.fonts.draw(this.notes[nxt][0], bx0 + px, cy, big, DARK_TEXT, "bold", "lm", false);
    this.fonts.draw(this.fingerNames[nxt], bx0 + px + nameW + I(8 * s), cy, small, [60, 90, 60], "semibold", "lm", false);

    // las siguientes, cada vez mas tenues
    let x = bx0 + firstW + I(8 * s);
    const ph = I(30 * s) + 2;
    const size = I(15 * s) + 2;
    const dotR = I(4 * s) + 1;
    const rest = song.slice(pos + 1, pos + 9);
    for (let k = 0; k < rest.length; k++) {
      const n = rest[k];
      const name = this.notes[n][0];
      const pwK = I(10 * s) + dotR * 2 + I(6 * s) + this.fonts.width(name, size) + I(10 * s);
      if (x + pwK > bx1) break;
      const fade = k / 8;
      roundedRect(ctx, x, cy - I(ph / 2), x + pwK, cy + I(ph / 2), I(ph / 2), mix(CHIP, PANEL, fade));
      circle(ctx, x + I(10 * s) + dotR, cy, dotR, mix(this.colors[n], PANEL, fade * 0.8));
      this.fonts.draw(name, x + I(10 * s) + dotR * 2 + I(6 * s), cy, size, mix(TEXT, MUTED, fade), "regular", "lm", false);
      x += pwK + I(6 * s);
    }
  }

  _drawNoHands(s) {
    const { w, h } = this;
    const t1 = "Coloca las manos frente a la cámara";
    const t2 = "con los dedos apuntando hacia ella";
    const s1 = I(24 * s) + 2, s2 = I(16 * s) + 2;
    const pw = Math.max(this.fonts.width(t1, s1, "semibold"), this.fonts.width(t2, s2)) + I(56 * s);
    const ph = I(96 * s);
    const x0 = I((w - pw) / 2), y0 = I(h * 0.42) - I(ph / 2);
    panel(this.ctx, x0, y0, x0 + pw, y0 + ph, I(18 * s), PANEL, 0.7);
    this.fonts.draw(t1, w / 2, y0 + I(34 * s), s1, TEXT, "semibold", "cm");
    this.fonts.draw(t2, w / 2, y0 + I(66 * s), s2, MUTED, "regular", "cm", false);
  }

  // --- teclado ---------------------------------------------------------------
  _drawKey(x, y, w, h, r, fid, alpha) {
    const ctx = this.ctx;
    let top, bottom;
    if (fid === null) { top = [218, 220, 222]; bottom = [253, 253, 253]; }
    else {
      const c = this.colors[fid];
      top = mix(c, BLACK, 0.25);
      bottom = mix(c, WHITE, 0.3);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    rrPath(ctx, x, y, x + w, y + h, r);
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(top));
    g.addColorStop(1, rgba(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // brillo suave en el borde inferior, como una tecla de verdad
    const hl = Math.max(2, Math.floor(h / 18));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgb(18,18,18)";
    ctx.fillRect(x, y + h - hl, w, hl);
    ctx.restore();
  }

  _drawKeyboard(s, kb, active, target, now, dt) {
    const { ctx, w, h } = this;
    const { m, top, xs, keyW, ky, keyH, r, sh } = kb;
    panel(ctx, m, top, w - m, h - m, I(18 * s), PANEL, 0.6);

    // el hundido se anima en lugar de saltar
    for (let i = 0; i < xs.length; i++) {
      const goal = active.has(i) ? 1.0 : 0.0;
      this._press[i] += (goal - this._press[i]) * Math.min(1.0, dt * 22);
    }

    // 1a pasada: brillos y sombras (debajo de TODAS las teclas, para no aclarar a las vecinas)
    xs.forEach((x, i) => {
      const flash = Math.max(0.0, 1.0 - (now - (this.keyFlash[i] ?? -10.0)) / 0.45);
      const level = Math.max(this._press[i], flash);
      if (level > 0.02) glowRect(ctx, this.dpr, x, ky, x + keyW, ky + keyH, r, this.colors[i], 0.85 * level, I(14 * s) + 2);
    });
    xs.forEach((x, i) => {
      if (this._press[i] < 0.5) roundedRect(ctx, x, ky + sh, x + keyW - 1, ky + keyH - 1 + sh - 1, r, [9, 11, 14]);
    });

    // 2a pasada: las teclas (todas se ven igual, tambien los sostenidos: el nombre ya lo indica)
    this.notes.forEach(([name], i) => {
      const x = xs[i];
      const cx = x + I(keyW / 2);
      const p = this._press[i];
      const lit = p > 0.5;
      const dy = Math.round(p * (sh - 1));
      const y = ky + dy;
      const kh = keyH - sh;

      this._drawKey(x, y, keyW, kh, r, null, 1);
      if (p > 0.04) this._drawKey(x, y, keyW, kh, r, i, Math.min(p, 1));

      if (i === target) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 7);
        roundedRect(ctx, x - 2, y - 2, x + keyW + 1, y + kh + 1, r + 2, ACCENT, Math.max(2, I((2 + 2 * pulse) * s)));
      }

      circle(ctx, cx, y + I(15 * s), I(4 * s) + 1, lit ? WHITE : this.colors[i]);
      this.fonts.draw(name, cx, y + I(keyH * 0.47), I(22 * s) + 2, lit ? WHITE : DARK_TEXT, "bold", "cm", lit);
      this.fonts.draw(this.fingerNames[i], cx, y + kh - I(15 * s), I(12 * s) + 2,
        lit ? WHITE : [104, 110, 120], "regular", "cm", false);
    });
  }

  // --- cuenta atras y anillo del puno ------------------------------------------
  _drawCountdown(s, remaining, hasHands) {
    const { ctx, w, h } = this;
    const cx = I(w / 2), cy = I(h * 0.44);
    const num = Math.max(1, Math.ceil(remaining));
    const frac = remaining % 1 ? remaining - Math.floor(remaining) : 1.0;   // 1 -> 0 en cada segundo
    const pop = easeOut(Math.min((1.0 - frac) / 0.25, 1.0));               // aparece con un "pop"
    const R = I(92 * s);
    panel(ctx, cx - R, cy - R, cx + R, cy + R, R, PANEL, 0.72, null);
    circleAlpha(ctx, cx, cy, R - I(10 * s), TRACK, Math.max(3, I(6 * s)), 0.8);
    arcProgress(ctx, cx, cy, R - I(10 * s), frac, ACCENT, Math.max(3, I(6 * s)));
    const size = I(((70 + 26 * (1 - pop)) * s) / 4) * 4 + 4;
    this.fonts.draw(String(num), cx, cy, size, TEXT, "bold", "cm", true, 0.35 + 0.65 * pop);
    this.fonts.draw(this.songTitle, cx, cy - R - I(46 * s), I(30 * s) + 2, TEXT, "bold", "cm");
    const hint = hasHands ? "Deja los dedos quietos un momento…" : "Coloca las manos frente a la cámara";
    this.fonts.draw(hint, cx, cy + R + I(36 * s), I(17 * s) + 2, MUTED, "regular", "cm");
  }

  /** Anillo que se llena mientras se mantiene la pose
   *  (verde = puno, dorado = pulgar arriba, rojo = pulgar abajo / salir). */
  _drawFistRing(s, pt, progress, label, pose = "fist") {
    const ctx = this.ctx;
    const R = I(46 * s);
    const color = { thumb: GOLD, down: RED }[pose] ?? ACCENT;
    circleAlpha(ctx, pt[0], pt[1], R, [30, 30, 30], Math.max(3, I(6 * s)), 0.5);
    if (progress > 0.01) {
      glow(ctx, pt[0], pt[1], I(R * 0.8), color, 0.35 * progress);
      arcProgress(ctx, pt[0], pt[1], R, progress, color, Math.max(3, I(6 * s)));
      label = { thumb: "Mantén el pulgar", down: "Mantén para salir" }[pose] ?? "Mantén el puño";
    }
    this.fonts.draw(label, pt[0], pt[1] + R + I(26 * s), I(15 * s) + 2, progress > 0.01 ? color : TEXT, "semibold", "cm");
  }

  // --- menu de canciones (carrusel) ---------------------------------------------
  songPicked() {
    this._pickedT = now_();
  }

  /** pos = posicion del carrusel sin limite (la cancion es songs[pos % songs.length]).
   *  pose = pose cuya carga se esta mostrando ("fist" elige la cancion, "down" sale). */
  renderMenu({ hands, songs, pos, fistProgress, fistPt, records, connections, pose = "fist" }) {
    const pickProgress = pose === "fist" ? fistProgress : 0.0;
    const [now, dt] = this._tick();
    const { ctx, w, h } = this;
    const s = (this._s = Math.min(w / 1280, h / 720));
    if (this._car === null) this._car = this._carGoal = pos;
    if (pos !== this._carGoal) {
      this._arrow = [now, pos > this._carGoal ? 1 : -1];
      this._carGoal = pos;
    }
    this._car += (pos - this._car) * Math.min(1.0, dt * 9);

    ctx.fillStyle = "rgba(0,0,0,0.6)";        // la camara queda de fondo, oscurecida
    ctx.fillRect(0, 0, w, h);
    if (this.snowOn) this._drawSnow(s, now, dt);
    this._drawHands(s, hands, connections);

    const cx = I(w / 2);
    this.fonts.draw("Elige una canción", cx, I(64 * s), I(40 * s) + 2, TEXT, "bold", "cm");
    this.fonts.draw("Desliza la mano para cambiar  ·  Haz un puño para tocar", cx, I(108 * s),
      I(17 * s) + 2, MUTED, "regular", "cm", false);

    // tarjetas: de la mas lejana a la central (la central queda encima)
    const n = songs.length;
    const cy = I(h * 0.5);
    const spacing = I(560 * s);
    const base = Math.floor(this._car);
    const order = [];
    for (let j = base - 2; j < base + 4; j++) order.push(j);
    order.sort((a, b) => Math.abs(b - this._car) - Math.abs(a - this._car));
    const sel = Math.round(this._car);
    for (const j of order) {
      const off = j - this._car;
      if (Math.abs(off) > 2.2) continue;
      const scale = Math.max(0.7, 1 - 0.17 * Math.abs(off));
      const alpha = Math.max(0.0, 1 - 0.45 * Math.abs(off));
      const x = cx + I(off * spacing * (1 - 0.06 * Math.abs(off)));
      const idx = ((j % n) + n) % n;
      const song = songs[idx];
      this._drawCard(s, x, cy, scale, alpha, song, idx, n, records[song.title] ?? null,
        j === sel, j === sel ? pickProgress : 0.0, now);
    }

    // flechas a los lados (se iluminan al cambiar)
    const [tArrow, dArrow] = this._arrow;
    for (const d of [-1, 1]) {
      const lit = d === dArrow && now - tArrow < 0.35;
      const ax = cx + d * I(283 * s);
      const R = I(26 * s);
      roundedRect(ctx, ax - R, cy - R, ax + R, cy + R, R, lit ? ACCENT : CHIP);
      const k = I(8 * s);
      ctx.beginPath();
      ctx.moveTo(ax - (d * k) / 2, cy - k);
      ctx.lineTo(ax + (d * k) / 2, cy);
      ctx.lineTo(ax - (d * k) / 2, cy + k);
      ctx.strokeStyle = rgba(lit ? DARK_TEXT : TEXT);
      ctx.lineWidth = Math.max(2, I(3 * s));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
    }

    // puntos de pagina
    const dy = cy + I(205 * s);
    const dot = I(5 * s) + 1;
    const gap = I(20 * s);
    const x0 = cx - I(((n - 1) * gap) / 2);
    const cur = ((pos % n) + n) % n;
    for (let i = 0; i < n; i++) {
      if (i === cur) roundedRect(ctx, x0 + i * gap - dot * 2, dy - dot, x0 + i * gap + dot * 2, dy + dot, dot, ACCENT);
      else circle(ctx, x0 + i * gap, dy, dot - 1, TRACK);
    }

    // ayuda abajo
    const chips = [{ text: "← →  Desliza la mano", dot: GOLD }, { text: "Puño  Elegir", dot: ACCENT },
      { text: "Pulgar ↓  Salir", dot: RED }, { text: "Teclado:  ← →  Enter", textColor: MUTED }];
    const widths = chips.map((c) => this._chip(s, 0, 0, { ...c, draw: false }));
    const g = I(10 * s);
    let x = cx - I((widths.reduce((a, b) => a + b, 0) + g * (chips.length - 1)) / 2);
    chips.forEach((c, i) => {
      this._chip(s, x, h - I(46 * s), c);
      x += widths[i] + g;
    });

    if (fistPt) this._drawFistRing(s, fistPt, fistProgress, "Haz un puño para elegir", pose);
    else if (!hands.length) this.fonts.draw("Muestra la mano a la cámara", cx, h - I(96 * s), I(16 * s) + 2, TEXT, "semibold", "cm");
  }

  _drawCard(s, cx, cy, scale, alpha, song, idx, n, record, selected, progress, now) {
    const ctx = this.ctx;
    const k = Math.round(s * scale * 20) / 20;   // escala en pasos
    const cw = I(470 * k), ch = I(322 * k);
    const x0 = cx - I(cw / 2), y0 = cy - I(ch / 2);
    const x1 = x0 + cw, y1 = y0 + ch;
    if (x1 < 0 || x0 > this.w) return;
    const cardBg = [28, 34, 44];
    const pick = selected ? Math.max(0.0, 1.0 - (now - this._pickedT) / 0.6) : 0.0;
    if (selected) glowRect(ctx, this.dpr, x0, y0, x1, y1, I(24 * k), ACCENT, 0.25 + 0.55 * Math.max(progress, pick), I(18 * s) + 2);
    panel(ctx, x0, y0, x1, y1, I(24 * k), cardBg, 0.96,   // opaca: la nieve no se transparenta
      selected ? ACCENT : mix(BORDER, cardBg, 1 - alpha));
    const pad = I(28 * k);
    const inner = cw - 2 * pad;

    const T = (text, x, y, size, color, weight = "regular", anchor = "lt", shadow = true) =>
      this.fonts.draw(text, x, y, I(size * k) + 2, color, weight, anchor, shadow, alpha);

    let y = y0 + pad;
    T(`Canción ${idx + 1} de ${n}`, x0 + pad, y, 13, MUTED, "regular", "lt", false);
    // dificultad: tres puntos
    const r = Math.max(2, I(5 * k));
    for (let i = 0; i < 3; i++) {
      const col = 2 - i < song.difficulty ? GOLD : TRACK;
      circle(ctx, x1 - pad - r - i * (3 * r), y + r, r, mix(col, cardBg, 1 - alpha));
    }
    y += I(30 * k);

    let size = 32;
    while (size > 16 && this.fonts.width(song.title, I(size * k) + 2, "bold") > inner) size -= 2;
    T(song.title, x0 + pad, y, size, TEXT, "bold");
    y += I(46 * k);
    T(song.subtitle, x0 + pad, y, 15, MUTED, "regular", "lt", false);
    y += I(34 * k);

    // la melodia en miniatura: una barra por nota, mas alta cuanto mas aguda
    const notes = song.notes;
    const shH = I(70 * k);
    const bw = inner / notes.length;
    notes.forEach((note, i) => {
      const bh = I((0.22 + (0.78 * note) / 9) * shH);
      const bx0 = x0 + pad + I(i * bw);
      const bx1 = x0 + pad + I((i + 1) * bw) - (bw > 3 ? 1 : 0);
      ctx.fillStyle = rgba(mix(this.colors[note], cardBg, 1 - alpha));
      ctx.fillRect(bx0, y + shH - bh, Math.max(bx0, bx1 - 1) - bx0 + 1, bh + 1);
    });
    y += shH + I(22 * k);

    const nw = T(String(notes.length), x0 + pad, y, 34, TEXT, "bold");
    const keys = song.keys;
    const span = keys ? `  ·  ${keys[0][0]}–${keys[keys.length - 1][0]}` : "";
    T("notas" + span, x0 + pad + nw + I(8 * k), y + I(14 * k), 16, MUTED, "regular", "lt", false);
    T(record !== null ? `Récord  ${record} %` : "Sin récord", x1 - pad, y + I(14 * k), 15,
      record !== null ? GOLD : MUTED, record !== null ? "semibold" : "regular", "rt", false);

    if (selected && progress > 0.01) {   // barra de carga del puno dentro de la tarjeta
      const bh = Math.max(4, I(6 * k));
      const by = y1 - I(14 * k);
      roundedRect(ctx, x0 + pad, by, x0 + pad + Math.max(bh, I(inner * progress)), by + bh, I(bh / 2), ACCENT);
    }
  }

  // --- despedida al salir con el gesto ---------------------------------------
  /** k = 0..1: la imagen se va oscureciendo y aparece el mensaje. */
  drawFarewell(k) {
    const { ctx, w, h } = this;
    const s = Math.min(w / 1280, h / 720);
    ctx.fillStyle = `rgba(0,0,0,${0.85 * k})`;
    ctx.fillRect(0, 0, w, h);
    const a = Math.min(k / 0.4, 1.0);
    const pw = I(460 * s), ph = I(170 * s);
    const x0 = I((w - pw) / 2), y0 = I(h * 0.45) - I(70 * s);
    panel(ctx, x0, y0, x0 + pw, y0 + ph, I(22 * s), PANEL, 0.92 * a, a >= 1 ? BORDER : null);
    this.fonts.draw("¡Hasta pronto!", w / 2, I(h * 0.45), I(48 * s) + 2, TEXT, "bold", "cm", true, a);
    this.fonts.draw("Cerrando el piano…", w / 2, I(h * 0.45) + I(56 * s), I(17 * s) + 2, MUTED, "regular", "cm", false, a);
  }
}
