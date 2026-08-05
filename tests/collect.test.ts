import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDayEntry, collectOnVisit, round500k } from "../lib/collect/collector";
import {
  recordCashAnchor,
  type LeagueCollectAnchors,
  type LeagueCollectMeta,
} from "../lib/collect/league-store";
import type { KbRankingResponse } from "../lib/kickbase/types";

const DAY_MS = 86_400_000;

function collectMem() {
  return (globalThis as unknown as {
    __bbCollect?: {
      meta: Map<string, LeagueCollectMeta>;
      anchors: Map<string, LeagueCollectAnchors>;
    };
  }).__bbCollect;
}

afterEach(() => {
  vi.useRealTimers();
  collectMem()?.anchors.clear();
  collectMem()?.meta.clear();
});

describe("round500k", () => {
  it("rundet auf das nächste 500k-Vielfache", () => {
    expect(round500k(50_249_999)).toBe(50_000_000);
    expect(round500k(50_250_000)).toBe(50_500_000);
    expect(round500k(0)).toBe(0);
  });
});

describe("buildDayEntry", () => {
  it("verwirft genullte Spieltagsantworten", () => {
    expect(
      buildDayEntry({
        us: [
          { i: "u1", n: "A", mdp: 0, mdpl: 1 },
          { i: "u2", n: "B", mdp: 0, mdpl: 2 },
        ],
      })
    ).toBeNull();
  });

  it("übernimmt alle Manager, wenn mindestens ein Manager Punkte hat", () => {
    const entry = buildDayEntry({
      us: [
        { i: "u1", n: "A", mdp: 0, mdpl: 2 },
        { i: "u2", n: "B", mdp: 12, mdpl: 1 },
      ],
    });

    expect(entry).not.toBeNull();
    expect(entry?.perManager).toEqual({
      u1: { mdp: 0, mdpl: 2 },
      u2: { mdp: 12, mdpl: 1 },
    });
  });
});

describe("collectOnVisit: Startbudget", () => {
  // day: 0 -> kein Backfill, also kein Netzwerkzugriff aus dem Test heraus.
  const ranking = { us: [{ i: "u1", n: "A", tv: 12_000_000 }], day: 0 } as unknown as KbRankingResponse;

  it("verbrennt das Messfenster nicht, wenn der eigene Cash bei diesem Besuch fehlt", async () => {
    const leagueId = "junge-liga-ohne-cash";
    await collectOnVisit({
      token: "t",
      leagueId,
      userId: "u1",
      ranking,
      leagueStartMs: Date.now() - DAY_MS, // 1 Tag alt, also mitten im Messfenster
      // meRealCash und ownComponents fehlen absichtlich (z.B. /me/budget hat gepatzt)
    });

    // Kein Standardbudget festschreiben: ein späterer Besuch soll noch messen können.
    expect(collectMem()?.meta.get(leagueId)?.startBudget).toBeUndefined();
  });

  it("misst das Startbudget bei junger Liga mit vollständigen Daten", async () => {
    const leagueId = "junge-liga-mit-cash";
    await collectOnVisit({
      token: "t",
      leagueId,
      userId: "u1",
      ranking,
      leagueStartMs: Date.now() - DAY_MS,
      meRealCash: 48_300_000,
      ownComponents: {
        transferNet: -2_000_000,
        pointsPremium: 300_000,
        winBonus: 0,
        achievementsTotal: 100_000,
        daysSinceStart: 1,
      },
    });

    const budget = collectMem()?.meta.get(leagueId)?.startBudget;
    expect(budget?.source).toBe("measured");
    // 48,3M + 2M - 0,3M - 0,1M - 10k Tagesbonus = 49,89M -> auf 500k gerundet
    expect(budget?.value).toBe(50_000_000);
  });

  it("schreibt bei einer alten Liga einmalig das Standardbudget fest", async () => {
    const leagueId = "alte-liga";
    await collectOnVisit({
      token: "t",
      leagueId,
      userId: "u1",
      ranking,
      leagueStartMs: Date.now() - 30 * DAY_MS,
    });

    const budget = collectMem()?.meta.get(leagueId)?.startBudget;
    expect(budget?.source).toBe("default");
    expect(budget?.value).toBe(50_000_000);
  });
});

describe("recordCashAnchor", () => {
  it("kappt pro User auf die 90 jüngsten Tagesanker", async () => {
    vi.useFakeTimers();
    const leagueId = "anchor-cap-test";
    const userId = "user-1";
    const start = Date.parse("2026-01-01T12:00:00Z");
    const allDates: string[] = [];

    for (let i = 0; i < 95; i++) {
      const date = new Date(start + i * DAY_MS);
      allDates.push(date.toISOString().slice(0, 10));
      vi.setSystemTime(date);
      await recordCashAnchor(leagueId, userId, 50_000_000 + i);
    }

    const anchors = collectMem()?.anchors.get(leagueId);
    const dates = Object.keys(anchors?.[userId] ?? {}).sort();
    const expected = allDates.slice(-90);

    expect(dates).toEqual(expected);
    expect(dates).not.toContain(allDates[0]);
    expect(anchors?.[userId]?.[expected[0]]).toBe(50_000_005);
  });
});
