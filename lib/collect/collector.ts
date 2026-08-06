import { estimateDailyBonus } from "../competitor";
import { INITIAL_BUDGET } from "../kickbase/bonus-catalog";
import type { KbRankingResponse, KbRankingUser } from "../kickbase/types";
import {
  loadLeagueCollect,
  recordCashAnchor,
  saveLeagueDays,
  saveLeagueMeta,
  type LeagueCollectDays,
  type LeagueCollectMeta,
} from "./league-store";

const DAY_MS = 86_400_000;
const START_BUDGET_MEASURE_WINDOW_MS = 3 * DAY_MS;
const BACKFILL_THROTTLE_MS = 3_600_000;

export interface CollectOwnComponents {
  transferNet: number;
  pointsPremium: number;
  winBonus: number;
  achievementsTotal: number;
  daysSinceStart: number;
}

export interface CollectOnVisitOpts {
  token: string;
  leagueId: string;
  userId: string;
  ranking: KbRankingResponse;
  leagueStartMs: number;
  meRealCash?: number;
  ownComponents?: CollectOwnComponents;
  /**
   * Bereits geladener Bestand des Aufrufers. Spart pro Besuch zwei KV-Reads,
   * weil `assembleCompetitionStats` denselben Stand ohnehin schon gezogen hat.
   */
  preloaded?: { meta: LeagueCollectMeta | null; days: LeagueCollectDays };
}

export function round500k(n: number): number {
  return Math.round(n / 500_000) * 500_000;
}

function rankingMembers(resp: unknown): KbRankingUser[] {
  const rec = resp as { us?: unknown; it?: unknown } | null;
  const raw = Array.isArray(rec?.us) ? rec.us : Array.isArray(rec?.it) ? rec.it : [];
  return raw.filter((u): u is KbRankingUser => {
    const candidate = u as KbRankingUser | null;
    return typeof candidate?.i === "string";
  });
}

function finiteNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Summe der Spieltagspunkte eines gespeicherten Tages (Vollständigkeits-Maß). */
export function daySum(entry: LeagueCollectDays[number] | undefined): number {
  if (!entry) return -1;
  return Object.values(entry.perManager).reduce((s, v) => s + finiteNumber(v.mdp), 0);
}

export function buildDayEntry(resp: unknown): LeagueCollectDays[number] | null {
  const perManager: LeagueCollectDays[number]["perManager"] = {};
  let pointsSum = 0;

  for (const u of rankingMembers(resp)) {
    const mdp = finiteNumber(u.mdp);
    const mdpl = finiteNumber(u.mdpl);
    perManager[u.i] = { mdp, mdpl };
    pointsSum += mdp;
  }

  if (pointsSum <= 0) return null;
  return { perManager, collectedAt: Date.now() };
}

export async function collectOnVisit(opts: CollectOnVisitOpts): Promise<void> {
  try {
    const { token, leagueId, userId, ranking, leagueStartMs, meRealCash, ownComponents } = opts;
    if (!Number.isFinite(leagueStartMs)) return;

    const members = rankingMembers(ranking);
    if (members.length === 0) return;

    const loaded = opts.preloaded ?? (await loadLeagueCollect(leagueId).catch(() => null));
    if (!loaded) return;

    const meta: LeagueCollectMeta = loaded.meta
      ? { ...loaded.meta, maxTv: { ...(loaded.meta.maxTv ?? {}) } }
      : { leagueStartMs, maxTv: {} };
    const days: LeagueCollectDays = { ...loaded.days };
    let metaChanged = !loaded.meta;
    let daysChanged = false;

    if (!Number.isFinite(meta.leagueStartMs)) {
      meta.leagueStartMs = leagueStartMs;
      metaChanged = true;
    }

    for (const m of members) {
      const tv = finiteNumber(m.tv);
      if (tv > 0 && tv > (meta.maxTv[m.i] ?? 0)) {
        meta.maxTv[m.i] = tv;
        metaChanged = true;
      }
    }

    if (!meta.startBudget) {
      const now = Date.now();
      const withinMeasureWindow = now - leagueStartMs <= START_BUDGET_MEASURE_WINDOW_MS;
      const canMeasure =
        withinMeasureWindow &&
        meRealCash !== undefined &&
        Number.isFinite(meRealCash) &&
        ownComponents;

      if (canMeasure) {
        const measured = round500k(
          meRealCash -
            ownComponents.transferNet -
            ownComponents.pointsPremium -
            ownComponents.winBonus -
            ownComponents.achievementsTotal -
            estimateDailyBonus(ownComponents.daysSinceStart)
        );
        // Kickbase erlaubt Custom-Startbudgets bis 500M – der Deckel schützt nur
        // gegen offensichtlich kaputte Messungen, nicht gegen legitime Ligen.
        meta.startBudget =
          measured > 0 && measured <= 500_000_000
            ? { value: measured, source: "measured", measuredAt: now }
            : { value: INITIAL_BUDGET, source: "default", measuredAt: now };
        metaChanged = true;
      } else if (!withinMeasureWindow) {
        // Liga ist zu alt für eine belastbare Messung -> Standardbudget festschreiben.
        meta.startBudget = { value: INITIAL_BUDGET, source: "default", measuredAt: now };
        metaChanged = true;
      }
      // Junge Liga, aber eigener Cash bzw. die Korrekturterme fehlen bei diesem Besuch
      // (z.B. /me/budget hat gepatzt): NICHTS schreiben. Sonst brennt ein einzelner
      // Fehlversuch das 3-Tage-Messfenster dauerhaft ab und die Liga bekommt für immer
      // das 50M-Standardbudget, obwohl sie messbar gewesen wäre.
    }

    const currentDay = Number((ranking as Record<string, unknown>).day ?? 0) || 0;
    const shouldBackfill =
      currentDay >= 1 &&
      (!meta.lastBackfillAt || Date.now() - meta.lastBackfillAt > BACKFILL_THROTTLE_MS);

    if (shouldBackfill) {
      const { kb } = await import("../kickbase/api");
      const missingDays = Array.from({ length: currentDay }, (_, i) => i + 1).filter(
        (day) => !Object.prototype.hasOwnProperty.call(days, day)
      );

      // Der aktuelle Spieltag kann beim ersten Einsammeln noch GELAUFEN sein.
      // `ranking.day` ist der laufende Spieltag, nicht der letzte beendete
      // (`lfmd` taugt dafür nicht: gemessen am 05.08.2026 liefert die API
      // day=34 bei lfmd=1). Deshalb fassen wir beim aktuellen Tag noch einmal
      // nach, solange die Punkte noch wachsen. Insgesamt hart auf 5 Calls je
      // Besuch gedeckelt (die Nachfassung zählt mit).
      const targets = Object.prototype.hasOwnProperty.call(days, currentDay)
        ? [...missingDays.slice(0, 4), currentDay]
        : missingDays.slice(0, 5);

      for (const day of targets) {
        const resp = await kb.ranking(token, leagueId, day).catch(() => null);
        const entry = resp ? buildDayEntry(resp) : null;
        if (!entry) continue;

        const stored = days[day];
        if (!stored) {
          days[day] = entry;
          daysChanged = true;
          continue;
        }
        // Vorhandenen Tag NUR durch eine vollständigere Antwort ersetzen.
        // Punkte wachsen während eines Spieltags, sie schrumpfen nicht - eine
        // niedrigere Summe ist also eine schlechtere Momentaufnahme und wird
        // verworfen. Das schützt weiterhin vor genullten Off-Season-Antworten
        // und heilt gleichzeitig einen zu früh eingefrorenen Zwischenstand.
        if (daySum(entry) > daySum(stored)) {
          days[day] = entry;
          daysChanged = true;
        }
      }

      meta.lastBackfillAt = Date.now();
      metaChanged = true;
    }

    if (meRealCash !== undefined && Number.isFinite(meRealCash)) {
      await recordCashAnchor(leagueId, userId, meRealCash);
    }

    if (metaChanged) await saveLeagueMeta(leagueId, meta);
    if (daysChanged) await saveLeagueDays(leagueId, days);
  } catch {
    // best-effort
  }
}
