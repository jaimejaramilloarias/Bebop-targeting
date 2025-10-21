import { parseProgression, type ChordWindow } from "./parser.js";
import { getChordProfile, getFormulas, type ChordProfile } from "./theory.js";
import { createContourGenerator, type ContourGenerator, type ContourTarget } from "./contour.js";
import { computeRhythmPlacement } from "./rhythm.js";
import type { RandomNumberGenerator } from "./rng.js";
import { midiToPitch, wrapMidiToRange } from "./pitch.js";
import type { Note, NoteSource } from "./exporter/toText.js";
import { createPolicyManager, type PolicyManager } from "./policies.js";

const MIN_MIDI = 60;
const MAX_MIDI = 84;

export interface SchedulerRequest {
  key: string;
  progression: string;
  tempo_bpm?: number;
  swing?: boolean;
  contour_slider?: number;
  seed?: number;
}

export interface SchedulerContext {
  rng: RandomNumberGenerator;
  contour?: ContourGenerator;
  policy?: PolicyManager;
}

export interface ScheduledNote extends Note {
  src: NoteSource;
}

interface FormulaCandidate {
  pattern: number[];
  group: string;
}

function flattenFormulas(collection: Record<string, number[][]>): FormulaCandidate[] {
  const formulas: FormulaCandidate[] = [];
  for (const [group, groupFormulas] of Object.entries(collection)) {
    for (const formula of groupFormulas) {
      formulas.push({ pattern: [...formula], group });
    }
  }
  return formulas;
}

function selectFormula(
  profile: ChordProfile,
  target: ContourTarget,
  rng: RandomNumberGenerator,
  policy: PolicyManager | undefined,
): number[] {
  const targetInfo = profile.targets[target.degree];
  if (!targetInfo) {
    throw new Error(`El perfil no contiene información para el grado ${target.degree}`);
  }
  const tipo = targetInfo.type;
  if (tipo !== 1 && tipo !== 2) {
    throw new Error(`No hay fórmulas disponibles para el grado ${target.degree} (tipo ${String(tipo)})`);
  }
  const formulasCollection = getFormulas(tipo);
  const formulas = flattenFormulas(formulasCollection);
  if (!formulas.length) {
    throw new Error(`No hay fórmulas disponibles para el tipo ${targetInfo.type}`);
  }
  const weights = formulas.map(candidate => {
    const baseWeight = Math.max(1, candidate.pattern.length - 1);
    if (!policy) {
      return baseWeight;
    }
    return policy.evaluateFormulaWeight(tipo, candidate, baseWeight);
  });
  const sanitizedWeights = weights.map(value => Math.max(0, value));
  const total = sanitizedWeights.reduce((sum, value) => sum + value, 0);
  const resolvedWeights = total > 0 ? sanitizedWeights : formulas.map(() => 1);
  const selected = rng.choiceWeighted(formulas, resolvedWeights);
  policy?.registerSelectedTipo(tipo);
  return [...selected.pattern];
}

function fitFormula(
  window: ChordWindow,
  formula: number[],
  previousWindow: ChordWindow | null,
  landingPreference: number[] | null,
): { formula: number[]; placement: ReturnType<typeof computeRhythmPlacement> } {
  let current = [...formula];
  let placement = computeRhythmPlacement(window, current.length, landingPreference);
  const lowerBound = previousWindow ? previousWindow.startEighth : 0;
  while (current.length > 1) {
    const earliest = placement.isolated !== null ? placement.isolated : placement.approachStart;
    if (earliest >= lowerBound) {
      break;
    }
    current = current.slice(1);
    placement = computeRhythmPlacement(window, current.length, landingPreference);
  }
  return { formula: current, placement };
}

function realiseApproachMidis(targetMidi: number, formula: number[]): number[] {
  const approachOffsets = formula.slice(0, -1);
  return approachOffsets.map(offset => wrapMidiToRange(targetMidi + offset, MIN_MIDI, MAX_MIDI));
}

function scheduleForWindow(
  notes: ScheduledNote[],
  window: ChordWindow,
  profile: ChordProfile,
  target: ContourTarget,
  rng: RandomNumberGenerator,
  previousWindow: ChordWindow | null,
  policy: PolicyManager | undefined,
): ScheduledNote[] {
  const rawFormula = selectFormula(profile, target, rng, policy);
  const landingPreference = policy?.getLandingPreferences(window.lengthEighths) ?? null;
  const { formula, placement } = fitFormula(window, rawFormula, previousWindow, landingPreference);
  const approachMidis = realiseApproachMidis(target.midi, formula);
  let isolatedTime = placement.isolated;
  if (isolatedTime !== null && isolatedTime < 0 && !previousWindow) {
    isolatedTime = null;
  }
  if (isolatedTime !== null) {
    notes.push({
      t: isolatedTime,
      dur: 1,
      midi: wrapMidiToRange(target.midi, MIN_MIDI, MAX_MIDI),
      pitch: midiToPitch(wrapMidiToRange(target.midi, MIN_MIDI, MAX_MIDI)),
      src: "isolated",
      chord: window.chordSymbol,
    });
  }
  const approachStart = placement.approachStart;
  approachMidis.forEach((midi, index) => {
    const time = approachStart + index;
    if (previousWindow && time < window.startEighth && time < previousWindow.startEighth) {
      return;
    }
    notes.push({
      t: time,
      dur: 1,
      midi,
      pitch: midiToPitch(midi),
      src: "approach",
      chord: window.chordSymbol,
    });
  });
  notes.push({
    t: placement.landing,
    dur: 1,
    midi: wrapMidiToRange(target.midi, MIN_MIDI, MAX_MIDI),
    pitch: target.pitch,
    src: "target",
    chord: window.chordSymbol,
    degree: target.degree,
  });
  return notes;
}

function addClosure(notes: ScheduledNote[]): void {
  const targetNotes = notes.filter(note => note.src === "target");
  if (!targetNotes.length) {
    return;
  }
  const lastTarget = targetNotes.reduce((latest, note) => (note.t > latest.t ? note : latest), targetNotes[0]);
  const closureTime = lastTarget.t + 1;
  let closureMidi = lastTarget.midi - 2;
  if (closureMidi < MIN_MIDI) {
    closureMidi = lastTarget.midi + 2 <= MAX_MIDI ? lastTarget.midi + 2 : MIN_MIDI;
  }
  const interval = Math.abs(closureMidi - lastTarget.midi);
  if (interval > 11) {
    closureMidi = wrapMidiToRange(lastTarget.midi - 5, MIN_MIDI, MAX_MIDI);
  }
  notes.push({
    t: closureTime,
    dur: 1,
    midi: closureMidi,
    pitch: midiToPitch(closureMidi),
    src: "closure",
  });
}

export function scheduleProgression(progression: string, context: SchedulerContext): ScheduledNote[] {
  const windows = parseProgression(progression);
  if (!windows.length) {
    return [];
  }
  const contour = context.contour ?? createContourGenerator();
  const policy = context.policy ?? createPolicyManager();
  const notes: ScheduledNote[] = [];
  windows.forEach((window, index) => {
    const profile = getChordProfile(window.chordSymbol);
    const target = contour.nextTarget(window.chordSymbol, profile);
    const previousWindow = index > 0 ? windows[index - 1] : null;
    scheduleForWindow(notes, window, profile, target, context.rng, previousWindow, policy);
  });
  notes.sort((a, b) => a.t - b.t);
  addClosure(notes);
  return notes.sort((a, b) => a.t - b.t);
}

export function scheduleRequest(request: SchedulerRequest, context: SchedulerContext): ScheduledNote[] {
  const { progression, contour_slider: slider } = request;
  const contour = context.contour ?? createContourGenerator({ slider });
  return scheduleProgression(progression, { ...context, contour });
}
