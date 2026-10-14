"""
Canciones del piano de dedos.

Todas estan en Do mayor y caben en las 10 notas del piano (Sol3 .. Si4, solo teclas blancas),
asi cada nota tiene su dedo. Las notas se escriben en notacion inglesa con octava (G3 = Sol3,
C4 = Do4, ...) y se convierten a indices de NOTES (0 = Sol3 ... 9 = Si4).

Para anadir una cancion basta con agregar un diccionario a SONGS.
"""

NOTE_INDEX = {"G3": 0, "A3": 1, "B3": 2, "C4": 3, "D4": 4, "E4": 5, "F4": 6, "G4": 7, "A4": 8, "B4": 9}


def _notes(text):
    return [NOTE_INDEX[n] for n in text.split()]


SONGS = [
    {
        "title": "Jingle Bells",
        "subtitle": "Tradicional · Navidad",
        "difficulty": 3,
        "notes": _notes(
            # estrofa 1
            "G3 E4 D4 C4 G3  G3 E4 D4 C4 A3  A3 F4 E4 D4 B3  G4 G4 F4 D4 E4 "
            # estribillo 1
            "E4 E4 E4  E4 E4 E4  E4 G4 C4 D4 E4  F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4 "
            # estrofa 2
            "G3 E4 D4 C4 G3  G3 E4 D4 C4 A3  A3 F4 E4 D4 G4 G4 G4 G4 A4 G4 F4 D4 C4 "
            # estribillo 2
            "E4 E4 E4  E4 E4 E4  E4 G4 C4 D4 E4  F4 F4 F4 F4 F4 E4 E4 E4 G4 G4 F4 D4 C4"),
    },
    {
        "title": "Himno de la alegría",
        "subtitle": "Beethoven · 9.ª sinfonía",
        "difficulty": 2,
        "notes": _notes(
            "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 "
            "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4 "
            "D4 D4 E4 C4 D4 E4 F4 E4 C4 D4 E4 F4 E4 D4 C4 D4 G3 "
            "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4"),
    },
    {
        "title": "Estrellita, ¿dónde estás?",
        "subtitle": "Canción infantil",
        "difficulty": 1,
        "notes": _notes(
            "C4 C4 G4 G4 A4 A4 G4  F4 F4 E4 E4 D4 D4 C4 "
            "G4 G4 F4 F4 E4 E4 D4  G4 G4 F4 F4 E4 E4 D4 "
            "C4 C4 G4 G4 A4 A4 G4  F4 F4 E4 E4 D4 D4 C4"),
    },
    {
        "title": "Cumpleaños feliz",
        "subtitle": "Tradicional",
        "difficulty": 2,
        "notes": _notes(
            "G3 G3 A3 G3 C4 B3  G3 G3 A3 G3 D4 C4 "
            "G3 G3 G4 E4 C4 B3 A3  F4 F4 E4 C4 D4 C4"),
    },
    {
        "title": "Martinillo",
        "subtitle": "Canon francés · Frère Jacques",
        "difficulty": 2,
        "notes": _notes(
            "C4 D4 E4 C4  C4 D4 E4 C4  E4 F4 G4  E4 F4 G4 "
            "G4 A4 G4 F4 E4 C4  G4 A4 G4 F4 E4 C4  C4 G3 C4  C4 G3 C4"),
    },
    {
        "title": "María tenía un corderito",
        "subtitle": "Canción infantil · Mary Had a Little Lamb",
        "difficulty": 1,
        "notes": _notes(
            "E4 D4 C4 D4 E4 E4 E4  D4 D4 D4  E4 G4 G4 "
            "E4 D4 C4 D4 E4 E4 E4  E4 D4 D4 E4 D4 C4"),
    },
]
