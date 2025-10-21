import { parseProgression, type ChordWindow } from "./parser.js";
import { getChordProfile } from "./theory.js";

export interface UnknownChordIssue {
  chordSymbol: string;
  index: number;
  message: string;
}

export interface ValidationSummary {
  windows: ChordWindow[];
  issues: UnknownChordIssue[];
}

export class UnknownChordError extends Error {
  readonly issues: UnknownChordIssue[];

  constructor(issues: UnknownChordIssue[]) {
    const labels = issues.map(issue => `"${issue.chordSymbol}"`).join(", ");
    const detail = labels.length ? `: ${labels}` : "";
    super(`Se encontraron acordes desconocidos${detail}`);
    this.name = "UnknownChordError";
    this.issues = issues;
  }
}

function evaluateChordSymbol(chordSymbol: string, index: number): UnknownChordIssue | null {
  try {
    getChordProfile(chordSymbol);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      chordSymbol,
      index,
      message,
    };
  }
}

export function detectUnknownChords(input: string | ChordWindow[]): ValidationSummary {
  const windows = typeof input === "string" ? parseProgression(input) : input;
  const issues: UnknownChordIssue[] = [];

  windows.forEach((window, index) => {
    const issue = evaluateChordSymbol(window.chordSymbol, index);
    if (issue) {
      issues.push(issue);
    }
  });

  return { windows, issues };
}

export function assertKnownChords(input: string | ChordWindow[]): ChordWindow[] {
  const { windows, issues } = detectUnknownChords(input);
  if (issues.length) {
    throw new UnknownChordError(issues);
  }
  return windows;
}
