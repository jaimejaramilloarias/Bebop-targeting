import { describe, expect, it } from "vitest";
import { scheduleProgression } from "../src/scheduler.js";
import { makeRng } from "../src/rng.js";
import { createContourGenerator } from "../src/contour.js";
import { createPolicyManager, type PolicyManager } from "../src/policies.js";

function buildContext(seed = 42, policy: PolicyManager | undefined = undefined) {
  return {
    rng: makeRng(seed),
    contour: createContourGenerator({ slider: 0.2 }),
    policy,
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

  it("aplica las preferencias de aterrizaje definidas en la política", () => {
    const policy = createPolicyManager({
      rhythm: {
        landingOrder: {
          8: [7, 5, 3, 1],
        },
      },
    });
    const context = buildContext(120, policy);
    const notes = scheduleProgression("| C∆ |", context);
    const target = notes.find(note => note.src === "target");
    expect(target?.t).toBe(7);
    const approaches = notes.filter(note => note.src === "approach");
    expect(approaches.length).toBeGreaterThan(0);
    if (approaches.length) {
      expect(approaches[approaches.length - 1].t).toBeLessThan(target!.t);
    }
  });
});
