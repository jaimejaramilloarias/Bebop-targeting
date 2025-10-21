import { describe, expect, it } from "vitest";
import {
  generateFromRequest,
  generateVariantsFromRequest,
  type GeneratorVariantsRequest,
} from "../src/api.js";

function makeRequest(progression: string, seed?: number) {
  return {
    key: "C",
    progression,
    seed,
    contour_slider: 0.35,
  };
}

describe("end-to-end progressions", () => {
  it("mantiene anticipaciones y targets en un ii-V-I clásico", () => {
    const response = generateFromRequest(makeRequest("| Dm9  G13 | C∆ |", 321));
    expect(response.meta.totalBars).toBe(2);
    expect(response.notes.some(note => note.src === "approach" && note.t < 8 && note.chord === "Cmaj7")).toBe(true);
    const [firstBar, secondBar] = response.structured.bars;
    expect(firstBar.targets.length).toBeGreaterThanOrEqual(2);
    expect(secondBar.targets.length).toBeGreaterThanOrEqual(1);
    expect(secondBar.notes.some(note => note.src === "closure")).toBe(true);
  });

  it("genera variantes con seeds únicas", () => {
    const payload: GeneratorVariantsRequest = {
      baseRequest: makeRequest("| Dm9  G13 | C∆ |"),
      count: 3,
    };
    const response = generateVariantsFromRequest(payload);
    expect(response.variants).toHaveLength(3);
    const seeds = response.variants.map(variant => variant.meta.seed);
    expect(new Set(seeds).size).toBe(response.variants.length);
    const fingerprints = response.variants.map(variant => variant.notes.map(note => `${note.t}:${note.midi}`).join("|"));
    expect(new Set(fingerprints).size).toBeGreaterThan(1);
  });

  it("sostiene voz guía en progresión menor con cierre en el compás final", () => {
    const response = generateFromRequest(makeRequest("| Aø | D7(b9) | Gm7 C7 | F∆ |", 2024));
    expect(response.meta.totalBars).toBe(4);
    expect(response.structured.bars.every(bar => bar.targets.length >= 1)).toBe(true);
    const lastBar = response.structured.bars[response.structured.bars.length - 1];
    expect(lastBar).toBeTruthy();
    if (lastBar) {
      const closure = lastBar.notes.find(note => note.src === "closure");
      expect(closure).toBeTruthy();
      if (closure) {
        expect(closure.t % 2).toBe(0);
      }
    }
    const bridgeBar = response.structured.bars[2];
    const chordNames = bridgeBar.chordWindows.map(window => window.chordSymbol);
    expect(chordNames).toContain("Gm7");
    expect(chordNames).toContain("C7");
  });

  it("genera aproximaciones para cada cifrado provisto", () => {
    const progression = "| Fm7 Bb7 | Ebmaj7 |";
    const response = generateFromRequest(makeRequest(progression, 77));
    const chordSymbols = new Set(
      response.structured.bars.flatMap(bar => bar.chordWindows.map(window => window.chordSymbol)),
    );
    expect(chordSymbols.size).toBeGreaterThan(0);
    const approachNotes = response.notes.filter(note => note.src === "approach" && Boolean(note.chord));
    expect(approachNotes.length).toBeGreaterThan(0);
    const chordsWithApproach = new Set(approachNotes.map(note => note.chord!));
    expect(chordsWithApproach).toEqual(chordSymbols);
  });
});
