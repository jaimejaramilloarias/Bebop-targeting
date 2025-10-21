import { describe, expect, it } from "vitest";
import { notesToMusicXML } from "../src/exporter/toMusicXML.js";
import type { Note } from "../src/exporter/toText.js";

function extractMeasures(xml: string): Array<{ number: number; body: string }> {
  const matches = xml.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g);
  return Array.from(matches, match => ({ number: Number.parseInt(match[1], 10), body: match[2] }));
}

describe("exporter/toMusicXML", () => {
  const sampleNotes: Note[] = [
    { t: -1, dur: 1, midi: 62, pitch: "D4", src: "approach" },
    { t: 0, dur: 1, midi: 64, pitch: "E4", src: "target" },
    { t: 5, dur: 1, midi: 65, pitch: "F4", src: "approach" },
    { t: 8, dur: 1, midi: 67, pitch: "G4", src: "closure" },
  ];

  it("genera MusicXML con compases completos y texto de swing", () => {
    const xml = notesToMusicXML(sampleNotes, { swing: true, title: "Demo" });
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<work-title>Demo</work-title>");
    expect(xml).toContain("<beats>4</beats>");
    expect(xml).toContain("Swing feel");
    const measures = extractMeasures(xml);
    expect(measures.length).toBeGreaterThanOrEqual(2);
    measures.forEach(measure => {
      const durations = Array.from(measure.body.matchAll(/<duration>(\d+)<\/duration>/g), match => Number.parseInt(match[1], 10));
      const total = durations.reduce((sum, value) => sum + value, 0);
      expect(total).toBe(4 * 480);
    });
  });

  it("anota la fuente de las notas y rellena huecos con silencios", () => {
    const xml = notesToMusicXML(sampleNotes, { annotateSources: true, partName: "Sax" });
    expect(xml).toContain("<part-name>Sax</part-name>");
    expect(xml).toContain("<lyric>\n    <text>target</text>\n  </lyric>");
    const measures = extractMeasures(xml);
    const firstMeasure = measures[0];
    expect(firstMeasure.body).toContain("<rest/");
  });
});
