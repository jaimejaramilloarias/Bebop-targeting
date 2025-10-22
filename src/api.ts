import { notesToMidi } from "./exporter/toMIDI.js";
import { notesToMusicXML } from "./exporter/toMusicXML.js";
import { notesToText } from "./exporter/toText.js";
import { createContourGenerator } from "./contour.js";
import { makeRng } from "./rng.js";
import { createPolicyManager, type PolicyConfig } from "./policies.js";
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

export interface GeneratorMidiStream {
  notes: ScheduledNote[];
  meta: GeneratorMeta;
  midiBinary: Uint8Array;
  structured: StructuredData;
}

export interface GeneratorOptions {
  defaultTempoBpm?: number;
  defaultSwingRatio?: number;
  policyConfig?: PolicyConfig;
  midiHumanize?: {
    timing?: number;
    velocity?: number;
  };
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

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") {
    const { btoa } = globalThis;
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index];
    const hasByte2 = index + 1 < bytes.length;
    const hasByte3 = index + 2 < bytes.length;
    const byte2 = hasByte2 ? bytes[index + 1] : 0;
    const byte3 = hasByte3 ? bytes[index + 2] : 0;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
    const enc3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
    const enc4 = byte3 & 0x3f;

    output += alphabet[enc1];
    output += alphabet[enc2];
    output += hasByte2 ? alphabet[enc3] : "=";
    output += hasByte3 ? alphabet[enc4] : "=";
  }

  return output;
}

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

function createContext(
  request: SchedulerRequest,
  seed: number,
  options: GeneratorOptions,
): SchedulerContext {
  const contour = createContourGenerator({ slider: request.contour_slider });
  return {
    rng: makeRng(seed),
    contour,
    policy: createPolicyManager(options.policyConfig),
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

function createMidiBinary(
  request: SchedulerRequest,
  notes: readonly ScheduledNote[],
  meta: GeneratorMeta,
  options: GeneratorOptions,
): Uint8Array {
  const humanize = options.midiHumanize
    ? {
        ...options.midiHumanize,
        rng: makeRng((meta.seed >>> 0) ^ 0x6b6b6b),
      }
    : undefined;
  return notesToMidi(notes, {
    tempoBpm: request.tempo_bpm ?? options.defaultTempoBpm ?? DEFAULT_TEMPO_BPM,
    swing: Boolean(request.swing),
    swingRatio: meta.swingRatio ?? undefined,
    trackName: request.progression,
    humanize,
  });
}

function createArtifacts(
  request: SchedulerRequest,
  notes: readonly ScheduledNote[],
  meta: GeneratorMeta,
  options: GeneratorOptions,
): { text: string; midiBinary: Uint8Array; musicXml: string } {
  const text = notesToText(notes);
  const midiBinary = createMidiBinary(request, notes, meta, options);
  const musicXml = notesToMusicXML(notes, {
    title: request.progression,
    swing: Boolean(request.swing),
    swingText: meta.swingRatio ? `Swing ${Math.round(meta.swingRatio * 100)}%` : undefined,
  });
  return { text, midiBinary, musicXml };
}

interface InternalGenerationResult {
  notes: ScheduledNote[];
  meta: GeneratorMeta;
  artifacts: { text: string; midiBinary: Uint8Array; musicXml: string };
  structured: StructuredData;
}

function generateInternals(
  request: SchedulerRequest,
  options: GeneratorOptions,
): InternalGenerationResult {
  if (!request.progression || !request.progression.trim()) {
    throw new Error("La progresión es obligatoria");
  }
  assertKnownChords(request.progression);
  const seed = normalizeSeed(request.seed);
  const context = createContext(request, seed, options);
  const notes = scheduleRequest(request, context);
  const meta = computeMeta(request, notes, seed, options);
  const artifacts = createArtifacts(request, notes, meta, options);
  const structured = buildStructuredData(request.progression, notes, meta.totalEighths);
  return { notes, meta, artifacts, structured };
}

export function generateFromRequest(
  request: SchedulerRequest,
  options: GeneratorOptions = {},
): GeneratorResponse {
  const { notes, meta, artifacts, structured } = generateInternals(request, options);
  const midiBase64 = bytesToBase64(artifacts.midiBinary);
  return {
    notes,
    meta,
    artifacts: { text: artifacts.text, midiBase64, musicXml: artifacts.musicXml },
    structured,
  };
}

export function generateMidiStream(
  request: SchedulerRequest,
  options: GeneratorOptions = {},
): GeneratorMidiStream {
  const { notes, meta, artifacts, structured } = generateInternals(request, options);
  return {
    notes,
    meta,
    midiBinary: artifacts.midiBinary,
    structured,
  };
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
