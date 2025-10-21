import type { ChordWindow } from "./parser.js";

const LANDING_OPTIONS_BY_LENGTH: Record<number, number[]> = {
  4: [1, 3],
  8: [1, 3, 5, 7],
};

export interface RhythmPlacement {
  landing: number;
  approachStart: number;
  totalStart: number;
  isolated: number | null;
}

function getLandingOptions(window: ChordWindow): number[] {
  return LANDING_OPTIONS_BY_LENGTH[window.lengthEighths] ?? [1, 3, 5, 7];
}

function mergeLandingPreferences(base: number[], preferred?: number[] | null): number[] {
  if (!preferred || preferred.length === 0) {
    return base;
  }
  const merged: number[] = [];
  const seen = new Set<number>();
  for (const option of preferred) {
    if (base.includes(option) && !seen.has(option)) {
      merged.push(option);
      seen.add(option);
    }
  }
  for (const option of base) {
    if (!seen.has(option)) {
      merged.push(option);
      seen.add(option);
    }
  }
  return merged.length ? merged : base;
}

function pickLanding(window: ChordWindow, preferred?: number[] | null): number {
  const baseOptions = getLandingOptions(window);
  const options = mergeLandingPreferences(baseOptions, preferred);
  const offset = options[0] ?? 1;
  return window.startEighth + offset;
}

export function computeRhythmPlacement(
  window: ChordWindow,
  formulaLength: number,
  preferredLanding?: number[] | null,
): RhythmPlacement {
  if (formulaLength <= 0) {
    throw new Error("La fórmula debe tener al menos una nota (el target)");
  }
  const landing = pickLanding(window, preferredLanding);
  const approachStart = landing - (formulaLength - 1);
  const parity = Math.abs(approachStart % 2);
  const needsIsolated = parity === 1;
  const isolated = needsIsolated ? approachStart - 1 : null;
  const totalStart = isolated ?? approachStart;
  return {
    landing,
    approachStart,
    totalStart,
    isolated,
  };
}
