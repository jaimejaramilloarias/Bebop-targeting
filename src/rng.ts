export interface RandomNumberGenerator {
  nextFloat(): number;
  nextInt(maxExclusive: number): number;
  choiceWeighted<T>(items: readonly T[], weights: readonly number[]): T;
}

const UINT32_MAX = 0xffffffff;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_MAX;
  };
}

export function makeRng(seed: number): RandomNumberGenerator {
  if (!Number.isFinite(seed)) {
    throw new Error("Seed inválida: debe ser un número finito");
  }
  const generator = mulberry32(seed);
  return {
    nextFloat(): number {
      return generator();
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error("maxExclusive debe ser un entero positivo");
      }
      return Math.floor(generator() * maxExclusive);
    },
    choiceWeighted<T>(items: readonly T[], weights: readonly number[]): T {
      if (items.length === 0) {
        throw new Error("La lista de ítems no puede estar vacía");
      }
      if (items.length !== weights.length) {
        throw new Error("items y weights deben tener la misma longitud");
      }
      const total = weights.reduce((sum, w) => {
        if (w < 0 || !Number.isFinite(w)) {
          throw new Error("Los pesos deben ser números no negativos y finitos");
        }
        return sum + w;
      }, 0);
      if (total === 0) {
        throw new Error("La suma de los pesos no puede ser 0");
      }
      const threshold = generator() * total;
      let cumulative = 0;
      for (let i = 0; i < items.length; i += 1) {
        cumulative += weights[i];
        if (threshold < cumulative) {
          return items[i];
        }
      }
      return items[items.length - 1];
    },
  };
}
