# agents.md — Plan de Implementación para Codex (Trabajo Pesado)

Este documento asigna tareas detalladas (con contratos, pseudocódigo, validaciones y pruebas) para implementar el generador de frases de bebop con **targeting** según la teoría de Jaime.

> Lenguaje sugerido: TypeScript/JavaScript (Node) o Python. Salida MIDI/MusicXML opcional.

---

## 0) Estructura del proyecto
```
/project
  ├─ data/
  │   └─ theory.json
  ├─ src/
  │   ├─ parser.ts
  │   ├─ theory.ts
  │   ├─ rng.ts
  │   ├─ contour.ts
  │   ├─ rhythm.ts
  │   ├─ targeting.ts
  │   ├─ scheduler.ts
  │   ├─ exporter/
  │   │   ├─ toText.ts
  │   │   ├─ toMIDI.ts
  │   │   └─ toMusicXML.ts
  │   └─ index.ts
  ├─ tests/
  │   ├─ parser.test.ts
  │   ├─ rhythm.test.ts
  │   ├─ targeting.test.ts
  │   ├─ scheduler.test.ts
  │   └─ e2e.example.test.ts
  └─ README.md
```

---

## 1) Carga de teoría
**Archivo:** `data/theory.json` (incluido).  
**Tarea:** `theory.ts` debe exportar una API para consultar:
- `getChordProfile(symbol: string)` → estructura, extensiones, targets.
- `getFormulas(tipo: 1|2)` → lista de arrays (dobles/triples/...).
- Validaciones: claves presentes, tipos correctos.

**Pseudocódigo:**
```ts
import theory from "../data/theory.json";
export function getChordProfile(symbol){ /* mapear símbolos: maj7, m7, 7, ø, ... */ }
export function getFormulas(tipo){ return tipo===1 ? theory.formulas.TIPO_1 : theory.formulas.TIPO_2; }
```

**Tests:**
- `maj7.targets['7M'].type === 2`
- `ø.extensions_default['9'] === '9m'`
- `formulas.TIPO_1.dobles` no vacío.

---

## 2) Parser de progresión
**Archivo:** `parser.ts`  
**Entrada:** string, p.ej. `"| Dm9  G13 | C∆ |"`.  
**Salida:** arreglo de objetos `{ chordSymbol, startEighth, lengthEighths }`.

**Reglas:**
- `|` separa compases.
- Dentro de un compás, **si hay dos símbolos** → cada uno = **4 corcheas**.
- Si hay **uno** → **8 corcheas**.
- Normalizar símbolos: `∆`→`maj7`, `ø`→`ø`, `º7`→`dim7`, `+`→`#5`, `(b5)`→`b5`, etc.

**Pseudocódigo:**
```ts
function parseProgression(s: string){
  let bars = s.trim().split("|").map(x=>x.trim()).filter(x=>x.length);
  let pos = 0; const out=[];
  for (let bar of bars){
    const tokens = bar.split(/\s+/).filter(Boolean);
    if (tokens.length===1){ out.push({ chordSymbol: tokens[0], startEighth: pos, lengthEighths: 8 }); pos+=8; }
    else if (tokens.length===2){
      out.push({ chordSymbol: tokens[0], startEighth: pos, lengthEighths: 4 });
      out.push({ chordSymbol: tokens[1], startEighth: pos+4, lengthEighths: 4 });
      pos+=8;
    } else { throw Error("Max 2 acordes por compás"); }
  }
  return out;
}
```

**Tests:**
- `"| Dm9  G13 | C∆ |"` → 3 items: Dm9(0..3), G13(4..7), C∆(8..15).

---

## 3) RNG (aleatoriedad reproducible)
**Archivo:** `rng.ts`  
- Exportar `makeRng(seed)` con `nextFloat()`, `choiceWeighted(items, weights)`.

**Tests:** Misma seed → mismas elecciones.

---

## 4) Contour (onda de targets)
**Archivo:** `contour.ts`  
**Entrada:** registro (`C4..C6`), slider `[0..1]`, punto de partida (grado estructural y pitch).  
**Salida:** generador de **secuencia de targets** (grados & pitches) en onda.

**Detalles:**
- Mapear grados → offsets relativos dentro del acorde según registro (usar nearest mapping).
- Slider: define límites dinámicos dentro de C4..C6 (ej. L = lerp(C4,C6, slider)).

**Tests:**
- Con slider 0 → extremos C4/C6 alcanzables.
- Con slider 1 → inversiones frecuentes (2–3 grados).

---

## 5) Rhythm (paridad y aislados)
**Archivo:** `rhythm.ts`  
**Responsables:**
- Dado `k` (aprox), verificar paridad de inicio para aterrizar 0 en impar.
- Si no cuadra, **insertar 1 aislado** y devolver nuevo `start`.
- Calcular si la fórmula **cabe** en la ventana del acorde; si no, degradar k (quitar aprox) o posponer.

**Funciones:**
- `alignParity(startEighth, k) -> startAligned, isolates[]`
- `fitFormula(windowStart, windowLen, landingOdd) -> bestStart or needAnticipation`

**Tests:** múltiples combinaciones de k y comienzo de acorde (4 u 8 corcheas).

---

## 6) Targeting (elección de TIPO y fórmula)
**Archivo:** `targeting.ts`  
**Funciones:**
- `pickTipo(chordProfile, degree) -> 1|2` según teoría.
- `pickFormula(tipo, rng, policy) -> int[]` con pesos configurables por longitud.

**Tests:**
- maj7: degree 3 → tipo 2 (por 11+).
- ø: degree 1 → tipo 1 (9m).

---

## 7) Scheduler (multiacorde y anticipaciones)
**Archivo:** `scheduler.ts`  
**Entrada:** lista de acordes con ventanas, generador de targets (contour), teoría (targets por acorde), PRNG.  
**Salida:** arreglo de notas con timestamps de corchea (incluye `src=approach|target|isolated|closure`).

**Pseudocódigo (alto nivel):**
```ts
for (each chordWindow Aj):
  degree, pitch = contour.nextTarget(Aj)
  tipo = pickTipo(profile(Aj), degree)
  formula = pickFormula(tipo, rng, policy)

  landingOdd = firstOddThatFits(Aj) // 1 o 3 si 4 corcheas; 1,3,5,7 si 8 corcheas
  k = formula.length - 1
  start = landingOdd - k

  if start < Aj.startEighth:
      // anticipacion en Aj-1
      placeApproachesInPreviousWindows(start..landingOdd-1)
  else:
      placeApproachesInAj(start..landingOdd-1)

  ensureParityWithIsolatedIfNeeded()
  emit target at landingOdd
```

**Reglas adicionales:**
- Acorde de 4 corcheas → **max 1 target**.
- Validar registro C4–C6 en cada 0.
- Evitar que el cierre pise un target final; si falta espacio, degradar última fórmula.

**Tests (unitarios y e2e):**
- `| Dm9  G13 | C∆ |` produce 2 targets en compás 1 (uno por acorde) y ≥1 en compás 2.
- Anticipación desde G13 hacia C∆ funcionando.

---

## 8) Cierre estilístico
**Archivo:** `scheduler.ts` (o módulo aparte)  
- Al terminar, colocar **nota de cierre** en corchea **par** inmediatamente posterior al último 0.
- Salto ≤ 7M y dentro de C4–C6 (si no, invertir dirección o elegir estructural cercano).

**Tests:**
- Si el último 0 está en corchea 7 → cierre en 8.
- Si último 0 está en 8 (imposible por regla) → debe reajustarse antes.

---

## 9) Exportadores
**Archivos:** `exporter/toText.ts`, `exporter/toMIDI.ts`, `exporter/toMusicXML.ts`  
- **toText**: imprime lista `bar:corchea → nota (src)`.
- **toMIDI**: tempo + swing (opcional: desplazar corchea débil).
- **toMusicXML**: compases 4/4 con negras subdivididas (swing como texto).

**Tests:**
- Text: contiene todos los 0 en impares.
- MIDI: duración uniforme, cierre en par.
- MusicXML: compases equilibrados y barras en los lugares correctos.

---

## 10) Contratos de datos
**Entrada API:**
```ts
interface Request {
  key: string;                  // e.g., "C"
  progression: string;          // e.g., "| Dm9  G13 | C∆ |"
  bars?: number;                // redundante si se infiere de la progresion
  tempo_bpm?: number;
  swing?: boolean;
  contour_slider?: number;      // 0..1
  seed?: number;
}
```
**Salida API:**
```ts
interface Note {
  t: number;        // en corcheas, 0-index
  dur: number;      // corcheas (1 = una corchea)
  midi: number;
  pitch?: string;   // opcional texto (C4...)
  src: "approach"|"target"|"isolated"|"closure";
  chord?: string;   // acorde dueño del 0
  degree?: string;  // 1,3,5,7,9,11,13
}
interface Response {
  notes: Note[];
  swing_ratio?: number;
  meta?: any;
}
```

---

## 11) Políticas de selección (configurable)
- Pesos por longitud de fórmula (por TIPO).
- Probabilidad de alternar TIPO si dos grados consecutivos comparten TIPO.
- Frecuencia de aislados mínima.
- Preferencias de aterrizaje (1 sobre 3 en acordes de 4 corcheas, etc.).

---

## 12) Pruebas E2E sugeridas
1. `| Dm9  G13 | C∆ |` → verificar 4-4-8 corcheas y anticipación correcta hacia C∆.
2. `| F∆ |` 2 compases → múltiples targets en 1 compás, cierre ≤ 7M.
3. `| Aø | D7(b9) | Gm7 C7 | F∆ |` → voz guía típica II–V–I con anticipaciones inter-acorde.

---

## 13) Rendimiento y extensibilidad
- O(N) en número de corcheas.
- Hooks para reglas adicionales (cromatismo máximo consecutivo, saltos compensatorios, etc.).
- Futuro: humanización de swing, articulaciones, acentos.

---

## 14) Aceptación
- Todos los tests pasan.
- Validadores de reglas (0 en impares, cierre en par ≤7M, registro C4–C6) sin errores.
- Salidas reproducibles con seed.
