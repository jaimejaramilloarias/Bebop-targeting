import { describe, expect, it } from "vitest";
import { createContourGenerator } from "../src/contour.js";
import { getChordProfile } from "../src/theory.js";

function collectMidis(generator: ReturnType<typeof createContourGenerator>, chord: string, iterations: number): number[] {
  const profile = getChordProfile(chord);
  const values: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const target = generator.nextTarget(chord, profile);
    values.push(target.midi);
  }
  return values;
}

describe("contour generator", () => {
  it("alcanza el registro completo cuando slider=0", () => {
    const contour = createContourGenerator({ slider: 0 });
    const midis = collectMidis(contour, "Cmaj7", 16);
    expect(Math.min(...midis)).toBeLessThanOrEqual(60);
    expect(Math.max(...midis)).toBeGreaterThanOrEqual(84);
  });

  it("estrecha el registro cuando slider=1", () => {
    const contour = createContourGenerator({ slider: 1 });
    const midis = collectMidis(contour, "Cmaj7", 16);
    const spread = Math.max(...midis) - Math.min(...midis);
    expect(spread).toBeLessThanOrEqual(8);
  });
});
