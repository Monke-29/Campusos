// Small deterministic RNG shared by the 3D scene (same layout every load).
export function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
