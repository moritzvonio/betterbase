/**
 * Liga-Sammelarchiv für Spieltags-Rankings und Cash-Anker.
 *
 * Speichert nur abgeleitete Zahlen. Keine Kickbase-Tokens, keine E-Mail-
 * Adressen, keine Passwörter. In Prod via Vercel KV; lokal In-Memory über
 * globalThis, damit Route-Handler und RSC denselben Store sehen.
 */

import { kv } from "@vercel/kv";

export interface LeagueCollectMeta {
  leagueStartMs: number;
  startBudget?: { value: number; source: "measured" | "default"; measuredAt: number };
  maxTv: Record<string, number>;
  lastBackfillAt?: number;
}

/** Spieltag -> { Manager-ID -> { mdp, mdpl } } */
export type LeagueCollectDays = Record<
  number,
  { perManager: Record<string, { mdp: number; mdpl: number }>; collectedAt: number }
>;

/**
 * userId -> ISO-Datum (YYYY-MM-DD) -> echter Cash
 *
 * ACHTUNG, bevor hier jemals gelesen wird: Dieser Key ist LIGA-weit, enthält
 * aber den ECHTEN Kontostand jedes einzelnen Besuchers (aus /me/budget). Er ist
 * heute bewusst nur Schreibziel und hat keinen Lesepfad. Wer einen baut, darf
 * einem Nutzer NUR seinen eigenen Eintrag zeigen - sonst sieht jedes
 * Ligamitglied die echten Kontostände aller anderen, und genau die zu schätzen
 * ist der Sinn dieser App.
 */
export type LeagueCollectAnchors = Record<string, Record<string, number>>;

const KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// globalThis-Singleton: teilt den In-Memory-Store über Modul-Instanzen hinweg
// (Route-Handler ↔ RSC im Dev sonst getrennt).
const g = globalThis as unknown as {
  __bbCollect?: {
    meta: Map<string, LeagueCollectMeta>;
    days: Map<string, LeagueCollectDays>;
    anchors: Map<string, LeagueCollectAnchors>;
  };
};
const mem = g.__bbCollect ?? (g.__bbCollect = { meta: new Map(), days: new Map(), anchors: new Map() });

function metaKey(leagueId: string): string {
  return `collect:league:${leagueId}:meta`;
}

function daysKey(leagueId: string): string {
  return `collect:league:${leagueId}:days`;
}

function anchorsKey(leagueId: string): string {
  return `collect:league:${leagueId}:anchors`;
}

function cloneDays(days: LeagueCollectDays | null | undefined): LeagueCollectDays {
  return days ? { ...days } : {};
}

function capDays(days: LeagueCollectDays): LeagueCollectDays {
  const capped: LeagueCollectDays = {};
  for (const [key, value] of Object.entries(days)) {
    const day = Number(key);
    if (Number.isInteger(day) && day >= 1 && day <= 34) capped[day] = value;
  }
  return capped;
}

export async function loadLeagueCollect(
  leagueId: string
): Promise<{ meta: LeagueCollectMeta | null; days: LeagueCollectDays } | null> {
  try {
    if (KV) {
      const [meta, days] = await Promise.all([
        kv.get<LeagueCollectMeta>(metaKey(leagueId)).catch(() => null),
        kv.get<LeagueCollectDays>(daysKey(leagueId)).catch(() => null),
      ]);
      return { meta: meta ?? null, days: capDays(cloneDays(days)) };
    }
    return {
      meta: mem.meta.get(leagueId) ?? null,
      days: capDays(cloneDays(mem.days.get(leagueId))),
    };
  } catch {
    return { meta: null, days: {} };
  }
}

export async function saveLeagueMeta(leagueId: string, meta: LeagueCollectMeta): Promise<void> {
  try {
    if (KV) {
      await kv.set(metaKey(leagueId), meta);
    } else {
      mem.meta.set(leagueId, meta);
    }
  } catch {
    // best-effort
  }
}

export async function saveLeagueDays(leagueId: string, days: LeagueCollectDays): Promise<void> {
  try {
    const capped = capDays(days);
    if (KV) {
      await kv.set(daysKey(leagueId), capped);
    } else {
      mem.days.set(leagueId, capped);
    }
  } catch {
    // best-effort
  }
}

export async function recordCashAnchor(
  leagueId: string,
  userId: string,
  cash: number
): Promise<void> {
  try {
    if (!Number.isFinite(cash)) return;
    const today = new Date().toISOString().slice(0, 10);
    const anchors = KV
      ? ((await kv.get<LeagueCollectAnchors>(anchorsKey(leagueId)).catch(() => null)) ?? {})
      : { ...(mem.anchors.get(leagueId) ?? {}) };

    const existing = anchors[userId] ?? {};
    // Gleicher Tag, gleicher Betrag und nichts zu kappen -> kein Schreib-Command.
    // Der Anker wird pro Besuch gesetzt, ändert sich aber meist nur einmal am Tag.
    if (existing[today] === cash && Object.keys(existing).length <= 90) return;

    const perUser = { ...existing, [today]: cash };
    const recent = Object.entries(perUser)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-90);

    anchors[userId] = Object.fromEntries(recent);

    if (KV) {
      await kv.set(anchorsKey(leagueId), anchors);
    } else {
      mem.anchors.set(leagueId, anchors);
    }
  } catch {
    // best-effort
  }
}
