import { notesToMidi } from "./exporter/toMIDI.js";
import { notesToMusicXML } from "./exporter/toMusicXML.js";
import { notesToText } from "./exporter/toText.js";
import { createContourGenerator } from "./contour.js";
import { makeRng } from "./rng.js";
import {
  scheduleRequest,
  type SchedulerContext,
  type SchedulerRequest,
  type ScheduledNote,
} from "./scheduler.js";
import { assertKnownChords } from "./validation.js";
import { buildStructuredData, type StructuredData } from "./structure.js";

export interface GeneratorMeta {
  progression: string;
  totalEighths: number;
  totalBars: number;
  tempo_bpm?: number;
  swing?: boolean;
  swingRatio: number | null;
  seed: number;
}

export interface GeneratorArtifacts {
  text: string;
  midiBase64: string;
  musicXml: string;
}

export interface GeneratorResponse {
  notes: ScheduledNote[];
  meta: GeneratorMeta;
  artifacts: GeneratorArtifacts;
  structured: StructuredData;
}

export interface GeneratorOptions {
  defaultTempoBpm?: number;
  defaultSwingRatio?: number;
}

export interface GeneratorVariant extends GeneratorResponse {}

export interface GeneratorVariantsResponse {
  variants: GeneratorVariant[];
}

export interface GeneratorVariantsRequest {
  baseRequest: SchedulerRequest;
  count?: number;
  seeds?: number[];
}

const DEFAULT_TEMPO_BPM = 180;
const DEFAULT_SWING_RATIO = 2 / 3;

export function normalizeSeed(rawSeed: number | undefined): number {
  if (rawSeed === undefined) {
    return Math.floor(Date.now() % 0xffffffff);
  }
  if (!Number.isFinite(rawSeed)) {
    throw new Error("La seed debe ser un número finito");
  }
  return Math.trunc(rawSeed);
}

function normalizeSwingRatio(swing: boolean | undefined, ratio: number | undefined, fallback: number): number | null {
  if (swing === true) {
    return typeof ratio === "number" && Number.isFinite(ratio) ? ratio : fallback;
  }
  if (typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0) {
    return ratio;
  }
  return swing ? fallback : null;
}

function createContext(request: SchedulerRequest, seed: number): SchedulerContext {
  const contour = createContourGenerator({ slider: request.contour_slider });
  return {
    rng: makeRng(seed),
    contour,
  };
}

function computeMeta(
  request: SchedulerRequest,
  notes: readonly ScheduledNote[],
  seed: number,
  options: GeneratorOptions,
): GeneratorMeta {
  const totalEighths = notes.reduce((max, note) => Math.max(max, note.t + note.dur), 0);
  const totalBars = Math.max(1, Math.ceil(totalEighths / 8));
  const swingRatio = normalizeSwingRatio(request.swing, undefined, options.defaultSwingRatio ?? DEFAULT_SWING_RATIO);
  return {
    progression: request.progression,
    totalEighths,
    totalBars,
    tempo_bpm: request.tempo_bpm,
    swing: request.swing,
    swingRatio,
    seed,
  };
}

function createArtifacts(
  request: SchedulerRequest,
  notes: readonly ScheduledNote[],
  meta: GeneratorMeta,
  options: GeneratorOptions,
): GeneratorArtifacts {
  const text = notesToText(notes);
  const midiBinary = notesToMidi(notes, {
    tempoBpm: request.tempo_bpm ?? options.defaultTempoBpm ?? DEFAULT_TEMPO_BPM,
    swing: Boolean(request.swing),
    swingRatio: meta.swingRatio ?? undefined,
    trackName: request.progression,
  });
  const midiBase64 = Buffer.from(midiBinary).toString("base64");
  const musicXml = notesToMusicXML(notes, {
    title: request.progression,
    swing: Boolean(request.swing),
    swingText: meta.swingRatio ? `Swing ${Math.round(meta.swingRatio * 100)}%` : undefined,
  });
  return { text, midiBase64, musicXml };
}

export function generateFromRequest(
  request: SchedulerRequest,
  options: GeneratorOptions = {},
): GeneratorResponse {
  if (!request.progression || !request.progression.trim()) {
    throw new Error("La progresión es obligatoria");
  }
  assertKnownChords(request.progression);
  const seed = normalizeSeed(request.seed);
  const context = createContext(request, seed);
  const notes = scheduleRequest(request, context);
  const meta = computeMeta(request, notes, seed, options);
  const artifacts = createArtifacts(request, notes, meta, options);
  const structured = buildStructuredData(request.progression, notes, meta.totalEighths);
  return { notes, meta, artifacts, structured };
}

export function createHttpResponse(
  request: SchedulerRequest,
  options: GeneratorOptions = {},
): GeneratorResponse {
  return generateFromRequest(request, options);
}

function normalizeVariantCount(count: number | undefined): number {
  if (count === undefined) {
    return 2;
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("El número de variantes debe ser un entero positivo");
  }
  return count;
}

function sanitizeSeeds(seeds: number[] | undefined, count: number): number[] | null {
  if (!seeds) {
    return null;
  }
  if (!Array.isArray(seeds)) {
    throw new Error("seeds debe ser un arreglo de números");
  }
  if (seeds.length !== count) {
    throw new Error("La cantidad de seeds debe coincidir con el número de variantes");
  }
  return seeds.map(seed => {
    if (!Number.isFinite(seed)) {
      throw new Error("Cada seed debe ser un número finito");
    }
    return Math.trunc(seed);
  });
}

export function generateVariantsFromRequest(
  payload: GeneratorVariantsRequest,
  options: GeneratorOptions = {},
): GeneratorVariantsResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Se requiere un payload con baseRequest");
  }
  const { baseRequest } = payload;
  if (!baseRequest || typeof baseRequest !== "object") {
    throw new Error("baseRequest es obligatorio");
  }
  const count = normalizeVariantCount(payload.count);
  const providedSeeds = sanitizeSeeds(payload.seeds, count);
  const seeds = providedSeeds ?? (() => {
    const baseSeed = normalizeSeed(baseRequest.seed);
    return Array.from({ length: count }, (_, index) => baseSeed + index);
  })();
  const variants = seeds.map(seed => {
    const request = { ...baseRequest, seed };
    return generateFromRequest(request, options);
  });
  return { variants };
}

export type { SchedulerRequest } from "./scheduler.js";
