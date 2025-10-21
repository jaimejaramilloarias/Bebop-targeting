import { describe, expect, it } from "vitest";
import { scheduleProgression } from "../src/scheduler.js";
import { makeRng } from "../src/rng.js";
import { createContourGenerator } from "../src/contour.js";

function buildContext(seed = 42) {
  return {
    rng: makeRng(seed),
    contour: createContourGenerator({ slider: 0.2 }),
  };
}

describe("scheduler", () => {
  it("programa targets y aproximaciones con anticipaciones", () => {
    const context = buildContext(99);
    const notes = scheduleProgression("| Dm9  G13 | C∆ |", context);
    const targets = notes.filter(note => note.src === "target");
    expect(targets.length).toBeGreaterThanOrEqual(3);
    const firstBarTargets = targets.filter(note => note.t < 8);
    expect(firstBarTargets.length).toBe(2);
    const secondBarTargets = targets.filter(note => note.t >= 8);
    expect(secondBarTargets.length).toBeGreaterThanOrEqual(1);
    const anticipation = notes.find(
      note => note.src === "approach" && note.chord === "Cmaj7" && note.t < 8,
    );
    expect(anticipation).toBeTruthy();
    const closure = notes.find(note => note.src === "closure");
    expect(closure).toBeTruthy();
    if (closure) {
      expect(closure.t % 2).toBe(0);
      const lastTarget = targets.reduce((latest, note) => (note.t > latest.t ? note : latest), targets[0]);
      expect(Math.abs(closure.midi - lastTarget.midi)).toBeLessThanOrEqual(11);
    }
  });
});
