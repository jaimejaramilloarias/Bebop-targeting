import theoryData from "../data/theory.json" with { type: "json" };

export type FormulaType = 1 | 2;

export interface TargetInfo {
  reference: string;
  interval?: string;
  type: FormulaType | string;
}

export interface ChordProfile {
  symbol: string;
  structure: string[];
  extensions_default: Record<string, string>;
  targets: Record<string, TargetInfo>;
}

export interface TheoryData {
  meta: unknown;
  formulas: {
    TIPO_1: Record<string, number[][]>;
    TIPO_2: Record<string, number[][]>;
  };
  rules_tipo: unknown;
  chords: Record<string, ChordProfile>;
}

const theory = theoryData as TheoryData;

const QUALITY_ALIAS_ENTRIES: Array<[string, string]> = [
  ["", "maj7"],
  ["maj", "maj7"],
  ["maj7", "maj7"],
  ["maj9", "maj7"],
  ["maj11", "maj7"],
  ["maj13", "maj7"],
  ["Δ", "maj7"],
  ["∆", "maj7"],
  ["M7", "maj7"],
  ["m7", "m7"],
  ["m9", "m7"],
  ["m11", "m7"],
  ["m13", "m7"],
  ["m6", "m6"],
  ["mMaj7", "mMaj7"],
  ["min7", "m7"],
  ["min9", "m7"],
  ["ø", "ø"],
  ["Ø", "ø"],
  ["m7b5", "ø"],
  ["halfdim", "ø"],
  ["dim7", "dim7"],
  ["o7", "dim7"],
  ["º7", "dim7"],
  ["º", "dim7"],
  ["7", "7"],
  ["9", "7"],
  ["11", "7"],
  ["13", "7"],
  ["7b9", "7"],
  ["7#9", "7"],
  ["7b5", "7b5"],
  ["7#5", "7#5"],
  ["aug", "7#5"],
  ["+", "7#5"],
  ["#5", "7#5"],
  ["sus", "frig"],
  ["sus4", "frig"],
  ["frig", "frig"],
  ["maj7b5", "maj7b5"],
  ["maj7#5", "maj7#5"],
];

const QUALITY_ALIASES: Record<string, string> = Object.fromEntries(QUALITY_ALIAS_ENTRIES);

function normalizeQuality(raw: string): string {
  const cleaned = raw
    .replace(/\(.*?\)/g, match => match.slice(1, -1))
    .replace(/[\s]/g, "")
    .replace(/Δ|∆/g, "maj7")
    .replace(/º/g, "dim")
    .replace(/\+/g, "#5");

  const alias = QUALITY_ALIASES[cleaned];
  if (alias) {
    return alias;
  }

  if (theory.chords[cleaned]) {
    return cleaned;
  }

  throw new Error(`No se reconoce la cualidad de acorde: "${raw}"`);
}

function extractQuality(symbol: string): string {
  const trimmed = symbol.trim();
  const match = trimmed.match(/^([A-Ga-g](?:#|b)?)(.*)$/);
  if (!match) {
    return normalizeQuality(trimmed);
  }
  const [, , qualityRaw] = match;
  return normalizeQuality(qualityRaw || "");
}

export function getChordProfile(symbol: string): ChordProfile {
  const quality = extractQuality(symbol);
  const profile = theory.chords[quality];
  if (!profile) {
    throw new Error(`No existe perfil para el símbolo "${symbol}" (cualidad "${quality}")`);
  }
  return profile;
}

export function getFormulas(tipo: FormulaType): Record<string, number[][]> {
  if (tipo === 1) {
    return theory.formulas.TIPO_1;
  }
  if (tipo === 2) {
    return theory.formulas.TIPO_2;
  }
  throw new Error(`Tipo de fórmula no soportado: ${tipo}`);
}

export function availableChordQualities(): string[] {
  return Object.keys(theory.chords);
}

export function getTheory(): TheoryData {
  return theory;
}
