# Paquete de teoría y motor — Bebop Targeting (Jaime)
Generado el 2025-10-21T01:29:31.

## Archivos
- `data/theory.json` — diccionario maestro (acordes, targets, fórmulas).
- `src/` — módulos de motor (parser, teoría, RNG y futuros componentes).
- `tests/` — pruebas unitarias con Vitest.
- `engine.md` — especificación del motor rítmico/melódico/estilístico.
- `agents.md` — tareas detalladas para Codex (implementación).
- `example_input.json` — ejemplo de entrada.
- `example_output.json` — ejemplo de salida.

## Desarrollo
1. Instalar dependencias con `npm install`.
2. Ejecutar el análisis estático con `npm run lint` y las pruebas con `npm test`.
3. Levantar el servidor HTTP con `npm run start:api` para exponer los endpoints `/api/generate`, `/api/generate/midi` y `/api/generate/variants`.
4. Seguir `agents.md` y `engine.md` para completar o extender los módulos del motor.

### CLI y API
- `npm run start:api` → compila el paquete y arranca el servicio (por defecto en `http://localhost:4000`).
- `npm run cli -- --progression "| Dm9  G13 | C∆ |" --seed 42 --swing` → genera notas y las imprime en texto.

Endpoints disponibles:

- `POST /api/generate` → respuesta JSON con notas, metadatos, artefactos (texto, MIDI base64, MusicXML) y datos estructurados por compás.
- `POST /api/generate/midi` → devuelve directamente un binario MIDI reproducible (cabecera `audio/midi`).
- `POST /api/generate/variants` → recibe `baseRequest`, `count` y opcionalmente `seeds` para obtener múltiples variantes en una sola llamada.

### UI web
La UI React vive en `ui/` y está lista para ejecutarse tanto en local como desde GitHub Pages:

1. Instala sus dependencias con `npm install --prefix ui`.
2. Arranca el servidor de desarrollo con `npm run dev:ui`.
3. Abre [http://localhost:5173](http://localhost:5173) y verifica que cargue la interfaz.

Características destacadas de la UI:

- Previsualización textual y tabla de roles (`approach/target/isolated/closure`).
- Reproducción en WebAudio sincronizada con WebMIDI, incluyendo selector de puerto de salida y botón para refrescar dispositivos conectados.
- Vista de partitura/tablatura en SVG basada en los datos estructurados del motor.
- Descarga de artefactos (texto, MIDI, MusicXML) y botón adicional para solicitar el MIDI directamente desde el endpoint de streaming.

Cuando necesites actualizar la versión publicada, ejecuta `npm --prefix ui run build`. El artefacto se genera en `docs/`, lo que permite servir la app directamente desde [`https://<tu-usuario>.github.io/Bebop-targeting/`](https://<tu-usuario>.github.io/Bebop-targeting/) usando GitHub Pages.

Consulta [`ui/README.md`](ui/README.md) para más capturas y comandos adicionales.

## Uso sugerido
1. Implementar estructura de proyecto según `agents.md`.
2. Cargar `data/theory.json` y seguir `engine.md`.
3. Probar con `example_input.json` y verificar que la salida respete:
   - 0 en impares del acorde,
   - anticipaciones entre acordes,
   - cierre en par con salto ≤ 7M dentro de C4–C6.
