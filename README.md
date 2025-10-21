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
2. Ejecutar las pruebas con `npm test`.
3. Levantar el servidor HTTP con `npm run start:api` para exponer `POST /api/generate`.
4. Seguir `agents.md` y `engine.md` para completar los módulos restantes (contour, rhythm, targeting, etc.).

### CLI y API
- `npm run start:api` → compila el paquete y arranca el endpoint JSON (por defecto en `http://localhost:4000`).
- `npm run cli -- --progression "| Dm9  G13 | C∆ |" --seed 42 --swing` → genera notas y las imprime en texto.

El endpoint responde con notas, metadatos y exportaciones en texto/MIDI/MusicXML.

### UI web
La UI React vive en `ui/` y está lista para ejecutarse tanto en local como desde GitHub Pages:

1. Instala sus dependencias con `npm install --prefix ui`.
2. Arranca el servidor de desarrollo con `npm run dev:ui`.
3. Abre [http://localhost:5173](http://localhost:5173) y verifica que cargue la interfaz.

Cuando necesites actualizar la versión publicada, ejecuta `npm --prefix ui run build`. El artefacto se genera en `docs/`, lo que permite servir la app directamente desde [`https://<tu-usuario>.github.io/Bebop-targeting/`](https://<tu-usuario>.github.io/Bebop-targeting/) usando GitHub Pages.

Consulta [`ui/README.md`](ui/README.md) para más capturas y comandos adicionales.

## Uso sugerido
1. Implementar estructura de proyecto según `agents.md`.
2. Cargar `data/theory.json` y seguir `engine.md`.
3. Probar con `example_input.json` y verificar que la salida respete:
   - 0 en impares del acorde,
   - anticipaciones entre acordes,
   - cierre en par con salto ≤ 7M dentro de C4–C6.
