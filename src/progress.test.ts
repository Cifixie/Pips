import { describe, expect, it } from "vitest";
import { createProgressStore, type StorageLike } from "./progress";

const makeFakeStorage = (): { storage: StorageLike; calls: string[][] } => {
  const data = new Map<string, string>();
  const calls: string[][] = [];
  return {
    storage: {
      getItem(key: string): string | null {
        calls.push(["getItem", key]);
        return data.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        calls.push(["setItem", key, value]);
        data.set(key, value);
      },
    },
    calls,
  };
};

describe("createProgressStore", () => {
  it("starts empty when no data in storage", () => {
    const { storage } = makeFakeStorage();
    const store = createProgressStore(storage);
    expect(store.bestStars(1)).toBe(0);
    expect(store.highestLevel()).toBe(0);
  });

  it("loads existing data from storage", () => {
    const { storage } = makeFakeStorage();
    storage.setItem("match-three.progress", JSON.stringify({ 1: 3, 2: 2 }));
    const store = createProgressStore(storage);
    expect(store.bestStars(1)).toBe(3);
    expect(store.bestStars(2)).toBe(2);
    expect(store.bestStars(3)).toBe(0);
    expect(store.highestLevel()).toBe(2);
  });

  it("records a new best and persists", () => {
    const { storage, calls } = makeFakeStorage();
    const store = createProgressStore(storage);
    store.record(3, 2);
    expect(store.bestStars(3)).toBe(2);
    // Second call with same stars should not persist again
    store.record(3, 2);
    expect(calls.filter(([c]) => c === "setItem").length).toBe(1);
  });

  it("only updates on a higher rating", () => {
    const { storage } = makeFakeStorage();
    const store = createProgressStore(storage);
    store.record(3, 2);
    // Same stars should not change anything
    store.record(3, 1);
    expect(store.bestStars(3)).toBe(2);
    // Higher stars should update
    store.record(3, 3);
    expect(store.bestStars(3)).toBe(3);
  });

  it("tracks highestLevel", () => {
    const { storage } = makeFakeStorage();
    const store = createProgressStore(storage);
    expect(store.highestLevel()).toBe(0);
    store.record(1, 1);
    expect(store.highestLevel()).toBe(1);
    store.record(5, 3);
    expect(store.highestLevel()).toBe(5);
    store.record(3, 2); // 3 < 5, shouldn't affect highestLevel
    expect(store.highestLevel()).toBe(5);
  });

  it("degrades to memory when storage throws on getItem", () => {
    const throwingStorage: StorageLike = {
      getItem(): string | null {
        throw new Error("localStorage unavailable");
      },
      setItem(): void {
        throw new Error("localStorage unavailable");
      },
    };
    const store = createProgressStore(throwingStorage);
    store.record(7, 2);
    expect(store.bestStars(7)).toBe(2);
    expect(store.highestLevel()).toBe(7);
  });

  it("degrades to memory when storage throws on setItem", () => {
    const { storage } = makeFakeStorage();
    storage.getItem = () => JSON.stringify({ 2: 1 });
    const throwingStorage: StorageLike = {
      getItem: storage.getItem.bind(storage),
      setItem(): void {
        throw new Error("write failed");
      },
    };
    const store = createProgressStore(throwingStorage);
    expect(store.bestStars(2)).toBe(1);
    store.record(2, 2);
    expect(store.bestStars(2)).toBe(2);
  });
});
