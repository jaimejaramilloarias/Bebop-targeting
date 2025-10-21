import { describe, expect, it } from "vitest";
import { computeRhythmPlacement } from "../src/rhythm.js";
import type { ChordWindow } from "../src/parser.js";

describe("rhythm", () => {
  it("coloca el target en corcheas impares y agrega aislado si es necesario", () => {
    const window: ChordWindow = { chordSymbol: "Cmaj7", startEighth: 0, lengthEighths: 8 };
    const placement = computeRhythmPlacement(window, 3);
    expect(placement.landing % 2).toBe(1);
    expect(placement.approachStart).toBe(-1);
    expect(placement.isolated).toBe(-2);
  });

  it("selecciona el primer landing disponible cuando la formula cabe completa", () => {
    const window: ChordWindow = { chordSymbol: "F7", startEighth: 8, lengthEighths: 4 };
    const placement = computeRhythmPlacement(window, 2);
    expect(placement.landing).toBe(9);
    expect(placement.approachStart).toBe(8);
    expect(placement.isolated).toBeNull();
  });
});
