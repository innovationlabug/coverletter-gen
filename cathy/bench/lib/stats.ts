export function mean(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function percentile(xs: number[], p: number): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1));
  return v[idx];
}

export function ratio(flags: boolean[]): number | null {
  return flags.length ? flags.filter(Boolean).length / flags.length : null;
}

/** PRNG determinista (mulberry32) para aleatorizar el orden del juez de forma reproducible. */
export function seededRandom(seedText: string): () => number {
  let a = 0;
  for (const ch of seedText) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
