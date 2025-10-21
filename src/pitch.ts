const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const DEGREE_ALIASES: Record<string, string> = {
  "♭": "b",
  "♯": "#",
  "𝄫": "bb",
  "𝄪": "##",
};

const DEGREE_TO_OFFSET: Record<string, number> = {
  "1": 0,
  "b2": 1,
  "#1": 1,
  "2": 2,
  "9": 2,
  "b3": 3,
  "#2": 3,
  "3": 4,
  "4": 5,
  "11": 5,
  "#4": 6,
  "b5": 6,
  "5": 7,
  "#5": 8,
  "b6": 8,
  "6": 9,
  "13": 9,
  "bb7": 9,
  "b7": 10,
  "7": 11,
  "7M": 11,
};

export function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const semitone = ((midi % 12) + 12) % 12;
  const names = Object.entries(NOTE_TO_SEMITONE).filter(([, value]) => value === semitone);
  const preferred = names.length ? names[0][0] : "C";
  return `${preferred}${octave}`;
}

export function pitchNameToMidi(pitch: string): number {
  const match = pitch.match(/^([A-Ga-g])(#{1,2}|b{1,2})?(\d+)$/);
  if (!match) {
    throw new Error(`Pitch inválido: ${pitch}`);
  }
  const [, letterRaw, accidentalRaw = "", octaveRaw] = match;
  const letter = letterRaw.toUpperCase();
  const octave = Number.parseInt(octaveRaw, 10);
  const base = NOTE_TO_SEMITONE[letter];
  const offset = accidentalRaw
    ? accidentalRaw.split("").reduce((sum, symbol) => sum + (symbol === "#" ? 1 : -1), 0)
    : 0;
  return (octave + 1) * 12 + base + offset;
}

export function rootToMidi(root: string, octave = 4): number {
  const match = root.match(/^([A-Ga-g])(#{1,2}|b{1,2})?$/);
  if (!match) {
    throw new Error(`No se pudo interpretar la tónica "${root}"`);
  }
  const [, letterRaw, accidentalRaw = ""] = match;
  const letter = letterRaw.toUpperCase();
  const base = NOTE_TO_SEMITONE[letter];
  const offset = accidentalRaw
    ? accidentalRaw.split("").reduce((sum, symbol) => sum + (symbol === "#" ? 1 : -1), 0)
    : 0;
  return (octave + 1) * 12 + base + offset;
}

function normalizeDegreeToken(raw: string): string {
  let normalized = raw;
  for (const [alias, replacement] of Object.entries(DEGREE_ALIASES)) {
    normalized = normalized.replace(new RegExp(alias, "g"), replacement);
  }
  return normalized;
}

export function degreeToSemitoneOffset(degree: string): number {
  const normalized = normalizeDegreeToken(degree);
  const offset = DEGREE_TO_OFFSET[normalized];
  if (typeof offset === "number") {
    return offset;
  }
  throw new Error(`No se reconoce el grado "${degree}"`);
}

export function wrapMidiToRange(midi: number, min: number, max: number): number {
  if (min > max) {
    throw new Error("Rango inválido: min > max");
  }
  let value = midi;
  const span = max - min + 1;
  if (span <= 0) {
    return min;
  }
  while (value < min) {
    value += 12;
  }
  while (value > max) {
    value -= 12;
  }
  if (value < min) {
    value = min;
  }
  if (value > max) {
    value = max;
  }
  return value;
}

export function clampMidi(midi: number, min: number, max: number): number {
  return Math.min(Math.max(midi, min), max);
}
