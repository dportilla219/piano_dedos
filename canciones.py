"""
Canciones del piano de dedos (villancicos de una Navidad tradicional colombiana).

Cada cancion trae su propio teclado de 10 teclas, una por dedo, generado a partir de las notas
que usa: sus notas, los huecos entre ellas rellenos con teclas blancas (para que parezca un trozo
de piano) y, si sobran dedos, teclas blancas por encima. Admite teclas negras (por ejemplo Sol#),
pero una cancion no puede usar mas de 10 notas distintas.

Las notas se escriben en notacion inglesa con octava: G3 = Sol3, C4 = Do4, G#4 = Sol#4, ...
Las melodias de flauta dulce se han transpuesto a Do mayor cuando era posible (solo teclas
blancas, que son mas faciles de leer). Fuente de las transcripciones: flauta-dulce.com.
"""
import re

N_KEYS = 10
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_LABELS = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"]
_WHITE = {0, 2, 4, 5, 7, 9, 11}


def to_midi(name):
    m = re.fullmatch(r"([A-G])([#b]?)(\d)", name)
    if not m:
        raise ValueError(f"nota no valida: {name}")
    return 12 * (int(m.group(3)) + 1) + _PC[m.group(1)] + {"#": 1, "b": -1, "": 0}[m.group(2)]


def label(midi):
    return f"{_LABELS[midi % 12]}{midi // 12 - 1}"


def is_black(midi):
    return midi % 12 not in _WHITE


def _keyboard(used):
    """10 teclas (midi, de grave a agudo) que contienen todas las notas usadas."""
    used = sorted(set(used))
    if len(used) > N_KEYS:
        raise ValueError(f"usa {len(used)} notas distintas y solo hay {N_KEYS} dedos")
    keys = set(used)
    gaps = [m for m in range(used[0], used[-1]) if m % 12 in _WHITE and m not in keys]
    if len(keys) + len(gaps) <= N_KEYS:
        keys |= set(gaps)
    hi = max(keys)
    while len(keys) < N_KEYS:          # dedos sobrantes: teclas blancas por encima
        hi += 1
        if hi % 12 in _WHITE:
            keys.add(hi)
    return sorted(keys)


def _song(title, subtitle, difficulty, notes):
    midis = [to_midi(n) for n in notes.split()]
    try:
        keys = _keyboard(midis)
    except ValueError as e:
        raise ValueError(f"'{title}': {e}") from None
    return {"title": title, "subtitle": subtitle, "difficulty": difficulty,
            "notes": [keys.index(m) for m in midis],
            "keys": [(label(m), m) for m in keys]}


SONGS = [
    _song("Jingle Bells", "Tradicional · Navidad", 3,
          # estrofa 1
          "G3 E4 D4 C4 G3  G3 E4 D4 C4 A3  A3 F4 E4 D4 B3  G4 G4 F4 D4 E4 "
          # estribillo 1
          "E4 E4 E4  E4 E4 E4  E4 G4 C4 D4 E4  F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4 "
          # estrofa 2
          "G3 E4 D4 C4 G3  G3 E4 D4 C4 A3  A3 F4 E4 D4 G4 G4 G4 G4 A4 G4 F4 D4 C4 "
          # estribillo 2
          "E4 E4 E4  E4 E4 E4  E4 G4 C4 D4 E4  F4 F4 F4 F4 F4 E4 E4 E4 G4 G4 F4 D4 C4"),

    _song("Himno de la alegría", "Beethoven · 9.ª sinfonía", 2,
          "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 "
          "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4 "
          "D4 D4 E4 C4 D4 E4 F4 E4 C4 D4 E4 F4 E4 D4 C4 D4 G3 "
          "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4"),

    _song("Cumpleaños feliz", "Tradicional", 2,
          "G3 G3 A3 G3 C4 B3  G3 G3 A3 G3 D4 C4 "
          "G3 G3 G4 E4 C4 B3 A3  F4 F4 E4 C4 D4 C4"),

    # La melodia original va de Do4 a Fa5 (11 notas distintas): el unico Fa5 ("...en el cielo")
    # se toca como Mi5 para que quepa en los 10 dedos.
    _song("Noche de paz", "Franz Gruber · Navidad", 2,
          "G4 A4 G4 E4  G4 A4 G4 E4  D5 D5 B4  C5 C5 G4 "
          "A4 A4 C5 B4 A4  G4 A4 G4 E4  A4 A4 C5 B4 A4  G4 A4 G4 E4 "
          "D5 D5 E5 D5 B4  C5 E5  C5 G4 E4  G4 F4 D4  C4"),

    # En La menor: el Sol# es una tecla negra (no se puede transponer a solo teclas blancas).
    _song("Los peces en el río", "Villancico tradicional", 2,
          # estrofa: "La Virgen se está peinando..."
          "C5 C5 C5 C5 B4 A4 B4 A4 B4 G#4 E4 "
          "D5 D5 D5 D5 C5 B4 C5 B4 C5 B4 A4 "
          # estribillo: "Pero mira cómo beben los peces en el río..."
          "A4 B4 C5 C5 C5 C5 C5 C5  C5 D5 C5 D5 C5 B4 B4 "
          "B4 C5 D5 C5 D5 C5 B4 B4  A4 G#4 A4 B4 C5 A4 A4 "
          "C5 C5 C5 C5 C5 C5 D5 C5 D5 C5 B4 "
          "C5 D5 C5 D5 C5 B4 B4 A4 G#4 A4 B4 C5 A4"),

    # Transpuesto de Fa mayor a Do mayor.
    _song("El tamborilero", "Villancico · Ropopompom", 2,
          "G3 A3 B3 B3 B3 C4 B3 C4 B3 "
          "G3 G3 A3 B3 B3 B3 B3 C4 B3 C4 B3 "
          "A3 B3 C4 D4 D4 D4 D4 E4 D4 C4 B3 A3 "
          "A3 B3 C4 D4 D4 D4 E4 F4 E4 D4 C4 "
          "E4 D4 C4 B3  D4 C4 B3 A3 "
          "G3 A3 B3 B3 B3 B3 C4 B3 C4 B3  A3 G3 A3 G3"),
]
