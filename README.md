# Piano de dedos

Piano de 10 notas que se toca con los dedos frente a la cámara web. Cada dedo es una nota
(cada canción elige sus 10 teclas). Incluye 6 canciones guía (villancicos y clásicos) que se eligen
con gestos de la mano.

Detecta las manos con el modelo preentrenado **Hand Landmarker de MediaPipe** y sintetiza el
sonido de piano con numpy + pygame.

## Versión web (sin instalar nada)

En la carpeta `docs/` hay una versión para el navegador con las mismas canciones, gestos e
interfaz. Se abre en **https://dportilla219.github.io/piano_dedos/** desde cualquier ordenador con
cámara web (Chrome, Edge o Firefox): basta con pulsar *Empezar* y permitir la cámara.

- La detección de manos (MediaPipe) se hace en el navegador: la imagen no sale del equipo.
- Los récords se guardan en el navegador de cada persona.
- Opciones en la URL, como los argumentos de la versión de Python:
  `?modo=linea`, `?sensibilidad=0.25`, `?linea=0.6` (se combinan con `&`).
- `F` pone la pantalla completa. "Salir" (Q o pulgar abajo) vuelve a la pantalla de inicio.

Para probarla en local hace falta un servidor (abrir el `index.html` con doble clic no deja usar
la cámara): `python -m http.server 8000 --directory docs` y abrir http://localhost:8000.

Se publica con GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / `/docs`*.

Archivos: `docs/index.html` (pantalla de inicio) y `docs/js/` (`app.js`, `interfaz.js`,
`gestos.js`, `canciones.js`, equivalentes a los `.py`). Si cambias una canción en `canciones.py`,
cámbiala también en `docs/js/canciones.js`.

## Requisitos (versión de Python)

- **Windows 10/11.** La cámara se abre con los backends MSMF/DirectShow de Windows y las fuentes
  se cargan de `C:\Windows\Fonts` (Segoe UI o Arial).
- **Python 3.11** (probado con 3.11.9). Sirve el instalador de python.org o el de la Microsoft Store.
- Una **cámara web** y altavoces o audífonos.
- **Conexión a internet la primera vez**, para descargar el modelo de manos (unos 7,5 MB).

Librerías (en `requirements.txt`): `mediapipe>=0.10.14`, `opencv-python`, `pygame`, `numpy` y
`pillow`.

## Instalación

1. Instala Python 3.11. Si usas el instalador de python.org, marca **"Add python.exe to PATH"**.
   Para comprobarlo, abre una terminal (PowerShell) y ejecuta:

   ```powershell
   python --version      # debe mostrar Python 3.11.x
   ```

2. Clona o descarga este repositorio y entra en la carpeta:

   ```powershell
   git clone https://github.com/dportilla219/piano_dedos.git
   cd piano_dedos
   ```

3. Instala las dependencias:

   ```powershell
   python -m pip install -r requirements.txt
   ```

   Las librerías tienen que quedar instaladas en el mismo Python que elijas en VS Code. Si tienes
   varias versiones de Python, lo más seguro es ejecutar este comando en la terminal integrada de
   VS Code (`Ctrl+ñ`) después de elegir el intérprete.

4. La primera vez que se ejecuta, el programa descarga solo el modelo `hand_landmarker.task` de
   MediaPipe y lo deja en la carpeta del proyecto. No se sube a git (ver `.gitignore`).

## Ejecutar

La forma recomendada es **VS Code con F5**:

1. Instala la extensión **Python** de Microsoft en VS Code.
2. Abre la carpeta del proyecto (*Archivo → Abrir carpeta*).
3. Elige el intérprete de Python 3.11: `Ctrl+Shift+P` → *Python: Select Interpreter*.
4. Abre `piano_dedos.py` y pulsa **F5**. Se usa la configuración "Piano de dedos" de
   `.vscode/launch.json`, que siempre ejecuta `piano_dedos.py` desde la carpeta del proyecto.

Otras formas:

- **Terminal:** `python piano_dedos.py` (o `py -3.11 piano_dedos.py` si tienes el lanzador `py`).
- **`iniciar_piano.bat`** (doble clic): ejecuta `py -3.11`, así que solo sirve si tienes instalado el
  lanzador `py`, que viene con el instalador de python.org.

Opciones de línea de comandos (desde la terminal, o en `"args"` de `.vscode/launch.json` para
usarlas con F5, por ejemplo `"args": ["--camara", "1"]`):

| Opción | Valor por defecto | Para qué sirve |
|---|---|---|
| `--camara N` | `0` | Índice de la cámara si hay varias |
| `--modo dedos\|linea` | `dedos` | Modo de juego inicial |
| `--sensibilidad X` | `0.30` | Modo dedos: cuánto debe bajar un dedo para sonar (menor = más sensible) |
| `--linea X` | `0.55` | Modo línea: altura de la línea (0 = arriba, 1 = abajo) |

Ejemplo: `python piano_dedos.py --camara 1 --sensibilidad 0.25`

### Problemas frecuentes

- **"No se pudo abrir la cámara 0"**: cierra otras apps que usen la cámara (Teams, Zoom, el
  navegador) o prueba con `--camara 1`. Revisa también *Configuración → Privacidad → Cámara*.
- **`'py' no se reconoce como un comando`**: usa `python` en lugar de `py -3.11`.
- **`python` abre la Microsoft Store**: Python no está instalado o no está en el PATH; repite el
  paso 1 de la instalación.
- **Falla la descarga del modelo**: revisa la conexión a internet o descarga
  [hand_landmarker.task](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task)
  a mano y guárdalo en la carpeta del proyecto.

## Elegir canción

Al iniciar aparece un carrusel con las canciones (nombre, número de notas, dificultad y récord):

- **Desliza la mano** a la izquierda / derecha para cambiar de canción.
- **Mantén el puño cerrado** un momento para elegirla. Empieza una cuenta atrás de 3 s mientras
  se calibran los dedos.
- Al terminar la canción: **pulgar arriba** (mantenido) para repetirla, o **puño** para volver
  al carrusel.
- Con el teclado: flechas ← → (o A / D) para cambiar y Enter (o espacio) para elegir.
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
| W / S o ↑ / ↓ | Sensibilidad (modo dedos) o mover la línea (modo línea) |
| G | Mostrar / ocultar la guía de la canción |
| N | Nieve on / off (también en el carrusel) |
| R | Repetir la canción (con cuenta atrás) |
| C / Esc | Volver al carrusel de canciones |
| Q | Salir (Esc también sale desde el carrusel) |

## Archivos

- `piano_dedos.py`: cámara, detección de manos y dedos, sonido y bucle principal.
- `interfaz.py`: toda la parte gráfica (carrusel, paneles, teclado, guía, efectos).
- `gestos.py`: gestos de la mano para el menú (deslizar, puño, pulgar arriba y pulgar abajo).
- `canciones.py`: las canciones.
- `requirements.txt`: dependencias de Python.
- `iniciar_piano.bat`: lanzador para Windows (doble clic).
- `.vscode/`: configuración para ejecutar con F5 desde VS Code.
- `hand_landmarker.task` y `records.json`: se crean al usar el programa y no se suben a git.
