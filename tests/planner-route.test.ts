import { afterEach, describe, expect, it } from "vitest";
import {
  loadPlannerPlan,
  savePlannerPlan,
  validatePlannerBody,
  type StoredPlannerState,
} from "../lib/planner-store";

function planMem() {
  return (globalThis as unknown as {
    __bbPlan?: Map<string, StoredPlannerState>;
  }).__bbPlan;
}

function makeSlots(count: number): Record<string, string | null> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`S${index + 1}`, `player-${index + 1}`])
  );
}

afterEach(() => {
  planMem()?.clear();
});

describe("planner body validation", () => {
  it("akzeptiert einen gültigen Body", () => {
    const result = validatePlannerBody({
      slots: { GK: "player-1", D1: null },
      sells: ["player-2"],
    });

    expect(result).toEqual({
      ok: true,
      data: { slots: { GK: "player-1", D1: null }, sells: ["player-2"] },
    });
  });

  it("lehnt mehr als 30 Slots ab", () => {
    expect(validatePlannerBody({ slots: makeSlots(31), sells: [] })).toEqual({
      ok: false,
      error: "TOO_LARGE",
    });
  });

  it("lehnt mehr als 50 Verkäufe ab", () => {
    expect(
      validatePlannerBody({
        slots: { GK: "player-1" },
        sells: Array.from({ length: 51 }, (_, index) => `player-${index + 1}`),
      })
    ).toEqual({ ok: false, error: "TOO_LARGE" });
  });

  it("lehnt kaputte Bodies ab", () => {
    expect(validatePlannerBody({ slots: { GK: 1 }, sells: [] })).toEqual({
      ok: false,
      error: "INVALID_INPUT",
    });
  });
});

describe("planner in-memory store", () => {
  it("trennt Pläne nach User", async () => {
    await savePlannerPlan("user-a", "league-1", {
      slots: { GK: "player-a" },
      sells: [],
    });
    await savePlannerPlan("user-b", "league-1", {
      slots: { GK: "player-b" },
      sells: ["sell-b"],
    });

    await expect(loadPlannerPlan("user-a", "league-1")).resolves.toMatchObject({
      ok: true,
      plan: { slots: { GK: "player-a" }, sells: [] },
    });
    await expect(loadPlannerPlan("user-b", "league-1")).resolves.toMatchObject({
      ok: true,
      plan: { slots: { GK: "player-b" }, sells: ["sell-b"] },
    });
  });

  it("trennt Pläne nach Liga", async () => {
    await savePlannerPlan("user-a", "league-1", {
      slots: { GK: "player-1" },
      sells: [],
    });
    await savePlannerPlan("user-a", "league-2", {
      slots: { GK: "player-2" },
      sells: ["sell-2"],
    });

    await expect(loadPlannerPlan("user-a", "league-1")).resolves.toMatchObject({
      ok: true,
      plan: { slots: { GK: "player-1" }, sells: [] },
    });
    await expect(loadPlannerPlan("user-a", "league-2")).resolves.toMatchObject({
      ok: true,
      plan: { slots: { GK: "player-2" }, sells: ["sell-2"] },
    });
  });

  it("liefert null für nie gespeicherte Pläne", async () => {
    await expect(loadPlannerPlan("empty-user", "empty-league")).resolves.toEqual({
      ok: true,
      plan: null,
    });
  });
});
