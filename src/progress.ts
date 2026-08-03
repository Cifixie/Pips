/** Minimal storage interface for test injection. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressStore {
  bestStars(level: number): number;
  highestLevel(): number;
  record(level: number, stars: number): void;
}

const SAVE_KEY = "match-three.progress";

/**
 * Progress persistence backed by localStorage (injectable for tests).
 * Degrades gracefully to memory-only if storage throws.
 */
export function createProgressStore(
  storage: StorageLike | undefined = localStorage,
): ProgressStore {
  let data: Record<number, number> = {};

  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch {
    /* memory-only */
  }

  let dirty = false;

  function persist(): void {
    if (!dirty) return;
    dirty = false;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* degrade silently */
    }
  }

  return {
    bestStars(level): number {
      return data[level] ?? 0;
    },
    highestLevel(): number {
      let best = 0;
      for (const k in data) {
        const n = Number(k);
        if (data[n] > 0 && n > best) best = n;
      }
      return best;
    },
    record(level, stars): void {
      const prev = data[level] ?? 0;
      if (stars > prev) {
        data[level] = stars;
        dirty = true;
      }
      persist();
    },
  };
}
