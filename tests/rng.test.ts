import { describe, expect, it } from "vitest";
import { makeRng } from "../src/rng.js";

describe("makeRng", () => {
  it("genera secuencias reproducibles", () => {
    const rngA = makeRng(42);
    const rngB = makeRng(42);
    const seqA = Array.from({ length: 5 }, () => rngA.nextFloat());
    const seqB = Array.from({ length: 5 }, () => rngB.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it("elige elementos ponderados", () => {
    const rng = makeRng(100);
    const counts = { a: 0, b: 0 } as Record<string, number>;
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.choiceWeighted(["a", "b"], [0.9, 0.1]);
      counts[value] += 1;
    }
    expect(counts.a).toBeGreaterThan(counts.b);
  });

  it("lanza si pesos invalidos", () => {
    const rng = makeRng(1);
    expect(() => rng.choiceWeighted([], [])).toThrow();
    expect(() => rng.choiceWeighted(["a"], [0])).toThrow();
  });
});
