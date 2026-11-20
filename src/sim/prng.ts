/**
 * Deterministic PRNG (Mulberry32).
 * Never use Math.random() in src/sim/.
 */
export interface PRNG {
  /** Returns a deterministic float in [0, 1). */
  next(): number;
  /** Returns a deterministic float in [min, max). */
  range(min: number, max: number): number;
}

export function createPRNG(seed: number): PRNG {
  let state = (seed | 0) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range(min: number, max: number): number {
      return min + next() * (max - min);
    },
  };
}
