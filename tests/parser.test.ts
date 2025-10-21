import { describe, expect, it } from "vitest";
import { parseProgression } from "../src/parser.js";

describe("parseProgression", () => {
  it("divide compases y asigna duraciones", () => {
    const result = parseProgression("| Dm9  G13 | C∆ |");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ chordSymbol: "Dm9", startEighth: 0, lengthEighths: 4 });
    expect(result[1]).toEqual({ chordSymbol: "G13", startEighth: 4, lengthEighths: 4 });
    expect(result[2]).toEqual({ chordSymbol: "Cmaj7", startEighth: 8, lengthEighths: 8 });
  });

  it("normaliza simbolos con parentesis y signos", () => {
    const result = parseProgression("| F7(b9)  Bø | Eº7 |");
    expect(result[0].chordSymbol).toBe("F7b9");
    expect(result[1].chordSymbol).toBe("Bø");
    expect(result[2].chordSymbol).toBe("Edim7");
  });

  it("lanza error si hay mas de dos acordes por compas", () => {
    expect(() => parseProgression("| Dm7 G7 Cmaj7 |"))
      .toThrow(/Máximo de 2 acordes/);
  });
});
