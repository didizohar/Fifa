export type RNG = () => number;

export const defaultRNG: RNG = Math.random;

/** Deterministic RNG for tests -- never use uncontrolled randomness in a test. */
export function createSeededRng(seed: number): RNG {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle. Never use `array.sort(() => Math.random() - 0.5)` --
 * it produces a biased, non-uniform permutation.
 */
export function shuffle<T>(items: readonly T[], rng: RNG = defaultRNG): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Uniform random sample of `count` items without replacement (capped at the input length). */
export function sample<T>(items: readonly T[], count: number, rng: RNG = defaultRNG): T[] {
  const bounded = Math.max(0, Math.min(count, items.length));
  return shuffle(items, rng).slice(0, bounded);
}
