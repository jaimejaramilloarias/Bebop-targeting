import { describe, expect, it } from "vitest";
import { availableChordQualities, getChordProfile, getFormulas } from "../src/theory.js";

describe("theory", () => {
  it("carga perfiles de acordes y targets", () => {
    const profile = getChordProfile("Cmaj7");
    expect(profile.targets["7M"].type).toBe(2);
  });

  it("normaliza simbolos con alias comunes", () => {
    const canonical = getChordProfile("Cmaj7");
    const alias = getChordProfile("C∆");
    expect(alias).toBe(canonical);
  });

  it("recupera formulas por tipo", () => {
    const tipo1 = getFormulas(1);
    expect(Array.isArray(tipo1.dobles)).toBe(true);
    expect(tipo1.dobles.length).toBeGreaterThan(0);
  });

  it("validates ø extensions", () => {
    const profile = getChordProfile("Fø");
    expect(profile.extensions_default["9"]).toBe("9m");
  });

  it("expone lista de cualidades disponibles", () => {
    const qualities = availableChordQualities();
    expect(qualities).toContain("maj7");
  });
});
