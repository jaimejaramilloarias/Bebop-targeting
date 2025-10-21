export type NoteSource = "approach" | "target" | "isolated" | "closure";

export interface Note {
  t: number;
  dur: number;
  midi: number;
  pitch?: string;
  src: NoteSource;
  chord?: string;
  degree?: string;
}

export interface ToTextOptions {
  /**
   * Si es true, se agregarán anotaciones opcionales de acorde y grado si están disponibles.
   * Por defecto es true para facilitar la depuración.
   */
  annotateMeta?: boolean;
  /**
   * Formato personalizado para una nota. Permite modificar el texto final por evento.
   */
  formatLine?: (info: FormattedNoteInfo) => string;
}

export interface FormattedNoteInfo {
  bar: number;
  eighth: number;
  note: Note;
  label: string;
  meta: string | null;
}

const EIGHTHS_PER_BAR = 8;

function computeLabel(note: Note): string {
  if (note.pitch && note.pitch.trim()) {
    return note.pitch;
  }
  return `midi:${note.midi}`;
}

function buildMeta(note: Note, annotateMeta: boolean): string | null {
  if (!annotateMeta) {
    return null;
  }
  const pieces: string[] = [];
  if (note.chord) {
    pieces.push(note.chord);
  }
  if (note.degree) {
    pieces.push(`deg ${note.degree}`);
  }
  if (note.dur !== 1) {
    pieces.push(`${note.dur}e`);
  }
  if (pieces.length === 0) {
    return null;
  }
  return `[${pieces.join(", ")}]`;
}

export function formatNote(note: Note, options: ToTextOptions = {}): string {
  const { annotateMeta = true, formatLine } = options;
  const bar = Math.floor(note.t / EIGHTHS_PER_BAR) + 1;
  const eighth = (note.t % EIGHTHS_PER_BAR) + 1;
  const label = computeLabel(note);
  const meta = buildMeta(note, annotateMeta);
  const info: FormattedNoteInfo = { bar, eighth, note, label, meta };
  if (formatLine) {
    return formatLine(info);
  }
  const metaSuffix = meta ? ` ${meta}` : "";
  return `${bar}:${eighth} → ${label} (${note.src})${metaSuffix}`;
}

export function notesToText(notes: readonly Note[], options: ToTextOptions = {}): string {
  return notes.map(note => formatNote(note, options)).join("\n");
}
