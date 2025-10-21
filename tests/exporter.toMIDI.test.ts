import { describe, expect, it } from "vitest";
import { notesToMidi } from "../src/exporter/toMIDI.js";
import { scheduleProgression } from "../src/scheduler.js";
import { makeRng } from "../src/rng.js";
import { createContourGenerator } from "../src/contour.js";

interface ParsedMidiEvent {
  tick: number;
  type: "meta" | "on" | "off";
  metaType?: number;
  data?: Uint8Array;
  midi?: number;
  velocity?: number;
}

interface ParsedMidiFile {
  ticksPerQuarter: number;
  events: ParsedMidiEvent[];
}

function readUint32(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];
}

function readUint16(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readVariableLength(buffer: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let pos = offset;
  while (pos < buffer.length) {
    const byte = buffer[pos];
    result = (result << 7) | (byte & 0x7f);
    pos += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { value: result, next: pos };
}

function parseMidi(data: Uint8Array): ParsedMidiFile {
  expect(String.fromCharCode(...data.slice(0, 4))).toBe("MThd");
  const headerLength = readUint32(data, 4);
  expect(headerLength).toBe(6);
  const ticksPerQuarter = readUint16(data, 12);
  const trackHeaderIndex = 8 + headerLength;
  expect(String.fromCharCode(...data.slice(trackHeaderIndex, trackHeaderIndex + 4))).toBe("MTrk");
  const trackLength = readUint32(data, trackHeaderIndex + 4);
  const trackStart = trackHeaderIndex + 8;
  const trackEnd = trackStart + trackLength;
  let cursor = trackStart;
  let absoluteTick = 0;
  let runningStatus = 0;
  const events: ParsedMidiEvent[] = [];
  while (cursor < trackEnd) {
    const delta = readVariableLength(data, cursor);
    absoluteTick += delta.value;
    cursor = delta.next;
    let status = data[cursor];
    cursor += 1;
    if (status < 0x80) {
      cursor -= 1;
      status = runningStatus;
    } else {
      runningStatus = status;
    }
    if (status === 0xff) {
      const type = data[cursor];
      cursor += 1;
      const lengthInfo = readVariableLength(data, cursor);
      cursor = lengthInfo.next;
      const payload = data.slice(cursor, cursor + lengthInfo.value);
      cursor += lengthInfo.value;
      events.push({ tick: absoluteTick, type: "meta", metaType: type, data: payload });
      continue;
    }
    const command = status & 0xf0;
    const param1 = data[cursor];
    cursor += 1;
    let velocity = 0;
    if (command !== 0xc0 && command !== 0xd0) {
      velocity = data[cursor];
      cursor += 1;
    }
    if (command === 0x90 && velocity > 0) {
      events.push({ tick: absoluteTick, type: "on", midi: param1, velocity });
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      events.push({ tick: absoluteTick, type: "off", midi: param1, velocity });
    }
  }
  return { ticksPerQuarter, events };
}

const scheduledNotes = scheduleProgression("| Dm9  G13 | C∆ |", {
  rng: makeRng(7),
  contour: createContourGenerator({ slider: 0.35 }),
});

describe("exporter/toMIDI", () => {
  const sampleNotes = scheduledNotes;

  it("genera un archivo MIDI tipo 0 con tempo y texto de swing", () => {
    const midi = notesToMidi(sampleNotes, { tempoBpm: 200, swing: true, trackName: "Frase" });
    const parsed = parseMidi(midi);
    expect(parsed.ticksPerQuarter).toBe(480);
    const tempoMeta = parsed.events.filter(event => event.type === "meta" && event.metaType === 0x51);
    expect(tempoMeta).toHaveLength(1);
    const textEvents = parsed.events.filter(event => event.type === "meta" && event.metaType === 0x01);
    expect(textEvents.some(event => new TextDecoder().decode(event.data) === "Frase")).toBe(true);
    expect(textEvents.some(event => new TextDecoder().decode(event.data).startsWith("Swing"))).toBe(true);
  });

  it("aplica swing desplazando las corcheas débiles", () => {
    const midiSwing = notesToMidi(sampleNotes, { swing: true });
    const midiStraight = notesToMidi(sampleNotes, { swing: false });
    const parsedSwing = parseMidi(midiSwing);
    const parsedStraight = parseMidi(midiStraight);
    const swingOffbeats = parsedSwing.events.filter(event => event.type === "on" && event.tick % 480 !== 0);
    const straightOffbeats = parsedStraight.events.filter(event => event.type === "on" && event.tick % 480 !== 0);
    expect(straightOffbeats[0]?.tick % 480).toBe(240);
    expect(swingOffbeats[0]?.tick % 480).toBeGreaterThan(240);
    const closureMidi = sampleNotes.find(note => note.src === "closure")?.midi;
    expect(closureMidi).toBeDefined();
    const closureSwing = parsedSwing.events.find(event => event.type === "on" && event.midi === closureMidi);
    expect(closureSwing && closureSwing.tick % 480 === 0).toBe(true);
  });

  it("permite humanizar tiempos y velocidades con RNG determinista", () => {
    const midiBase = notesToMidi(sampleNotes, { swing: true });
    const midiHumanized = notesToMidi(sampleNotes, {
      swing: true,
      humanize: { rng: makeRng(31415), timing: 0.1, velocity: 0.25 },
    });
    const baseEvents = parseMidi(midiBase).events.filter(event => event.type === "on");
    const humanizedEvents = parseMidi(midiHumanized).events.filter(event => event.type === "on");
    expect(humanizedEvents).toHaveLength(baseEvents.length);
    const tickDiffers = humanizedEvents.some((event, index) => event.tick !== baseEvents[index]!.tick);
    const velocityDiffers = humanizedEvents.some(
      (event, index) => event.velocity !== baseEvents[index]!.velocity,
    );
    expect(tickDiffers || velocityDiffers).toBe(true);
  });
});
