# UI — Bebop Targeting

La interfaz web está construida con React + Vite y sirve como front-end del motor.

## Requisitos
- Node.js 18+
- Dependencias instaladas con `npm install --prefix ui`

## Comandos principales
- `npm run dev:ui` (desde la raíz) abre el servidor de desarrollo accesible en [http://localhost:5173](http://localhost:5173).
- `npm run build:ui` genera la versión de producción en `ui/dist/`.
- `npm --prefix ui run preview` levanta una vista previa del build.

> **Sugerencia:** en GitHub, pulsa el enlace directo del README raíz hacia la UI (`http://localhost:5173`) para recordar la URL del servidor local.

## Estructura
- `src/App.tsx`: formulario y paneles de previsualización.
- `src/main.tsx`: punto de entrada de React.
- `src/styles.css`: estilos base.

## Próximos pasos
- Conectar la UI con el motor cuando el scheduler esté disponible.
- Añadir descarga de MIDI/MusicXML desde los exportadores del backend.
