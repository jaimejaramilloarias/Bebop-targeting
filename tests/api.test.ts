import { describe, expect, it } from "vitest";
import { generateFromRequest, generateMidiStream } from "../src/api.js";
import { UnknownChordError } from "../src/validation.js";

describe("API helpers", () => {
  it("genera notas, texto y artefactos exportables", () => {
    const response = generateFromRequest({
      key: "C",
      progression: "| Dm9  G13 | C∆ |",
      seed: 123,
      swing: true,
      tempo_bpm: 180,
    });
    expect(response.notes.length).toBeGreaterThan(0);
    expect(response.artifacts.text).toMatch(/target/);
    expect(response.meta.totalBars).toBeGreaterThanOrEqual(1);
    expect(response.meta.seed).toBe(123);
    expect(response.structured.bars.length).toBe(response.meta.totalBars);
    expect(response.structured.bars[0]?.chordWindows[0]?.chordSymbol).toBe("Dm9");
    const midiBuffer = Buffer.from(response.artifacts.midiBase64, "base64");
    expect(midiBuffer.length).toBeGreaterThan(32);
    expect(response.artifacts.musicXml).toContain("<score-partwise");
  });

  it("lanza UnknownChordError cuando la progresión contiene acordes desconocidos", () => {
    expect(() =>
      generateFromRequest({ key: "C", progression: "| Cmaj7 | H13 |" }),
    ).toThrow(UnknownChordError);
  });

  it("produce la misma data MIDI para streaming y artefactos base64", () => {
    const request = { key: "C", progression: "| Dm9  G13 | C∆ |", seed: 77 } as const;
    const response = generateFromRequest(request);
    const stream = generateMidiStream(request);
    const artifactBuffer = Buffer.from(response.artifacts.midiBase64, "base64");
    expect(Buffer.compare(artifactBuffer, Buffer.from(stream.midiBinary))).toBe(0);
    expect(stream.meta.seed).toBe(response.meta.seed);
  });
});
