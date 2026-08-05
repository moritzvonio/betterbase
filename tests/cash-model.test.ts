/**
 * Tests für das Cash-Strukturmodell (lib/competitor.ts).
 *
 * Referenzwerte stammen aus dem echten Snapshot Liga 089 (2026-07-06) –
 * eigener Account, echter Cash 50.888.168 aus /me/budget. Die Zahlen sind
 * hier als destilliertes Fixture eingefroren (keine Rohdaten nötig).
 */
import { describe, expect, it } from "vitest";
import {
  calibrateFromOwnAccount,
  calibrateResidualPerPoint,
  computeManagerStats,
  estimateDailyBonus,
  teamValueMilestonePayout,
  DEFAULT_CALIBRATION,
} from "../lib/competitor";
import { teamPointsTierPayout, MATCHDAY_WIN_PREMIUM } from "../lib/kickbase/bonus-catalog";
import type { KbManagerTransfer } from "../lib/kickbase/types";

const LEAGUE_START = Date.parse("2025-08-01T10:10:10Z");
const NOW = Date.parse("2026-07-06T02:47:00Z");
const DAY = 86_400_000;

function tx(daysAfterStart: number, tty: 1 | 2, trp: number): KbManagerTransfer {
  return {
    pi: `p${daysAfterStart}-${tty}-${trp}`,
    pn: "Testspieler",
    tid: "1",
    tty,
    trp,
    dt: new Date(LEAGUE_START + daysAfterStart * DAY).toISOString(),
  };
}

describe("estimateDailyBonus", () => {
  it("rampt Tag 1-10 von 10k auf 100k (Σ 550k)", () => {
    expect(estimateDailyBonus(1)).toBe(10_000);
    expect(estimateDailyBonus(2)).toBe(30_000);
    expect(estimateDailyBonus(10)).toBe(550_000);
  });
  it("zahlt danach 100k pro Tag", () => {
    expect(estimateDailyBonus(11)).toBe(650_000);
    expect(estimateDailyBonus(338)).toBe(550_000 + 328 * 100_000);
  });
  it("liefert 0 für 0 oder negative Tage", () => {
    expect(estimateDailyBonus(0)).toBe(0);
    expect(estimateDailyBonus(-5)).toBe(0);
  });
});

describe("teamPointsTierPayout (exklusive Tiers)", () => {
  it("zahlt nur den höchsten erreichten Tier", () => {
    expect(teamPointsTierPayout(400)).toBe(0);
    expect(teamPointsTierPayout(500)).toBe(100_000);
    expect(teamPointsTierPayout(999)).toBe(100_000);
    expect(teamPointsTierPayout(1000)).toBe(250_000);
    expect(teamPointsTierPayout(1500)).toBe(1_000_000);
    expect(teamPointsTierPayout(2000)).toBe(2_000_000);
  });
});

describe("teamValueMilestonePayout", () => {
  it("kumuliert alle erreichten Meilensteine", () => {
    expect(teamValueMilestonePayout(90_000_000)).toBe(0);
    expect(teamValueMilestonePayout(100_000_000)).toBe(100_000);
    // 100+150+200+250+300M erreicht → 100k+250k+500k+1M+2M = 3,85M
    expect(teamValueMilestonePayout(316_000_000)).toBe(3_850_000);
  });
});

describe("computeManagerStats – Strukturmodell", () => {
  it("ignoriert Transfers vor Liga-Start (Reset-Modell)", () => {
    const stats = computeManagerStats({
      userId: "u1",
      name: "Test",
      transfers: [tx(-30, 2, 99_000_000), tx(5, 1, 10_000_000), tx(20, 2, 12_000_000)],
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    expect(stats.preStartTransferCount).toBe(1);
    expect(stats.transferCount).toBe(2);
    expect(stats.transferBalance).toBe(2_000_000);
  });

  it("rechnet den Tier-Anteil aus beobachteten Spieltagspunkten exakt", () => {
    const observedMatchdayPoints = [385, 561, 1500, 2000];
    const expectedTiers = observedMatchdayPoints.reduce(
      (sum, mdp) => sum + teamPointsTierPayout(mdp),
      0
    );
    const stats = computeManagerStats({
      userId: "u1",
      name: "Test",
      dashboard: { tp: 4446, mdw: 0 },
      observedMatchdayPoints,
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    expect(teamPointsTierPayout(1500)).toBe(1_000_000);
    expect(expectedTiers).toBe(3_100_000);
    expect(stats.achievementParts.tiers).toBe(expectedTiers);
    expect(stats.tiersObserved).toBe(true);
  });

  it("schätzt den Tier-Anteil ohne beobachtete Daten weiter über die Rate", () => {
    const cal = { ...DEFAULT_CALIBRATION, tierPayoutPerPoint: 321, residualPerPoint: 0 };
    const stats = computeManagerStats({
      userId: "u1",
      name: "Test",
      dashboard: { tp: 1234, mdw: 0 },
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      calibration: cal,
    });
    expect(stats.achievementParts.tiers).toBe(cal.tierPayoutPerPoint * 1234);
    expect(stats.tiersObserved).toBe(false);
  });

  it("übernimmt IST-Cash für den eigenen User und liefert den Validierungsfehler", () => {
    const stats = computeManagerStats({
      userId: "me",
      name: "Ich",
      transfers: [tx(10, 1, 5_000_000)],
      dashboard: { tp: 1000, mdw: 1, pl: 1 },
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      realCashFromApi: 60_000_000,
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    expect(stats.cashMethod).toBe("ist");
    expect(stats.cashEstimate).toBe(60_000_000);
    expect(stats.cashEstimateError).toBeDefined();
    // Fehler = real − Strukturschätzung; Strukturschätzung muss die
    // Komponenten enthalten (Start − Kauf + Prämie + Sieg + Tagesbonus + ...)
    const structural = 60_000_000 - (stats.cashEstimateError ?? 0);
    expect(structural).toBeGreaterThan(40_000_000);
  });

  it("Sieg-Prämie: mdw × 1 Mio (offizieller Satz)", () => {
    const stats = computeManagerStats({
      userId: "u1",
      name: "Test",
      dashboard: { tp: 0, mdw: 13 },
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    expect(stats.estimatedWinBonus).toBe(13 * MATCHDAY_WIN_PREMIUM);
    expect(MATCHDAY_WIN_PREMIUM).toBe(1_000_000);
  });

  it("Tagesbonus hängt nicht mehr vom letzten Transfer ab", () => {
    const active = computeManagerStats({
      userId: "a",
      name: "Aktiv",
      transfers: [tx(280, 1, 1_000_000)],
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    const inactive = computeManagerStats({
      userId: "b",
      name: "Inaktiv",
      transfers: [tx(100, 1, 1_000_000)],
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    const daysSinceStart = Math.max(0, Math.floor((NOW - LEAGUE_START) / DAY));
    const expectedDailyBonus = estimateDailyBonus(daysSinceStart);
    expect(active.daysActive).toBe(daysSinceStart);
    expect(inactive.daysActive).toBe(daysSinceStart);
    expect(active.estimatedLoginBonus).toBe(expectedDailyBonus);
    expect(inactive.estimatedLoginBonus).toBe(expectedDailyBonus);
  });
});

describe("Referenz-Validierung Liga 089 (destilliertes Fixture)", () => {
  // Eigener Account, Snapshot 2026-07-06 – echte Aggregat-Werte:
  const REAL_CASH = 50_888_168;
  const TP = 39_641;
  const MDW = 13;
  const BOUGHT = 2_016_950_000; // gerundet auf 1k
  const SOLD = 1_887_917_000;
  const REAL_ACHIEVEMENTS_TOTAL = 42_850_000;
  const REAL_DAILY_BONUS = 28_440_000; // exakt aus Feed-Rekonstruktion

  it("Bilanz-Identität: alle exakten Komponenten lassen < 7M Rest", () => {
    const structural =
      50_000_000 +
      (SOLD - BOUGHT) +
      TP * 1_000 +
      MDW * MATCHDAY_WIN_PREMIUM +
      REAL_DAILY_BONUS +
      REAL_ACHIEVEMENTS_TOTAL;
    const residual = REAL_CASH - structural;
    expect(residual).toBeGreaterThan(0);
    expect(residual).toBeLessThan(7_000_000);
  });

  it("calibrateResidualPerPoint liefert eine plausible Rate (< 300 €/Pkt)", () => {
    const ownStats = computeManagerStats({
      userId: "me",
      name: "Chief",
      transfers: [tx(5, 1, BOUGHT), tx(285, 2, SOLD)],
      dashboard: { tp: TP, mdw: MDW, pl: 1 },
      leagueStartMs: LEAGUE_START,
      nowMs: NOW,
      seasonFinished: true,
      realCashFromApi: REAL_CASH,
      achievements: {
        items: [{ t: 2001, n: "Meister", ac: 1, er: 2_000_000, total: 2_000_000 }],
        total: REAL_ACHIEVEMENTS_TOTAL,
      },
      calibration: { ...DEFAULT_CALIBRATION, residualPerPoint: 0 },
    });
    const rate = calibrateResidualPerPoint(ownStats);
    expect(rate).toBeDefined();
    expect(Math.abs(rate!)).toBeLessThan(300);
  });

  it("calibrateFromOwnAccount reproduziert die eigenen Achievement-Raten", () => {
    const cal = calibrateFromOwnAccount({
      achievements: {
        items: [
          { t: 101, n: "Spieltagspunkte Silber", ac: 24, er: 250_000, total: 6_000_000 },
          { t: 102, n: "Spieltagspunkte Gold", ac: 5, er: 1_000_000, total: 5_000_000 },
          { t: 100, n: "Spieltagspunkte Bronze", ac: 1, er: 100_000, total: 100_000 },
          { t: 300, n: "Topscorer", ac: 26, er: 100_000, total: 2_600_000 },
          { t: 600, n: "Kreisliga", ac: 1, er: 1_000_000, total: 1_000_000 },
          { t: 701, n: "Bronzenes Händchen", ac: 20, er: 250_000, total: 5_000_000 },
        ],
        total: 19_700_000,
      },
      ownTp: TP,
      ownSoldVolume: SOLD,
    });
    expect(cal.tierPayoutPerPoint).toBeCloseTo(11_100_000 / TP, 5);
    expect(cal.playerAchPayoutPerPoint).toBeCloseTo(2_600_000 / TP, 5);
    expect(cal.handPayoutPerSoldEuro).toBeCloseTo(5_000_000 / SOLD, 9);
    expect(cal.flatBase).toBe(1_000_000);
  });
});
