import { describe, expect, it } from "vitest";
import { formatNote, notesToText, type Note } from "../src/exporter/toText.js";

describe("exporter/toText", () => {
  const sampleNotes: Note[] = [
    { t: 0, dur: 1, midi: 60, pitch: "C4", src: "approach", chord: "Cmaj7", degree: "3" },
    { t: 5, dur: 2, midi: 64, pitch: "E4", src: "target", chord: "Cmaj7", degree: "3" },
  ];

  it("formatea cada nota con barra y corchea", () => {
    const lines = notesToText(sampleNotes).split("\n");
    expect(lines[0]).toBe("1:1 → C4 (approach) [Cmaj7, deg 3]");
    expect(lines[1]).toBe("1:6 → E4 (target) [Cmaj7, deg 3, 2e]");
  });

  it("omite metadatos cuando se desactiva annotateMeta", () => {
    const line = formatNote(sampleNotes[0], { annotateMeta: false });
    expect(line).toBe("1:1 → C4 (approach)");
  });

  it("permite un formateador personalizado", () => {
    const custom = formatNote(sampleNotes[0], {
      formatLine: ({ bar, eighth, label }) => `${bar}-${eighth}:${label}`,
    });
    expect(custom).toBe("1-1:C4");
  });
});
