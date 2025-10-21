import type { Note } from "./toText.js";
import type { RandomNumberGenerator } from "../rng.js";

const HEADER_CHUNK_ID = [0x4d, 0x54, 0x68, 0x64]; // "MThd"
const TRACK_CHUNK_ID = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"
const HEADER_LENGTH = [0x00, 0x00, 0x00, 0x06];
const FORMAT_TYPE_0 = [0x00, 0x00];
const SINGLE_TRACK_COUNT = [0x00, 0x01];
const TICKS_PER_QUARTER = 480;
const DEFAULT_TEMPO_BPM = 180;
const DEFAULT_VELOCITY = 96;
const DEFAULT_CHANNEL = 0;
const DEFAULT_SWING_RATIO = 2 / 3;

interface MidiEvent {
  tick: number;
  order: number;
  bytes: number[];
}

interface NormalizedNote extends Note {
  t: number;
}

export interface HumanizeOptions {
  rng: RandomNumberGenerator;
  timing?: number;
  velocity?: number;
}

export interface MidiExportOptions {
  tempoBpm?: number;
  swing?: boolean;
  swingRatio?: number;
  channel?: number;
  velocity?: number;
  trackName?: string;
  humanize?: HumanizeOptions;
}

function toUint16Bytes(value: number): [number, number] {
  const clamped = value & 0xffff;
  return [clamped >> 8, clamped & 0xff];
}

function encodeVariableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  let hasContinuation: boolean;
  do {
    bytes.push(buffer & 0xff);
    hasContinuation = (buffer & 0x80) !== 0;
    if (hasContinuation) {
      buffer >>= 8;
    }
  } while (hasContinuation);
  return bytes;
}

function microsecondsPerQuarter(tempoBpm: number): number {
  const tempo = Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : DEFAULT_TEMPO_BPM;
  return Math.round((60_000_000) / tempo);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeNotes(notes: readonly Note[]): { notes: NormalizedNote[]; offset: number } {
  if (!notes.length) {
    return { notes: [], offset: 0 };
  }
  let minStart = Infinity;
  let maxEnd = -Infinity;
  const cloned = notes.map(note => {
    const start = note.t;
    const end = note.t + note.dur;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error("Las notas deben tener tiempos y duraciones finitos");
    }
    minStart = Math.min(minStart, start);
    maxEnd = Math.max(maxEnd, end);
    return { ...note };
  });
  const rawOffset = minStart < 0 ? -minStart : 0;
  const offset = rawOffset % 2 === 0 ? rawOffset : rawOffset + 1;
  if (offset !== 0) {
    cloned.forEach(note => {
      note.t += offset;
    });
  }
  return { notes: cloned as NormalizedNote[], offset };
}

function randomBipolar(rng: RandomNumberGenerator): number {
  return rng.nextFloat() * 2 - 1;
}

interface MidiNoteTiming {
  start: number;
  end: number;
  midi: number;
  velocity: number;
}

function computeMidiNoteTimings(
  notes: readonly NormalizedNote[],
  swingRatio: number | null,
  baseVelocity: number,
  humanize: HumanizeOptions | undefined,
): MidiNoteTiming[] {
  const timings: MidiNoteTiming[] = [];
  const velocityBase = clamp(Math.round(baseVelocity), 1, 127);
  const offsetRange = humanize && typeof humanize.timing === "number"
    ? Math.round(TICKS_PER_QUARTER * clamp(humanize.timing, 0, 0.5))
    : 0;
  const velocitySpread = humanize && typeof humanize.velocity === "number"
    ? Math.round(velocityBase * clamp(humanize.velocity, 0, 1))
    : 0;
  const rng = humanize?.rng;
  notes.forEach(note => {
    const baseStart = eighthToTicks(note.t, swingRatio);
    const baseEnd = eighthToTicks(note.t + note.dur, swingRatio);
    const duration = Math.max(12, baseEnd - baseStart);
    let start = baseStart;
    if (rng && offsetRange > 0) {
      const offset = Math.round(randomBipolar(rng) * offsetRange);
      const maxStart = Math.max(baseStart, baseEnd - 6);
      start = clamp(baseStart + offset, 0, maxStart);
      if (timings.length && start < timings[timings.length - 1].start) {
        start = timings[timings.length - 1].start;
      }
    } else if (timings.length && start < timings[timings.length - 1].start) {
      start = timings[timings.length - 1].start;
    }
    let velocity = velocityBase;
    if (rng && velocitySpread > 0) {
      const delta = Math.round(randomBipolar(rng) * velocitySpread);
      velocity = clamp(velocityBase + delta, 1, 127);
    }
    const end = start + duration;
    timings.push({ start, end, midi: note.midi, velocity });
  });
  return timings;
}

function eighthToTicks(eighth: number, swingRatio: number | null): number {
  const quarterTicks = TICKS_PER_QUARTER;
  const beatIndex = Math.floor(eighth / 2);
  const position = eighth % 2;
  const beatStart = beatIndex * quarterTicks;
  if (position === 0) {
    return beatStart;
  }
  if (swingRatio === null) {
    return beatStart + quarterTicks / 2;
  }
  const ratio = clamp(swingRatio, 0, 1);
  return beatStart + Math.round(quarterTicks * ratio);
}

function createMetaEvent(tick: number, order: number, type: number, data: number[]): MidiEvent {
  return { tick, order, bytes: [0xff, type, data.length, ...data] };
}

function createTextMeta(tick: number, order: number, text: string): MidiEvent {
  const encoder = new TextEncoder();
  const payload = Array.from(encoder.encode(text));
  return { tick, order, bytes: [0xff, 0x01, payload.length, ...payload] };
}

function buildHeaderChunk(): number[] {
  return [
    ...HEADER_CHUNK_ID,
    ...HEADER_LENGTH,
    ...FORMAT_TYPE_0,
    ...SINGLE_TRACK_COUNT,
    ...toUint16Bytes(TICKS_PER_QUARTER),
  ];
}

function buildTrackChunk(events: MidiEvent[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const bytes: number[] = [];
  let lastTick = 0;
  for (const event of sorted) {
    const delta = event.tick - lastTick;
    if (delta < 0) {
      throw new Error("Los eventos MIDI deben estar en orden cronológico");
    }
    bytes.push(...encodeVariableLength(delta));
    bytes.push(...event.bytes);
    lastTick = event.tick;
  }
  bytes.push(0x00, 0xff, 0x2f, 0x00);
  const length = bytes.length;
  return [
    ...TRACK_CHUNK_ID,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...bytes,
  ];
}

function realiseNoteEvents(timings: readonly MidiNoteTiming[], channel: number): MidiEvent[] {
  const events: MidiEvent[] = [];
  timings.forEach(timing => {
    events.push({
      tick: timing.start,
      order: 10,
      bytes: [0x90 | (channel & 0x0f), timing.midi & 0x7f, clamp(Math.round(timing.velocity), 1, 127)],
    });
    events.push({
      tick: timing.end,
      order: 20,
      bytes: [0x80 | (channel & 0x0f), timing.midi & 0x7f, 0x40],
    });
  });
  return events;
}

export function notesToMidi(notes: readonly Note[], options: MidiExportOptions = {}): Uint8Array {
  const { notes: normalized } = normalizeNotes(notes);
  const tempoMeta = microsecondsPerQuarter(options.tempoBpm ?? DEFAULT_TEMPO_BPM);
  const channel = Number.isInteger(options.channel) ? (options.channel as number) : DEFAULT_CHANNEL;
  const baseVelocity = Number.isFinite(options.velocity) ? Number(options.velocity) : DEFAULT_VELOCITY;
  const swingRatio = options.swing || (typeof options.swingRatio === "number" && options.swingRatio > 0)
    ? clamp(options.swingRatio ?? DEFAULT_SWING_RATIO, 0, 1)
    : null;
  const humanize = options.humanize;
  if (humanize && typeof humanize.rng?.nextFloat !== "function") {
    throw new Error("Las opciones de humanización requieren un RNG válido");
  }

  const events: MidiEvent[] = [
    createMetaEvent(0, 0, 0x58, [0x04, 0x02, 0x18, 0x08]),
    createMetaEvent(0, 1, 0x51, [
      (tempoMeta >>> 16) & 0xff,
      (tempoMeta >>> 8) & 0xff,
      tempoMeta & 0xff,
    ]),
  ];

  const trackName = options.trackName?.trim();
  if (trackName) {
    events.push(createTextMeta(0, 2, trackName));
  }

  if (swingRatio !== null) {
    const label = `Swing ${Math.round(swingRatio * 100)}%`;
    events.push(createTextMeta(0, 3, label));
  }

  const noteTimings = computeMidiNoteTimings(normalized, swingRatio, baseVelocity, humanize);
  events.push(...realiseNoteEvents(noteTimings, channel));

  const data = [...buildHeaderChunk(), ...buildTrackChunk(events)];
  return new Uint8Array(data);
}
