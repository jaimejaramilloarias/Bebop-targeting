import type { FormulaType } from "./theory.js";

export interface FormulaDescriptor {
  pattern: readonly number[];
  group: string;
}

export interface FormulaPolicyConfig {
  lengthWeights?: Partial<Record<FormulaType, Partial<Record<number, number>>>>;
  groupWeights?: Partial<Record<FormulaType, Partial<Record<string, number>>>>;
  repeatTipoPenalty?: number;
}

export interface RhythmPolicyConfig {
  landingOrder?: Partial<Record<number, number[]>>;
}

export interface PolicyConfig {
  formula?: FormulaPolicyConfig;
  rhythm?: RhythmPolicyConfig;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class PolicyManager {
  private lastTipo: FormulaType | null = null;

  constructor(public readonly config: PolicyConfig = {}) {}

  evaluateFormulaWeight(tipo: FormulaType, descriptor: FormulaDescriptor, baseWeight: number): number {
    let weight = baseWeight;
    const length = descriptor.pattern.length;
    if (this.config.formula?.lengthWeights?.[tipo]?.[length] !== undefined) {
      weight *= this.config.formula.lengthWeights[tipo]![length]!;
    }
    const groupWeight = this.config.formula?.groupWeights?.[tipo]?.[descriptor.group];
    if (groupWeight !== undefined) {
      weight *= groupWeight;
    }
    const penalty = clamp(this.config.formula?.repeatTipoPenalty ?? 0, 0, 0.95);
    if (penalty > 0 && this.lastTipo === tipo) {
      weight *= 1 - penalty;
    }
    return weight;
  }

  registerSelectedTipo(tipo: FormulaType): void {
    this.lastTipo = tipo;
  }

  getLandingPreferences(windowLength: number): number[] | null {
    const preferences = this.config.rhythm?.landingOrder?.[windowLength];
    if (!preferences || preferences.length === 0) {
      return null;
    }
    return [...preferences];
  }
}

export function createPolicyManager(config?: PolicyConfig): PolicyManager {
  return new PolicyManager(config);
}
