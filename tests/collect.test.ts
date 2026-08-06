import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDayEntry, collectOnVisit, daySum, round500k } from "../lib/collect/collector";
import {
  loadLeagueCollect,
  recordCashAnchor,
  saveLeagueMeta,
  type LeagueCollectAnchors,
  type LeagueCollectMeta,
} from "../lib/collect/league-store";
import type { KbRankingResponse } from "../lib/kickbase/types";

// Der Collector importiert die Kickbase-API dynamisch – der Mock greift auch
// für `await import(...)`, damit Backfill-Tests ohne Netz laufen.
vi.mock("../lib/kickbase/api", () => ({
  kb: { ranking: vi.fn() },
}));

const DAY_MS = 86_400_000;

function collectMem() {
  return (globalThis as unknown as {
    __bbCollect?: {
      meta: Map<string, LeagueCollectMeta>;
      anchors: Map<string, LeagueCollectAnchors>;
      days: Map<string, import("../lib/collect/league-store").LeagueCollectDays>;
    };
  }).__bbCollect;
}

afterEach(() => {
  vi.useRealTimers();
  collectMem()?.anchors.clear();
  collectMem()?.meta.clear();
  collectMem()?.days.clear();
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

describe("daySum", () => {
  it("summiert die Spieltagspunkte und meldet fehlende Tage mit -1", () => {
    expect(daySum(undefined)).toBe(-1);
    expect(
      daySum({ perManager: { a: { mdp: 120, mdpl: 1 }, b: { mdp: 80, mdpl: 2 } }, collectedAt: 0 })
    ).toBe(200);
  });

  it("bewertet einen Zwischenstand niedriger als den fertigen Spieltag", () => {
    // Genau die Regel, mit der ein zu früh eingesammelter Spieltag geheilt
    // wird: während eines Spieltags wachsen die Punkte, sie schrumpfen nicht.
    const zwischenstand = { perManager: { a: { mdp: 40, mdpl: 1 } }, collectedAt: 0 };
    const fertig = { perManager: { a: { mdp: 190, mdpl: 1 } }, collectedAt: 0 };
    expect(daySum(fertig)).toBeGreaterThan(daySum(zwischenstand));
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

  it("misst NICHT, wenn die Erfolge nicht abgerufen werden konnten", async () => {
    // Ohne echten Erfolge-Wert würde die Schätzung (inkl. 2,2 Mio Pauschale)
    // in die Rechnung fließen und ein um Millionen falsches Startbudget als
    // "gemessen" festschreiben. Dann lieber gar nichts schreiben.
    const leagueId = "junge-liga-ohne-erfolge";
    await collectOnVisit({
      token: "t",
      leagueId,
      userId: "u1",
      ranking,
      leagueStartMs: Date.now() - DAY_MS,
      meRealCash: 48_300_000,
      // ownComponents fehlt, weil der Erfolge-Abruf gepatzt hat
    });

    expect(collectMem()?.meta.get(leagueId)?.startBudget).toBeUndefined();
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

describe("collectOnVisit: Backfill-Nachfassung am laufenden Spieltag", () => {
  const leagueStartMs = Date.now() - 10 * DAY_MS;
  const baseRanking = {
    day: 2,
    us: [{ i: "u1", n: "A", mdp: 0, mdpl: 1 }],
  } as unknown as KbRankingResponse;

  function dayResp(mdp: number): KbRankingResponse {
    return { us: [{ i: "u1", n: "A", mdp, mdpl: 1 }] } as unknown as KbRankingResponse;
  }

  async function resetThrottle(leagueId: string) {
    const loaded = await loadLeagueCollect(leagueId);
    await saveLeagueMeta(leagueId, {
      ...(loaded!.meta as LeagueCollectMeta),
      lastBackfillAt: Date.now() - 2 * 3_600_000,
    });
  }

  it("ersetzt einen Zwischenstand nur durch eine vollständigere Antwort", async () => {
    const leagueId = "backfill-nachfassung";
    const { kb } = await import("../lib/kickbase/api");
    const rankingMock = vi.mocked(kb.ranking);
    rankingMock.mockReset();

    // Besuch 1: Tag 1 fertig (500), Tag 2 läuft noch (100).
    rankingMock.mockImplementation(async (_t, _l, day) =>
      day === 1 ? dayResp(500) : dayResp(100)
    );
    await collectOnVisit({ token: "t", leagueId, userId: "u1", ranking: baseRanking, leagueStartMs });
    let loaded = await loadLeagueCollect(leagueId);
    expect(daySum(loaded?.days[1])).toBe(500);
    expect(daySum(loaded?.days[2])).toBe(100);

    // Besuch 2: Tag 2 ist weitergelaufen (700) -> Nachfassung ersetzt den Zwischenstand.
    await resetThrottle(leagueId);
    rankingMock.mockImplementation(async () => dayResp(700));
    await collectOnVisit({ token: "t", leagueId, userId: "u1", ranking: baseRanking, leagueStartMs });
    loaded = await loadLeagueCollect(leagueId);
    expect(daySum(loaded?.days[2])).toBe(700);

    // Besuch 3: genullte Antwort (Off-Season-Muster) rollt NICHT zurück.
    await resetThrottle(leagueId);
    rankingMock.mockImplementation(async () => dayResp(0));
    await collectOnVisit({ token: "t", leagueId, userId: "u1", ranking: baseRanking, leagueStartMs });
    loaded = await loadLeagueCollect(leagueId);
    expect(daySum(loaded?.days[2])).toBe(700);
    expect(daySum(loaded?.days[1])).toBe(500);
  });

  it("deckelt Backfill + Nachfassung auf insgesamt 5 Calls je Besuch", async () => {
    const leagueId = "backfill-deckel";
    const { kb } = await import("../lib/kickbase/api");
    const rankingMock = vi.mocked(kb.ranking);
    rankingMock.mockReset();
    rankingMock.mockImplementation(async (_t, _l, day) => dayResp(100 + Number(day)));

    // Erster Besuch bei Spieltag 10: sammelt Tage ein und speichert Tag 10.
    const ranking10 = { ...(baseRanking as unknown as Record<string, unknown>), day: 10 } as unknown as KbRankingResponse;
    await collectOnVisit({ token: "t", leagueId, userId: "u1", ranking: ranking10, leagueStartMs });
    expect(rankingMock.mock.calls.length).toBe(5);

    // Zweiter Besuch: die nächsten fehlenden Tage, weiterhin hart auf 5 gedeckelt.
    await resetThrottle(leagueId);
    rankingMock.mockClear();
    await collectOnVisit({ token: "t", leagueId, userId: "u1", ranking: ranking10, leagueStartMs });
    expect(rankingMock.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
