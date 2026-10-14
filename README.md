# Piano de dedos

Piano de 10 notas que se toca con los dedos frente a la cámara web. Cada dedo es una nota
(Sol3 – Si4), suficiente para tocar **Jingle Bells**, que viene incluida como canción guía.

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
| R | Reiniciar la canción y las estadísticas |
| Q / Esc | Salir |

## Archivos

- `piano_dedos.py`: cámara, detección de manos y dedos, sonido y bucle principal.
- `interfaz.py`: toda la parte gráfica (paneles, teclado, guía, efectos).
