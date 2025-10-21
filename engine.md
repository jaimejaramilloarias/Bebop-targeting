# Motor Generativo — Bebop Targeting (Teoría de Jaime)

## 0. Objetivo
Dada una progresión cifrada (p.ej. `| Dm9  G13 | C∆ |`) y un número de compases, generar una línea de bebop
que aplique **targeting** según esta teoría: cada fórmula coloca su **0** en corchea **impar** y puede anticiparse
desde el acorde anterior; la frase cierra con un **salto estructural ≤ 7M** en corchea **par** inmediatamente posterior.

---

## 1. Discretización rítmica
- 4/4 → 8 corcheas por compás, numeradas 1..8.
- En compases con **dos acordes**, cada uno ocupa **4** corcheas (1..4 y 5..8).
- **0 (target)** siempre cae en **1,3,5,7** dentro de la **ventana de su acorde**.
- Todas las notas del targeting (aprox + 0) duran 1 corchea (swing en reproducción).

### Paridad de inicio
Sea **k** el número de aproximaciones de la fórmula:
- k **par** → inicio en **impar** para aterrizar en **impar**.
- k **impar** → inicio en **par** para aterrizar en **impar**.
Si la ranura disponible no cumple la paridad → insertar **1 aislado estructural** (sin targeting) para corregir.

---

## 2. Movimiento de targets (Reglas de Línea)
- Registro **C4–C6**.
- **Onda**: dirección fija (asc/desc) hasta tocar **techo** o **piso**, luego invertir.
- **Slider "contraer ondas"** en [0..1]:
  - 0.0 → usa C4–C6 completo.
  - 1.0 → invierte cada 2–3 grados (onda estrecha).
- Los targets siguen el ciclo estructural continuo: 1→3→5→7→1→... (o inverso descendente).

---

## 3. Elección del TIPO
- **TIPO 1**: referencia superior a **un tono exacto (M2)**.
- **TIPO 2**: referencia superior a **semitono (m2)** o a **más de un tono (≥ A2)**.
- Las referencias vienen del diccionario de acordes (extensiones asumidas y reglas).

---

## 4. Catálogo de fórmulas
Ver `theory.json → formulas`. Clasificadas por TIPO y longitud (**dobles, triples, cuadruples, quintuples, sextuples**).
Nota: quintuples generadas según la regla de inserción de vecino inferior al primer intervalo.

---

## 5. Multiacorde y anticipaciones
- Si un acorde dura **4 corcheas** → **máximo 1 target**.
- Si un acorde dura **8 corcheas** → puede albergar varios targets (1,3,5,7).
- **Anticipación**: las **aproximaciones** de un target de Aj pueden sonar en el acorde **Aj-1** si el conteo hacia atrás (k) lo exige.
- El **0** del target **siempre** pertenece a Aj y cae en su ranura impar.

### Procedimiento para cada target
1. Elegir target estructural por la **onda** (registro/dirección).
2. Definir **TIPO** consultando el diccionario del acorde activo.
3. Elegir fórmula (k) dentro del TIPO (aleatorio con pesos o reglas de densidad).
4. Elige la **impar de aterrizaje** para el 0 dentro de la ventana del acorde (primera que quepa o según preferencia).
5. Retrocede **k** corcheas:
   - Si el inicio cae en Aj → colocar completo en Aj.
   - Si cae en Aj-1 → colocar aprox en Aj-1 y el **0** en Aj (anticipación).
   - Si cae antes del inicio de la frase → reducir k o insertar aislados previos para cuadrar.
6. Validar paridad; si no cuadra → insertar aislado anterior y recomputar.

---

## 6. Cierre estilístico
- Tras el último **0** de la frase, colocar **una** nota estructural (del acorde vigente) en la **corchea par inmediata**.
- El salto desde el 0 al cierre será **ascendente o descendente**, pero **≤ 7ª mayor** y dentro de **C4–C6**.
- Si el salto excede el rango o la 7M → elegir el estructural válido más cercano o invertir dirección.

---

## 7. Entrada/Salida (contrato)
### Entrada
```json
{
  "key": "C",
  "progression": "| Dm9  G13 | C∆ |",
  "bars": 2,
  "tempo_bpm": 220,
  "swing": true,
  "contour_slider": 0.2,
  "seed": 42
}
```
### Salida (conceptual)
```json
{
  "notes": [
    {"t":0, "dur":0.5, "midi":64, "src":"approach", "to":"F4"},
    {"t":0.5,"dur":0.5,"midi":65,"src":"approach","to":"F4"},
    {"t":1, "dur":0.5, "midi":65,"src":"target","degree":"3","chord":"Dm9"},

    {"t":2, "dur":0.5, "midi":70,"src":"approach","to":"B4"},
    {"t":2.5,"dur":0.5,"midi":71,"src":"approach","to":"B4"},
    {"t":3, "dur":0.5, "midi":71,"src":"target","degree":"3","chord":"G13"},

    {"t":3.5,"dur":0.5,"midi":71,"src":"approach","to":"C5"},
    {"t":3.75,"dur":0.5,"midi":72,"src":"approach","to":"C5"},
    {"t":4, "dur":0.5, "midi":72,"src":"target","degree":"1","chord":"C∆"},

    {"t":5, "dur":0.5, "midi":76,"src":"approach","to":"E5"},
    {"t":5.5,"dur":0.5,"midi":76,"src":"target","degree":"3","chord":"C∆"},

    {"t":6, "dur":0.5, "midi":67,"src":"closure","rule":"≤7M"}
  ],
  "swing_ratio": 1.6
}
```
`t` medido en corcheas (0 = inicio).

---

## 8. Aleatoriedad y reproducibilidad
- Usar PRNG con `seed` para:
  - Selección de longitud de fórmula (dentro de TIPO).
  - Elección de dirección de cierre (si no está fijada).
  - Micro-variación rítmica futura (si se desea).

---

## 9. Validaciones
- Todo 0 en 1,3,5,7 de su acorde.
- Máximo 1 target en acordes de 4 corcheas.
- Cierre en par con salto ≤ 7M dentro de C4–C6.
- Anticipaciones correctas (aprox pueden cruzar de Aj-1 a Aj).

