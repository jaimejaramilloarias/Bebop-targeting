import { describe, expect, it } from "vitest";
import { createPolicyManager } from "../src/policies.js";

function buildCandidate(pattern: number[], group: string) {
  return { pattern, group } as const;
}

describe("policies", () => {
  it("ajusta los pesos en función de longitud y grupo", () => {
    const manager = createPolicyManager({
      formula: {
        lengthWeights: {
          1: {
            3: 0.5,
            5: 4,
          },
        },
        groupWeights: {
          1: {
            triples: 0.6,
            quintuples: 3,
          },
        },
        repeatTipoPenalty: 0.4,
      },
    });
    const short = buildCandidate([2, -1, 0], "triples");
    const long = buildCandidate([2, -1, 1, -2, 0], "quintuples");
    const base = 2;
    const shortWeight = manager.evaluateFormulaWeight(1, short, base);
    const longWeight = manager.evaluateFormulaWeight(1, long, base);
    expect(longWeight).toBeGreaterThan(shortWeight);
    manager.registerSelectedTipo(1);
    const penalized = manager.evaluateFormulaWeight(1, long, base);
    expect(penalized).toBeLessThan(longWeight);
  });

  it("devuelve preferencias de aterrizaje por longitud de ventana", () => {
    const manager = createPolicyManager({
      rhythm: {
        landingOrder: {
          4: [3, 1],
        },
      },
    });
    expect(manager.getLandingPreferences(4)).toEqual([3, 1]);
    expect(manager.getLandingPreferences(8)).toBeNull();
  });
});
