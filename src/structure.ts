import { parseProgression, type ChordWindow } from "./parser.js";
import type { ScheduledNote } from "./scheduler.js";

export interface StructuredBar {
  index: number;
  startEighth: number;
  lengthEighths: number;
  chordWindows: ChordWindow[];
  notes: ScheduledNote[];
  targets: ScheduledNote[];
}

export interface StructuredData {
  bars: StructuredBar[];
  totalEighths: number;
}

const EIGHTHS_PER_BAR = 8;

function sliceNotes(notes: readonly ScheduledNote[], start: number, end: number): ScheduledNote[] {
  return notes.filter(note => note.t >= start && note.t < end);
}

function collectChordWindows(windows: readonly ChordWindow[], start: number, end: number): ChordWindow[] {
  return windows.filter(window => window.startEighth >= start && window.startEighth < end);
}

export function buildStructuredData(
  progression: string,
  notes: readonly ScheduledNote[],
  totalEighths?: number,
): StructuredData {
  const chordWindows = parseProgression(progression);
  const computedTotal =
    typeof totalEighths === "number" && Number.isFinite(totalEighths)
      ? totalEighths
      : notes.reduce((max, note) => Math.max(max, note.t + note.dur), 0);
  const totalBars = Math.max(1, Math.ceil(computedTotal / EIGHTHS_PER_BAR));
  const bars: StructuredBar[] = [];
  for (let index = 0; index < totalBars; index += 1) {
    const start = index * EIGHTHS_PER_BAR;
    const end = start + EIGHTHS_PER_BAR;
    const barNotes = sliceNotes(notes, start, end);
    const barTargets = barNotes.filter(note => note.src === "target");
    const barWindows = collectChordWindows(chordWindows, start, end);
    bars.push({
      index,
      startEighth: start,
      lengthEighths: EIGHTHS_PER_BAR,
      chordWindows: barWindows,
      notes: barNotes,
      targets: barTargets,
    });
  }
  return { bars, totalEighths: computedTotal };
}
