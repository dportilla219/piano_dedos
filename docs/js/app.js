/*
Piano de dedos con la camara, version web (misma logica que piano_dedos.py).

- Al iniciar aparece un carrusel de canciones: se cambia deslizando la mano y se elige con un puno
  (gestos.js). Tambien con el teclado (flechas y Enter) o tocando la pantalla.
- Al terminar una cancion: pulgar arriba = repetirla, puno = volver a elegir.
- Pulgar abajo mantenido 1,5 s (en el menu o al terminar) = salir.

- Detecta las dos manos con el modelo preentrenado de MediaPipe (Hand Landmarker), en el navegador:
  la imagen de la camara no sale del equipo.
- Modo "dedos" (por defecto): cada dedo se mide respecto a su propio nudillo; cuando un dedo
  baja / se dobla mas que en reposo, suena su nota.
- Modo "linea": la punta de dedo MAS ABAJO de las dos manos suena al cruzar la linea del teclado.

Opciones en la URL (como los argumentos de piano_dedos.py): ?modo=linea&sensibilidad=0.25&linea=0.55
*/
import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { SONGS } from "./canciones.js";
import { HandGestures } from "./gestos.js";
import { PianoUI } from "./interfaz.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const RECORDS_KEY = "piano_dedos.records";
const CAMERA_KEY = "piano_dedos.camara";

// ---------------------------------------------------------------------------
// 10 teclas, una por dedo. Cada cancion trae las suyas (canciones.js).
// Mano izquierda (en pantalla): menique -> pulgar = teclas 0..4
// Mano derecha  (en pantalla): pulgar  -> menique = teclas 5..9   (como un piano)
// ---------------------------------------------------------------------------
const FINGER_NAMES = ["Meñique I", "Anular I", "Medio I", "Índice I", "Pulgar I",
  "Pulgar D", "Índice D", "Medio D", "Anular D", "Meñique D"];
const TIPS = [4, 8, 12, 16, 20];   // indices MediaPipe: pulgar, indice, medio, anular, menique
const LEFT_HAND_IDS = { 20: 0, 16: 1, 12: 2, 8: 3, 4: 4 };
const RIGHT_HAND_IDS = { 4: 5, 8: 6, 12: 7, 16: 8, 20: 9 };
const TIP_BASE = { 4: 2, 8: 5, 12: 9, 16: 13, 20: 17 };   // punta -> nudillo de referencia de ese dedo

const HAND_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

const COLORS = [[244, 66, 66], [244, 160, 66], [244, 230, 66], [120, 220, 80], [60, 200, 230],
  [60, 140, 240], [160, 80, 220], [230, 80, 170], [240, 120, 120], [200, 200, 200]];

const BG = "rgb(15,18,24)";
const COUNTDOWN = 3.0;
const now_ = () => performance.now() / 1000;

// ---------------------------------------------------------------------------
// Sonido: tonos tipo piano sintetizados (armonicos + decaimiento), como en piano_dedos.py
// ---------------------------------------------------------------------------
class Piano {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(this.ctx.destination);
    this.buffers = new Map();
    // un sonido por cada tecla que usa alguna cancion (y los acordes del menu)
    const midis = new Set([55, 59, 60, 62, 64, 67]);
    SONGS.forEach((song) => song.keys.forEach(([, m]) => midis.add(m)));
    midis.forEach((m) => this.buffers.set(m, this.makeSound(m)));
  }

  makeSound(midi, seconds = 1.6) {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const freq = 440.0 * 2 ** ((midi - 69) / 12);
    const buf = this.ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    const partials = [[1, 1.0], [2, 0.5], [3, 0.25], [4, 0.12], [5, 0.06]];
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 0;
      for (const [k, a] of partials) v += a * Math.sin(2 * Math.PI * freq * k * t) * Math.exp(-t * (2.0 + k));
      v *= Math.min(t / 0.005, 1.0);   // ataque
      data[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    for (let i = 0; i < n; i++) data[i] = (data[i] / peak) * 0.35;
    return buf;
  }

  play(midi) {
    const buf = this.buffers.get(midi);
    if (!buf) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start();
  }
}

// ---------------------------------------------------------------------------
// Modelo de manos
// ---------------------------------------------------------------------------
async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 2,
    // umbrales mas bajos: con los dedos de frente la mano se ve "escorzada" y cuesta mas detectarla
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });
  try {
    return await HandLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (e) {
    console.warn("Sin GPU para MediaPipe, se usa la CPU:", e);
    return HandLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

/** Devuelve [[lado 'L'/'R', puntos en pixeles]], ordenadas de izquierda a derecha en pantalla.
 *  (ox, oy, w, h) = rectangulo donde se dibuja la imagen de la camara dentro del lienzo. */
function getHands(landmarks, w, h, ox = 0, oy = 0) {
  const hands = landmarks.map((lms) => lms.map((p) => [Math.trunc(ox + p.x * w), Math.trunc(oy + p.y * h)]));
  hands.sort((a, b) => a[0][0] - b[0][0]);   // ordena por x de la muneca (izq -> der en pantalla)
  return hands.map((pts, i) => {
    const isLeft = hands.length === 2 ? i === 0 : pts[0][0] < ox + w / 2;   // una sola mano: decide por el lado
    return [isLeft ? "L" : "R", pts];
  });
}

/** Lista de puntas [[id_dedo, x, y]]. */
function getFingertips(hands) {
  const tips = [];
  for (const [side, pts] of hands) {
    const ids = side === "L" ? LEFT_HAND_IDS : RIGHT_HAND_IDS;
    for (const tip of TIPS) tips.push([ids[tip], pts[tip][0], pts[tip][1]]);
  }
  return tips;
}

// ---------------------------------------------------------------------------
// Deteccion de pulsacion por dedo (independiente de la postura de la mano)
// ---------------------------------------------------------------------------
/** Cada dedo se mide como "cuanto esta la punta por debajo de su nudillo", dividido por el
 *  ancho de los nudillos (indice-menique) para que no dependa de la distancia a la camara.
 *  Se compara con su valor en reposo (que se va aprendiendo solo); si lo supera en `thr`,
 *  el dedo esta pulsado. Por mano solo puede entrar el dedo que mas ha bajado. */
class FingerPressDetector {
  constructor(thr = 0.3, confirmFrames = 2) {
    this.thr = thr;
    this.confirmFrames = confirmFrames;
    this.base = new Map();   // id_dedo -> valor en reposo
    this.count = new Map();  // id_dedo -> frames seguidos cumpliendo la condicion
    this.down = new Set();   // dedos pulsados ahora
    this.deltas = {};        // id_dedo -> cuanto ha bajado respecto al reposo (para dibujar)
  }

  reset() {
    this.base.clear();
    this.count.clear();
    this.down.clear();
    this.deltas = {};
  }

  /** Recibe [[lado, puntos]] y devuelve la lista de dedos que ACABAN de pulsarse. */
  update(hands) {
    const hits = [];
    this.deltas = {};
    const seen = new Set();
    for (const [side, pts] of hands) {
      const ids = side === "L" ? LEFT_HAND_IDS : RIGHT_HAND_IDS;
      const scale = Math.max(Math.hypot(pts[5][0] - pts[17][0], pts[5][1] - pts[17][1]), 1.0);
      const drops = new Map();
      for (const [tip, base] of Object.entries(TIP_BASE)) {
        drops.set(ids[tip], (pts[tip][1] - pts[base][1]) / scale);
      }
      for (const [fid, d] of drops) {
        if (!this.base.has(fid)) this.base.set(fid, d);
        this.deltas[fid] = d - this.base.get(fid);
        seen.add(fid);
      }

      let best = null;
      for (const fid of drops.keys()) if (best === null || this.deltas[fid] > this.deltas[best]) best = fid;
      for (const fid of drops.keys()) {
        const delta = this.deltas[fid];
        if (this.down.has(fid)) {
          if (delta < this.thr * 0.5) this.down.delete(fid);   // histeresis: suelta la tecla
        } else if (fid === best && delta > this.thr) {
          const c = (this.count.get(fid) ?? 0) + 1;
          this.count.set(fid, c);
          if (c >= this.confirmFrames) {
            this.down.add(fid);
            hits.push(fid);
          }
          continue;
        }
        this.count.set(fid, 0);
        // el reposo se adapta rapido con el dedo suelto y muy lento si esta pulsado
        const alpha = this.down.has(fid) ? 0.005 : 0.04;
        this.base.set(fid, this.base.get(fid) + alpha * (drops.get(fid) - this.base.get(fid)));
      }
    }
    // mano que desaparece: olvida su calibracion
    for (const fid of [...this.base.keys()]) {
      if (!seen.has(fid)) {
        this.base.delete(fid);
        this.count.delete(fid);
        this.down.delete(fid);
      }
    }
    return hits;
  }
}

// ---------------------------------------------------------------------------
// Records (en el navegador de cada persona)
// ---------------------------------------------------------------------------
function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch { /* sin almacenamiento: el record solo dura la sesion */ }
}

// ---------------------------------------------------------------------------
// Pantalla de inicio, camara y bucle principal
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $("lienzo");
const ctx = canvas.getContext("2d");
const video = $("video");
const startBtn = $("empezar");
const statusEl = $("estado");
const cameraSel = $("camara");
const overlay = $("inicio");

const params = new URLSearchParams(location.search);
const numParam = (name, def, lo, hi) => {
  const v = parseFloat(params.get(name));
  return Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : def;
};
const OPTS = {
  mode: params.get("modo") === "linea" ? "linea" : "dedos",
  thr: numParam("sensibilidad", 0.3, 0.1, 1.0),
  line: numParam("linea", 0.55, 0.1, 0.85),
};

let landmarkerPromise = null;
let piano = null;
let stream = null;
let running = false;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function listCameras() {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    const saved = localStorage.getItem(CAMERA_KEY);
    cameraSel.innerHTML = "";
    cams.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c.deviceId;
      opt.textContent = c.label || `Cámara ${i + 1}`;
      if (c.deviceId && c.deviceId === saved) opt.selected = true;
      cameraSel.appendChild(opt);
    });
    $("fila-camara").hidden = cams.length < 2;
  } catch { /* sin lista de camaras: se usa la predeterminada */ }
}

async function openCamera() {
  const deviceId = cameraSel.value || undefined;
  const video_ = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  if (deviceId) video_.deviceId = { exact: deviceId };
  else video_.facingMode = "user";
  const s = await navigator.mediaDevices.getUserMedia({ video: video_, audio: false });
  video.srcObject = s;
  await video.play();
  return s;
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

function cameraError(e) {
  const name = e && e.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "No hay permiso para usar la cámara. Permítelo en el icono de la barra de direcciones y vuelve a intentarlo.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No se encontró ninguna cámara.";
  if (name === "NotReadableError") return "La cámara está ocupada por otra aplicación (Teams, Zoom…). Ciérrala y vuelve a intentarlo.";
  return `No se pudo abrir la cámara (${name || e}).`;
}

async function start() {
  startBtn.disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error("Este navegador no permite usar la cámara (hace falta https)."), { name: "Unsupported" });
    }
    if (!piano) piano = new Piano();   // el audio solo se puede activar tras un clic
    if (piano.ctx.state === "suspended") await piano.ctx.resume();
    setStatus("Abriendo la cámara…");
    try {
      stream = await openCamera();
    } catch (e) {
      setStatus(e.name === "Unsupported" ? e.message : cameraError(e), true);
      startBtn.disabled = false;
      return;
    }
    if (cameraSel.value) {
      try { localStorage.setItem(CAMERA_KEY, cameraSel.value); } catch { /* da igual */ }
    }
    listCameras();   // con el permiso ya concedido aparecen los nombres de las camaras
    setStatus("Cargando el modelo de manos…");
    let landmarker;
    try {
      landmarker = await landmarkerPromise;
    } catch (e) {
      landmarkerPromise = createLandmarker();   // se reintenta en el proximo clic
      throw new Error(`No se pudo cargar el modelo de manos. Revisa la conexión a internet. (${e.message || e})`);
    }
    setStatus("");
    overlay.hidden = true;
    runGame(landmarker);
  } catch (e) {
    stopCamera();
    setStatus(e.message || String(e), true);
    startBtn.disabled = false;
  }
}

function showStart(farewell) {
  stopCamera();
  running = false;
  overlay.hidden = false;
  startBtn.disabled = false;
  startBtn.textContent = farewell ? "Volver a tocar" : "Empezar";
  $("despedida").hidden = !farewell;
  setStatus("");
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function runGame(landmarker) {
  running = true;
  const ui = new PianoUI(ctx, SONGS[0].keys, FINGER_NAMES, COLORS, { L: LEFT_HAND_IDS, R: RIGHT_HAND_IDS });
  const gestures = new HandGestures();
  const records = loadRecords();

  let mode = OPTS.mode;
  const detector = new FingerPressDetector(OPTS.thr);
  let lineFrac = OPTS.line;
  const hysteresis = 15;   // pixeles que el dedo debe subir sobre la linea para "soltar" la tecla
  const confirmFrames = 2; // frames seguidos que se exige al candidato (evita notas falsas)
  let active = null;       // dedo cuya nota esta sonando (modo linea)
  let candidate = null, candCount = 0;
  let showGuide = true, songPos = 0;
  let lastTs = 0, lastVideoTime = -1;
  let landmarks = [];      // ultimo resultado (puntos normalizados, ya en espejo)
  let activeSet = new Set();
  let frameTimes = [];

  // estados: "menu" (carrusel) -> "cuenta" (3, 2, 1 mientras se calibran los dedos) -> "tocar"
  let state = "menu";
  let menuPos = 0;         // posicion del carrusel (sin limite; la cancion es SONGS[menuPos % n])
  let songInfo = SONGS[0];
  let song = songInfo.notes;
  let countT0 = 0;
  let saved = false;
  let quitT = null;        // instante en que se pidio salir (se muestra una despedida)

  const songAt = (p) => SONGS[((p % SONGS.length) + SONGS.length) % SONGS.length];
  const playKey = (fid, info = songInfo) => piano.play(info.keys[fid][1]);
  const chord = (...midis) => midis.forEach((m) => piano.play(m));

  /** Aplica un evento: "next" / "prev" / "select" (carrusel), "menu" (volver al carrusel),
   *  "repeat" (repetir la cancion actual con su cuenta atras) o "quit" (salir). */
  function handle(event) {
    if (event === "quit") {
      if (quitT === null) {
        quitT = now_();
        chord(55, 59, 62);       // acorde de Sol mayor, grave: despedida
      }
    } else if ((event === "next" || event === "prev") && state === "menu") {
      menuPos += event === "next" ? 1 : -1;
      const nxt = songAt(menuPos);
      playKey(nxt.notes[0], nxt);                                    // anticipo: su primera nota
    } else if (event === "select" && state === "menu") {
      songInfo = songAt(menuPos);
      song = songInfo.notes; songPos = 0; saved = false;
      ui.songPicked();
      ui.resetSong();
      ui.songTitle = songInfo.title;
      ui.setKeys(songInfo.keys);
      detector.reset();
      active = null; candidate = null; candCount = 0;
      chord(60, 64, 67);         // acorde de Do mayor: cancion elegida
      state = "cuenta"; countT0 = now_();
    } else if (event === "menu" && state !== "menu") {
      gestures.reset();
      state = "menu";
    } else if (event === "repeat" && state !== "menu") {
      songPos = 0; saved = false;
      ui.resetSong();
      detector.reset();
      active = null; candidate = null; candCount = 0;
      chord(60, 64, 67);
      state = "cuenta"; countT0 = now_();
    }
  }

  function onKey(e) {
    if (!running || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let used = true;
    if (k === "q") handle("quit");
    else if (k === "f") toggleFullscreen();
    else if (k === "n") ui.snowOn = !ui.snowOn;
    else if (state === "menu") {
      if (k === "Escape") handle("quit");
      else if (k === "ArrowLeft" || k === "a") handle("prev");
      else if (k === "ArrowRight" || k === "d") handle("next");
      else if (k === "Enter" || k === " ") handle("select");
      else used = false;
    } else {
      if (k === "Escape" || k === "c") handle("menu");
      else if (k === "w" || k === "ArrowUp") {
        if (mode === "dedos") detector.thr = Math.max(0.1, detector.thr - 0.05);
        else lineFrac = Math.max(0.1, lineFrac - 0.02);
      } else if (k === "s" || k === "ArrowDown") {
        if (mode === "dedos") detector.thr = Math.min(1.0, detector.thr + 0.05);
        else lineFrac = Math.min(0.85, lineFrac + 0.02);
      } else if (k === "m") {
        mode = mode === "dedos" ? "linea" : "dedos";
        detector.reset();
        active = null; candidate = null; candCount = 0;
      } else if (k === "g") showGuide = !showGuide;
      else if (k === "r") handle("repeat");
      else used = false;
    }
    if (used) e.preventDefault();
  }

  /** En pantallas tactiles: tocar a los lados cambia de cancion y en el centro la elige. */
  function onPointer(e) {
    if (!running || state !== "menu") return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.32) handle("prev");
    else if (x > 0.68) handle("next");
    else handle("select");
  }

  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPointer);

  function cleanup(farewell) {
    window.removeEventListener("keydown", onKey);
    canvas.removeEventListener("pointerdown", onPointer);
    showStart(farewell);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    ui.dpr = canvas.width / w;
    ui.w = w;
    ui.h = h;
    return [w, h];
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const [W, H] = resize();

    // --- deteccion: solo cuando la camara entrega un frame nuevo ---
    let newFrame = false;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const ts = Math.max(Math.round(performance.now()), lastTs + 1);
      lastTs = ts;
      const result = landmarker.detectForVideo(video, ts);
      // efecto espejo: mas natural para tocar
      landmarks = (result.landmarks || []).map((lms) => lms.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })));
      newFrame = true;
      const t = performance.now();
      frameTimes.push(t);
      while (frameTimes.length && t - frameTimes[0] > 1000) frameTimes.shift();
      ui.fps = frameTimes.length;
    }

    // --- imagen de la camara ajustada al lienzo, sin deformarla ---
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const camAspect = vw / vh;
    const k = Math.min(W / vw, H / vh);
    const sw = Math.trunc(vw * k), sh = Math.trunc(vh * k);
    const ox = Math.trunc((W - sw) / 2), oy = Math.trunc((H - sh) / 2);
    if (video.readyState >= 2) {
      ctx.save();
      ctx.translate(ox + sw, oy);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, sw, sh);
      ctx.restore();
    }

    const lineY = oy + Math.trunc(sh * lineFrac);
    const hands = getHands(landmarks, sw, sh, ox, oy);
    const now = now_();
    const finished = state === "tocar" && songPos >= song.length;

    // gestos: en el menu (deslizar / puno) y al terminar la cancion
    // (puno = elegir otra cancion, pulgar arriba = repetirla); pulgar abajo = salir en ambos
    let fistPt = null;
    if ((state === "menu" || finished) && quitT === null) {
      if (newFrame) {
        const poses = finished ? ["fist", "thumb", "down"] : ["fist", "down"];
        let event = gestures.update(landmarks, now, camAspect, poses);
        if (finished && event === "select") event = "menu";
        if (event) handle(event);
      }
      if (gestures.palm !== null) fistPt = [Math.trunc(ox + gestures.palm[0] * sw), Math.trunc(oy + gestures.palm[1] * sh)];
    }

    if (state === "menu") {
      ui.renderMenu({ hands, songs: SONGS, pos: menuPos, fistProgress: gestures.progress, fistPt,
        records, connections: HAND_CONNECTIONS, pose: gestures.shownPose });
    } else {
      const tips = getFingertips(hands);
      const lowest = tips.length ? tips.reduce((a, b) => (b[2] > a[2] ? b : a)) : null;

      let hits = [];
      if (newFrame) {
        if (mode === "dedos") {
          // --- 1-2) cada dedo respecto a su propia mano ---
          hits = detector.update(hands);
          activeSet = detector.down;
        } else {
          // --- 1) dedo mas bajo de las dos manos ---
          const pressed = lowest && lowest[2] > lineY ? lowest[0] : null;
          // --- 2) disparo de notas con confirmacion e histeresis ---
          if (pressed !== null) {
            candCount = pressed === candidate ? candCount + 1 : 1;
            candidate = pressed;
            if (pressed !== active && candCount >= confirmFrames) {
              hits.push(pressed);
              active = pressed;
            }
          } else {
            candidate = null; candCount = 0;
            if (active !== null) {
              const tip = tips.find((t) => t[0] === active);
              if (!tip || tip[2] < lineY - hysteresis || (lowest && lowest[0] !== active)) {
                active = null;   // tecla soltada: el mismo dedo puede volver a sonar
              }
            }
          }
          activeSet = active !== null ? new Set([active]) : new Set();
        }
      }

      let countdown = null;
      if (state === "cuenta") {
        countdown = COUNTDOWN - (now - countT0);
        hits = [];               // durante la cuenta atras los dedos solo se calibran
        if (countdown <= 0) { state = "tocar"; countdown = null; }
      }

      for (const fid of hits) {
        playKey(fid);
        const guided = showGuide && songPos < song.length;   // cuenta para racha / precision
        const correct = songPos < song.length && song[songPos] === fid;
        if (correct) songPos += 1;
        const tip = tips.find((t) => t[0] === fid);
        ui.noteHit(fid, tip ? [tip[1], tip[2]] : null, correct, guided);
      }

      // cancion terminada: guarda el record de precision
      if (songPos >= song.length && !saved) {
        saved = true;
        const prec = ui.precision();
        if (prec !== null && prec > (records[songInfo.title] ?? -1)) {
          records[songInfo.title] = prec;
          ui.newRecord = true;
          saveRecords(records);
        }
      }

      // --- 3) dibujo ---
      const target = showGuide && songPos < song.length ? song[songPos] : null;
      ui.render({ hands, tips, active: activeSet, target, mode, thr: detector.thr, deltas: detector.deltas,
        lowest, lineY, song, songPos, showGuide, connections: HAND_CONNECTIONS, countdown,
        fist: finished ? [gestures.progress, fistPt, gestures.shownPose] : null });
    }

    if (quitT !== null) {   // despedida de 1 s y vuelta a la pantalla de inicio
      const q = Math.min((now - quitT) / 1.0, 1.0);
      ui.drawFarewell(q);
      if (q >= 1.0) cleanup(true);
    }
  }

  requestAnimationFrame(loop);
}

// el modelo se empieza a descargar en cuanto se abre la pagina
landmarkerPromise = createLandmarker();
landmarkerPromise.catch(() => {});
listCameras();
startBtn.addEventListener("click", start);
setStatus("");
