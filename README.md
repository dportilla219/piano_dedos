# Piano de dedos

Piano de 10 notas que se toca con los dedos frente a la cámara web. Cada dedo es una nota
(cada canción elige sus 10 teclas). Incluye 6 canciones guía (villancicos y clásicos) que se eligen
con gestos de la mano.

Detecta las manos con el modelo preentrenado **Hand Landmarker de MediaPipe** y sintetiza el
sonido de piano con numpy + pygame.

## Requisitos

- Python 3.11
- Una cámara web

```bash
py -3.11 -m pip install -r requirements.txt
```

El modelo `hand_landmarker.task` se descarga automáticamente la primera vez.

## Ejecutar

- **VS Code:** abrir la carpeta y pulsar **F5** (configuración "Piano de dedos").
- **Terminal:** `py -3.11 piano_dedos.py`
- **Windows:** doble clic en `iniciar_piano.bat`

Opciones: `--camara 1`, `--modo linea`, `--sensibilidad 0.25`, `--linea 0.6`.

## Elegir canción

Al iniciar aparece un carrusel con las canciones (nombre, número de notas, dificultad y récord):

- **Desliza la mano** a la izquierda / derecha para cambiar de canción.
- **Mantén el puño cerrado** un momento para elegirla. Empieza una cuenta atrás de 3 s mientras
  se calibran los dedos.
- Al terminar la canción: **pulgar arriba** (mantenido) para repetirla, o **puño** para volver
  al carrusel.
- Con el teclado: flechas ← → (o A / D) y Enter.
- **Pulgar abajo** mantenido 1,5 s (en el carrusel o al terminar una canción) cierra la aplicación.

Canciones (villancicos de una Navidad tradicional colombiana y clásicos):

| Canción | Notas | Teclas |
|---|---|---|
| Jingle Bells | 92 | Sol3–Si4 |
| Himno de la alegría | 62 | Sol3–Si4 |
| Cumpleaños feliz | 25 | Sol3–Si4 |
| Noche de paz | 46 | Do4–Mi5 |
| Los peces en el río | 76 | Mi4–Fa5 (con Sol#) |
| El tamborilero | 65 | Sol3–Si4 |

Cada canción trae su propio teclado de 10 teclas (una por dedo), generado a partir de las notas
que usa; admite teclas negras, pero no más de 10 notas distintas. Para añadir más, edita
`canciones.py`. Las transcripciones de los villancicos vienen de flauta-dulce.com (transpuestas
a Do mayor cuando era posible).

El récord de precisión de cada canción se guarda en `records.json`.

## Cómo se toca

- **Modo dedos** (por defecto): pon las manos con los dedos hacia la cámara. Cada dedo se mide
  respecto a su propio nudillo; al bajarlo o doblarlo suena su nota. El reposo se calibra solo.
- **Modo línea**: suena el dedo que está más abajo al cruzar una línea horizontal.

| Tecla | Acción |
|---|---|
| M | Cambiar de modo |
| W / S | Sensibilidad (modo dedos) o mover la línea (modo línea) |
| G | Mostrar / ocultar la guía de la canción |
| N | Nieve on / off |
| R | Repetir la canción (con cuenta atrás) |
| C / Esc | Volver al carrusel de canciones |
| Q | Salir (Esc también sale desde el carrusel) |

## Archivos

- `piano_dedos.py`: cámara, detección de manos y dedos, sonido y bucle principal.
- `interfaz.py`: toda la parte gráfica (carrusel, paneles, teclado, guía, efectos).
- `gestos.py`: gestos de la mano para el menú (deslizar y puño).
- `canciones.py`: las canciones.
