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

function pickLanding(window: ChordWindow, formulaLength: number): number {
  const options = getLandingOptions(window);
  if (!options.length) {
    return window.startEighth + 1;
  }
  return window.startEighth + options[0];
}

export function computeRhythmPlacement(window: ChordWindow, formulaLength: number): RhythmPlacement {
  if (formulaLength <= 0) {
    throw new Error("La fórmula debe tener al menos una nota (el target)");
  }
  const landing = pickLanding(window, formulaLength);
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
