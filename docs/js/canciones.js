/*
Canciones del piano de dedos (villancicos de una Navidad tradicional colombiana).
Version web de canciones.py: mismas melodias y mismo teclado de 10 teclas por cancion.

Cada cancion trae su propio teclado de 10 teclas, una por dedo, generado a partir de las notas
que usa: sus notas, los huecos entre ellas rellenos con teclas blancas (para que parezca un trozo
de piano) y, si sobran dedos, teclas blancas por encima. Admite teclas negras (por ejemplo Sol#),
pero una cancion no puede usar mas de 10 notas distintas.

Las notas se escriben en notacion inglesa con octava: G3 = Sol3, C4 = Do4, G#4 = Sol#4, ...
Fuente de las transcripciones: flauta-dulce.com.
*/
export const N_KEYS = 10;
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LABELS = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);

export function toMidi(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`nota no valida: ${name}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + { "#": 1, b: -1, "": 0 }[m[2]];
}

export function label(midi) {
  return `${LABELS[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function isBlack(midi) {
  return !WHITE.has(midi % 12);
}

/** 10 teclas (midi, de grave a agudo) que contienen todas las notas usadas. */
function keyboard(usedList) {
  const used = [...new Set(usedList)].sort((a, b) => a - b);
  if (used.length > N_KEYS) throw new Error(`usa ${used.length} notas distintas y solo hay ${N_KEYS} dedos`);
  const keys = new Set(used);
  const gaps = [];
  for (let m = used[0]; m < used[used.length - 1]; m++) {
    if (WHITE.has(m % 12) && !keys.has(m)) gaps.push(m);
  }
  if (keys.size + gaps.length <= N_KEYS) gaps.forEach((m) => keys.add(m));
  let hi = Math.max(...keys);
  while (keys.size < N_KEYS) {        // dedos sobrantes: teclas blancas por encima
    hi += 1;
    if (WHITE.has(hi % 12)) keys.add(hi);
  }
  return [...keys].sort((a, b) => a - b);
}

function song(title, subtitle, difficulty, notes) {
  const midis = notes.trim().split(/\s+/).map(toMidi);
  let keys;
  try {
    keys = keyboard(midis);
  } catch (e) {
    throw new Error(`'${title}': ${e.message}`);
  }
  return {
    title, subtitle, difficulty,
    notes: midis.map((m) => keys.indexOf(m)),
    keys: keys.map((m) => [label(m), m]),
  };
}

export const SONGS = [
  song("Jingle Bells", "Tradicional · Navidad", 3,
    // estrofa 1
    "G3 E4 D4 C4 G3  G3 E4 D4 C4 A3  A3 F4 E4 D4 B3  G4 G4 F4 D4 E4 " +
    // estribillo 1
    "E4 E4 E4  E4 E4 E4  E4 G4 C4 D4 E4  F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4 " +
    // estrofa 2
    "G3 E4 D4 C4 G3  G3 E4 D4 C4 A3  A3 F4 E4 D4 G4 G4 G4 G4 A4 G4 F4 D4 C4 " +
    // estribillo 2
    "E4 E4 E4  E4 E4 E4  E4 G4 C4 D4 E4  F4 F4 F4 F4 F4 E4 E4 E4 G4 G4 F4 D4 C4"),

  song("Himno de la alegría", "Beethoven · 9.ª sinfonía", 2,
    "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 " +
    "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4 " +
    "D4 D4 E4 C4 D4 E4 F4 E4 C4 D4 E4 F4 E4 D4 C4 D4 G3 " +
    "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4"),

  song("Cumpleaños feliz", "Tradicional", 2,
    "G3 G3 A3 G3 C4 B3  G3 G3 A3 G3 D4 C4 " +
    "G3 G3 G4 E4 C4 B3 A3  F4 F4 E4 C4 D4 C4"),

  // La melodia original va de Do4 a Fa5 (11 notas distintas): el unico Fa5 ("...en el cielo")
  // se toca como Mi5 para que quepa en los 10 dedos.
  song("Noche de paz", "Franz Gruber · Navidad", 2,
    "G4 A4 G4 E4  G4 A4 G4 E4  D5 D5 B4  C5 C5 G4 " +
    "A4 A4 C5 B4 A4  G4 A4 G4 E4  A4 A4 C5 B4 A4  G4 A4 G4 E4 " +
    "D5 D5 E5 D5 B4  C5 E5  C5 G4 E4  G4 F4 D4  C4"),

  // En La menor: el Sol# es una tecla negra (no se puede transponer a solo teclas blancas).
  song("Los peces en el río", "Villancico tradicional", 2,
    // estrofa: "La Virgen se está peinando..."
    "C5 C5 C5 C5 B4 A4 B4 A4 B4 G#4 E4 " +
    "D5 D5 D5 D5 C5 B4 C5 B4 C5 B4 A4 " +
    // estribillo: "Pero mira cómo beben los peces en el río..."
    "A4 B4 C5 C5 C5 C5 C5 C5  C5 D5 C5 D5 C5 B4 B4 " +
    "B4 C5 D5 C5 D5 C5 B4 B4  A4 G#4 A4 B4 C5 A4 A4 " +
    "C5 C5 C5 C5 C5 C5 D5 C5 D5 C5 B4 " +
    "C5 D5 C5 D5 C5 B4 B4 A4 G#4 A4 B4 C5 A4"),

  // Transpuesto de Fa mayor a Do mayor.
  song("El tamborilero", "Villancico · Ropopompom", 2,
    "G3 A3 B3 B3 B3 C4 B3 C4 B3 " +
    "G3 G3 A3 B3 B3 B3 B3 C4 B3 C4 B3 " +
    "A3 B3 C4 D4 D4 D4 D4 E4 D4 C4 B3 A3 " +
    "A3 B3 C4 D4 D4 D4 E4 F4 E4 D4 C4 " +
    "E4 D4 C4 B3  D4 C4 B3 A3 " +
    "G3 A3 B3 B3 B3 B3 C4 B3 C4 B3  A3 G3 A3 G3"),
];
