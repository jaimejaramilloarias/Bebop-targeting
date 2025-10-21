import { describe, expect, it } from "vitest";
import { assertKnownChords, detectUnknownChords, UnknownChordError } from "../src/validation.js";

const VALID_PROGRESSION = "| Dm9  G13 | Cmaj7 |";

describe("validation helpers", () => {
  it("no reporta acordes desconocidos en progresiones válidas", () => {
    const summary = detectUnknownChords(VALID_PROGRESSION);
    expect(summary.issues).toHaveLength(0);
    expect(summary.windows).toHaveLength(3);
  });

  it("identifica acordes desconocidos manteniendo el orden original", () => {
    const progression = "| Dm9  X7#9 | Cmaj7 |";
    const summary = detectUnknownChords(progression);
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toMatchObject({
      chordSymbol: "X7#9",
      index: 1,
    });
    expect(summary.windows[1].chordSymbol).toBe("X7#9");
  });

  it("lanza un error descriptivo cuando existen acordes desconocidos", () => {
    const progression = "| Cmaj7 | Hdim7 |";
    expect(() => assertKnownChords(progression)).toThrowError(UnknownChordError);

    try {
      assertKnownChords(progression);
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownChordError);
      const typed = error as UnknownChordError;
      expect(typed.issues).toHaveLength(1);
      expect(typed.issues[0].chordSymbol).toBe("Hdim7");
      expect(typed.message).toContain("Hdim7");
    }
  });
});
