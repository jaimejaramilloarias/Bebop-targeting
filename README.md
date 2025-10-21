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
3. Seguir `agents.md` y `engine.md` para completar los módulos restantes (contour, rhythm, targeting, etc.).

## Uso sugerido
1. Implementar estructura de proyecto según `agents.md`.
2. Cargar `data/theory.json` y seguir `engine.md`.
3. Probar con `example_input.json` y verificar que la salida respete:
   - 0 en impares del acorde,
   - anticipaciones entre acordes,
   - cierre en par con salto ≤ 7M dentro de C4–C6.
