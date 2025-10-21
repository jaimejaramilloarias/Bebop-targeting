import { type ChordProfile } from "./theory.js";
import { degreeToSemitoneOffset, midiToPitch, rootToMidi, wrapMidiToRange } from "./pitch.js";

const DEFAULT_MIN_MIDI = 60; // C4
const DEFAULT_MAX_MIDI = 84; // C6

const DEGREE_PRIORITY = ["3", "5", "1", "7M", "♭7", "4", "6", "♭3", "♯5", "♭5", "♭♭7"];

function extractRoot(symbol: string): string {
  const match = symbol.trim().match(/^([A-Ga-g](?:#|b)?)/);
  if (!match) {
    throw new Error(`No se pudo extraer la tónica del símbolo "${symbol}"`);
  }
  return match[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeEffectiveRange(slider: number | undefined, minMidi: number, maxMidi: number): [number, number] {
  const ratio = clamp(slider ?? 0.4, 0, 1);
  const padding = Math.round(ratio * 8);
  const effectiveMin = Math.min(maxMidi, minMidi + padding);
  const effectiveMax = Math.max(effectiveMin, maxMidi - padding);
  return [effectiveMin, effectiveMax];
}

function computeRootMidi(root: string, minMidi: number, maxMidi: number): number {
  const mid = Math.round((minMidi + maxMidi) / 2);
  let midi = rootToMidi(root, 4);
  while (midi < minMidi) {
    midi += 12;
  }
  while (midi > maxMidi) {
    midi -= 12;
  }
  if (Math.abs(mid - (midi + 12)) < Math.abs(mid - midi) && midi + 12 <= maxMidi) {
    midi += 12;
  }
  if (Math.abs(mid - (midi - 12)) < Math.abs(mid - midi) && midi - 12 >= minMidi) {
    midi -= 12;
  }
  return midi;
}

function resolveDegreeCandidates(
  rootMidi: number,
  degree: string,
  minMidi: number,
  maxMidi: number,
): number[] {
  const offset = degreeToSemitoneOffset(degree);
  const base = rootMidi + offset;
  const candidates = new Set<number>();
  for (let midi = base; midi <= maxMidi; midi += 12) {
    if (midi >= minMidi && midi <= maxMidi) {
      candidates.add(midi);
    }
  }
  for (let midi = base - 12; midi >= minMidi; midi -= 12) {
    if (midi >= minMidi && midi <= maxMidi) {
      candidates.add(midi);
    }
  }
  return Array.from(candidates).sort((a, b) => a - b);
}

function priorityIndex(degree: string): number {
  const index = DEGREE_PRIORITY.indexOf(degree);
  return index === -1 ? DEGREE_PRIORITY.length : index;
}

export interface ContourTarget {
  degree: string;
  midi: number;
  pitch: string;
}

export interface ContourGenerator {
  nextTarget(chordSymbol: string, profile: ChordProfile): ContourTarget;
}

export interface ContourOptions {
  slider?: number;
  minMidi?: number;
  maxMidi?: number;
  startDegree?: string;
  startMidi?: number;
}

export function createContourGenerator(options: ContourOptions = {}): ContourGenerator {
  const [rangeMin, rangeMax] = computeEffectiveRange(options.slider, options.minMidi ?? DEFAULT_MIN_MIDI, options.maxMidi ?? DEFAULT_MAX_MIDI);
  let lastMidi: number | null = options.startMidi ?? null;
  let direction: 1 | -1 = 1;
  return {
    nextTarget(chordSymbol: string, profile: ChordProfile): ContourTarget {
      const degrees = Object.keys(profile.targets);
      if (degrees.length === 0) {
        throw new Error(`El perfil de acorde "${chordSymbol}" no define targets`);
      }
      const sortedDegrees = degrees.sort((a, b) => {
        const priorityDelta = priorityIndex(a) - priorityIndex(b);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return a.localeCompare(b);
      });
      const root = extractRoot(chordSymbol);
      const rootMidi = computeRootMidi(root, rangeMin, rangeMax);
      let selectedDegree = sortedDegrees[0];
      let selectedMidi = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      const desired = lastMidi === null ? (rangeMin + rangeMax) / 2 : direction === 1 ? rangeMax : rangeMin;
      for (const degree of sortedDegrees) {
        const candidates = resolveDegreeCandidates(rootMidi, degree, rangeMin, rangeMax);
        if (!candidates.length) {
          continue;
        }
        let candidateMidi = candidates[0];
        let bestDiff = Math.abs(candidateMidi - desired);
        for (const value of candidates) {
          const diff = Math.abs(value - desired);
          if (diff < bestDiff - 1e-3) {
            bestDiff = diff;
            candidateMidi = value;
          }
        }
        const score = bestDiff + priorityIndex(degree) * 0.1;
        if (score < bestScore) {
          bestScore = score;
          selectedDegree = degree;
          selectedMidi = candidateMidi;
        }
      }
      if (bestScore === Number.POSITIVE_INFINITY) {
        const fallbackCandidates = resolveDegreeCandidates(rootMidi, sortedDegrees[0], rangeMin, rangeMax);
        if (!fallbackCandidates.length) {
          throw new Error(`No hay registros válidos para ${chordSymbol}`);
        }
        selectedMidi = fallbackCandidates[0];
        selectedDegree = sortedDegrees[0];
      }
      lastMidi = wrapMidiToRange(selectedMidi, rangeMin, rangeMax);
      if (lastMidi >= rangeMax - 2) {
        direction = -1;
      } else if (lastMidi <= rangeMin + 2) {
        direction = 1;
      } else {
        direction = (direction === 1 ? -1 : 1);
      }
      return {
        degree: selectedDegree,
        midi: lastMidi,
        pitch: midiToPitch(lastMidi),
      };
    },
  };
}
