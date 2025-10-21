export interface ChordWindow {
  chordSymbol: string;
  startEighth: number;
  lengthEighths: number;
}

const QUALITY_REPLACEMENTS: [RegExp, string][] = [
  [/∆|Δ/g, "maj7"],
  [/ø/g, "ø"],
  [/Ø/g, "ø"],
  [/º7/g, "dim7"],
  [/º/g, "dim"],
  [/\+/g, "#5"],
  [/\(([^)]+)\)/g, "$1"],
  [/\s+/g, ""],
];

function normalizeToken(raw: string): string {
  let token = raw.trim();
  for (const [pattern, replacement] of QUALITY_REPLACEMENTS) {
    token = token.replace(pattern, replacement);
  }
  return token;
}

export function parseProgression(prog: string): ChordWindow[] {
  if (!prog || !prog.trim()) {
    return [];
  }

  const bars = prog
    .split("|")
    .map(bar => bar.trim())
    .filter(Boolean);

  const result: ChordWindow[] = [];
  let cursor = 0;

  for (const bar of bars) {
    const tokens = bar
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      continue;
    }
    if (tokens.length > 2) {
      throw new Error(`Máximo de 2 acordes por compás. Se encontró: "${bar}"`);
    }

    if (tokens.length === 1) {
      result.push({
        chordSymbol: normalizeToken(tokens[0]),
        startEighth: cursor,
        lengthEighths: 8,
      });
      cursor += 8;
    } else {
      result.push({
        chordSymbol: normalizeToken(tokens[0]),
        startEighth: cursor,
        lengthEighths: 4,
      });
      result.push({
        chordSymbol: normalizeToken(tokens[1]),
        startEighth: cursor + 4,
        lengthEighths: 4,
      });
      cursor += 8;
    }
  }

  return result;
}
