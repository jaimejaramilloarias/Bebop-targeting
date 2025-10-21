# Plan incremental de desarrollo

Este backlog organiza el trabajo necesario para completar el generador de frases bebop con UI, siguiendo las pautas de `agents.md`. Las tareas marcadas ✅ ya cuentan con implementación y pruebas asociadas.

## Núcleo de teoría y parsing
- ✅ Configurar el cargador de teoría (`src/theory.ts`) con alias de acordes y validaciones básicas.
- ✅ Implementar el parser de progresiones y normalización de símbolos (`src/parser.ts`).
- ✅ Crear un RNG reproducible con utilidades de elección ponderada (`src/rng.ts`).
- ✅ Publicar helpers de validación para detectar acordes desconocidos antes del scheduler.

## Generación melódica
- ⬜️ Diseñar el generador de contorno (`src/contour.ts`) con control de registro por slider.
- ⬜️ Implementar motor rítmico (`src/rhythm.ts`) con inserción automática de aislados.
- ⬜️ Construir scheduler multiacorde con reglas de anticipación (`src/scheduler.ts`).
- ⬜️ Añadir lógica de cierre estilístico posterior al último target.

## Exportadores y entrega
- ✅ Entregar exportador textual con metadatos opcionales (`src/exporter/toText.ts`).
- ⬜️ Implementar exportador MIDI con soporte básico de swing.
- ⬜️ Implementar exportador MusicXML con compases 4/4.
- ⬜️ Diseñar API HTTP/CLI para consumir el generador desde UI externa.

## UI y experiencia de usuario
- ⬜️ Prototipo de UI web: selector de progresión, seed y slider de contorno.
- ⬜️ Integrar previsualización textual en la UI usando el exportador.
- ⬜️ Añadir controles para descargar MIDI/MusicXML.
- ⬜️ Conectar la UI con los helpers de validación para alertar acordes desconocidos.
- ⬜️ Implementar previsualización de audio MIDI en la UI (render en WebAudio con swing opcional).
- ⬜️ Añadir botón de "Regenerar" que solicite nuevas variantes al motor manteniendo/alterando seed.
- ⬜️ Exponer selector de puerto mediante WebMIDI para enrutar la reproducción hacia plugins externos.
- ⬜️ Renderizar una vista de partitura/tablatura (Canvas/SVG) con las notas resultantes por compás.

## Integraciones y reproducción
- ⬜️ Implementar en el backend un stream MIDI reproducible (con swing) consumible por la UI.
- ⬜️ Preparar endpoints o mensajes para despachar múltiples variantes (mismo input, seeds distintos).
- ⬜️ Añadir bridge WebMIDI/MIDI Writer para sincronizar reproducción local y puertos externos.
- ⬜️ Generar datos estructurados (MusicXML/JSON) que faciliten la renderización de la partitura en la UI.

## Calidad y automatización
- ✅ Cubrir teoría, parser, RNG y exportador textual con pruebas unitarias (`tests/*`).
- ⬜️ Preparar pruebas E2E con progresiones canónicas.
- ⬜️ Configurar análisis estático (ESLint/prettier) y CI.
- ⬜️ Documentar en README el flujo de uso completo y las convenciones de targets.

## Investigación futura
- ⬜️ Hooks de humanización (swing variable, articulaciones).
- ⬜️ Sistema de políticas configurables para alternancia de tipos de fórmula.
