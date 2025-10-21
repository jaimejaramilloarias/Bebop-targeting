import type { Note } from "./toText.js";

const DIVISIONS = 480;
const EIGHTHS_PER_MEASURE = 8;
const EIGHTH_DURATION = DIVISIONS / 2;

interface NormalizedNote extends Note {
  t: number;
}

interface PitchComponents {
  step: string;
  alter: number;
  octave: number;
}

export interface MusicXMLOptions {
  title?: string;
  partName?: string;
  swing?: boolean;
  swingText?: string;
  annotateSources?: boolean;
}

const PITCH_CLASS_TABLE: PitchComponents[] = [
  { step: "C", alter: 0, octave: 0 },
  { step: "C", alter: 1, octave: 0 },
  { step: "D", alter: 0, octave: 0 },
  { step: "D", alter: 1, octave: 0 },
  { step: "E", alter: 0, octave: 0 },
  { step: "F", alter: 0, octave: 0 },
  { step: "F", alter: 1, octave: 0 },
  { step: "G", alter: 0, octave: 0 },
  { step: "G", alter: 1, octave: 0 },
  { step: "A", alter: 0, octave: 0 },
  { step: "A", alter: 1, octave: 0 },
  { step: "B", alter: 0, octave: 0 },
];

function normalizeNotes(notes: readonly Note[]): NormalizedNote[] {
  if (!notes.length) {
    return [];
  }
  let minStart = Infinity;
  const cloned = notes.map(note => {
    const start = note.t;
    if (!Number.isFinite(start)) {
      throw new Error("Las notas deben tener tiempos válidos");
    }
    minStart = Math.min(minStart, start);
    return { ...note };
  });
  const rawOffset = minStart < 0 ? -minStart : 0;
  const offset = rawOffset % 2 === 0 ? rawOffset : rawOffset + 1;
  if (offset) {
    cloned.forEach(note => {
      note.t += offset;
    });
  }
  return cloned as NormalizedNote[];
}

function toPitchComponents(midi: number): PitchComponents {
  const semitone = ((midi % 12) + 12) % 12;
  const base = PITCH_CLASS_TABLE[semitone];
  const octave = Math.floor(midi / 12) - 1;
  return { step: base.step, alter: base.alter, octave };
}

function durationToType(length: number): { type: string; dots: number } {
  switch (length) {
    case 1:
      return { type: "eighth", dots: 0 };
    case 2:
      return { type: "quarter", dots: 0 };
    case 4:
      return { type: "half", dots: 0 };
    case 8:
      return { type: "whole", dots: 0 };
    case 3:
      return { type: "quarter", dots: 1 };
    case 6:
      return { type: "half", dots: 1 };
    default:
      return { type: "eighth", dots: 0 };
  }
}

function renderNote(note: NormalizedNote, length: number, annotate: boolean): string {
  const components = toPitchComponents(note.midi);
  const { type, dots } = durationToType(length);
  const duration = length * EIGHTH_DURATION;
  const parts: string[] = ["<note>"];
  parts.push("  <pitch>");
  parts.push(`    <step>${components.step}</step>`);
  if (components.alter !== 0) {
    parts.push(`    <alter>${components.alter}</alter>`);
  }
  parts.push(`    <octave>${components.octave}</octave>`);
  parts.push("  </pitch>");
  parts.push(`  <duration>${duration}</duration>`);
  parts.push("  <voice>1</voice>");
  parts.push(`  <type>${type}</type>`);
  for (let i = 0; i < dots; i += 1) {
    parts.push("  <dot/>");
  }
  if (annotate && note.src) {
    parts.push("  <lyric>");
    parts.push(`    <text>${note.src}</text>`);
    parts.push("  </lyric>");
  }
  parts.push("</note>");
  return parts.join("\n");
}

function renderRest(length: number): string {
  const { type, dots } = durationToType(length);
  const duration = length * EIGHTH_DURATION;
  const parts: string[] = ["<note>"];
  parts.push("  <rest/>");
  parts.push(`  <duration>${duration}</duration>`);
  parts.push("  <voice>1</voice>");
  parts.push(`  <type>${type}</type>`);
  for (let i = 0; i < dots; i += 1) {
    parts.push("  <dot/>");
  }
  parts.push("</note>");
  return parts.join("\n");
}

function measureContent(
  notes: readonly NormalizedNote[],
  measureIndex: number,
  annotateSources: boolean,
): string {
  const start = measureIndex * EIGHTHS_PER_MEASURE;
  const end = start + EIGHTHS_PER_MEASURE;
  const noteMap = new Map<number, NormalizedNote[]>();
  notes.forEach(note => {
    if (note.t >= start && note.t < end) {
      const list = noteMap.get(note.t) ?? [];
      list.push(note);
      noteMap.set(note.t, list);
    }
  });
  const entries = Array.from(noteMap.entries()).sort((a, b) => a[0] - b[0]);
  const content: string[] = [];
  let cursor = start;
  let index = 0;
  while (cursor < end) {
    const nextEntry = entries[index];
    if (nextEntry && nextEntry[0] === cursor) {
      nextEntry[1].forEach((note, noteIndex) => {
        const noteLines = renderNote(note, note.dur, annotateSources).split("\n");
        if (noteIndex > 0) {
          noteLines.splice(1, 0, "  <chord/>");
        }
        content.push(noteLines.join("\n"));
      });
      const step = nextEntry[1].reduce((max, item) => Math.max(max, item.dur), 0) || 1;
      cursor += step;
      index += 1;
    } else {
      const nextStart = nextEntry ? nextEntry[0] : end;
      let gap = Math.max(1, Math.min(nextStart - cursor, end - cursor));
      const allowed = [8, 6, 4, 3, 2, 1];
      while (gap > 0) {
        const chunk = allowed.find(value => value <= gap) ?? 1;
        content.push(renderRest(chunk));
        gap -= chunk;
      }
      cursor = Math.min(nextStart, end);
    }
  }
  return content.join("\n");
}

function buildMeasures(notes: readonly NormalizedNote[], options: MusicXMLOptions): string {
  const annotateSources = options.annotateSources ?? true;
  const last = notes.length ? notes.reduce((max, note) => Math.max(max, note.t + note.dur), 0) : 0;
  const measures = Math.max(1, Math.ceil(last / EIGHTHS_PER_MEASURE) || 1);
  const blocks: string[] = [];
  for (let i = 0; i < measures; i += 1) {
    const segments: string[] = [`<measure number="${i + 1}">`];
    if (i === 0) {
      segments.push(
        "  <attributes>",
        "    <divisions>480</divisions>",
        "    <key>",
        "      <fifths>0</fifths>",
        "    </key>",
        "    <time>",
        "      <beats>4</beats>",
        "      <beat-type>4</beat-type>",
        "    </time>",
        "    <clef>",
        "      <sign>G</sign>",
        "      <line>2</line>",
        "    </clef>",
        "  </attributes>",
      );
      if (options.swing || options.swingText) {
        const text = options.swingText ?? "Swing feel";
        segments.push(
          "  <direction placement=\"above\">",
          "    <direction-type>",
          `      <words>${text}</words>`,
          "    </direction-type>",
          "  </direction>",
        );
      }
    }
    const measureData = notes.length ? measureContent(notes, i, annotateSources) : renderRest(EIGHTHS_PER_MEASURE);
    segments.push(measureData);
    segments.push("</measure>");
    blocks.push(segments.join("\n"));
  }
  return blocks.join("\n");
}

export function notesToMusicXML(notes: readonly Note[], options: MusicXMLOptions = {}): string {
  const normalized = normalizeNotes(notes);
  const title = options.title ?? "Bebop Targeting";
  const partName = options.partName ?? "Lead";
  const measures = buildMeasures(normalized, options);
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 3.1 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">",
    "<score-partwise version=\"3.1\">",
    "  <work>",
    `    <work-title>${title}</work-title>`,
    "  </work>",
    "  <part-list>",
    "    <score-part id=\"P1\">",
    `      <part-name>${partName}</part-name>`,
    "    </score-part>",
    "  </part-list>",
    "  <part id=\"P1\">",
    measures,
    "  </part>",
    "</score-partwise>",
  ].join("\n");
}
