/**
 * Geteilte Daten-Assembly für die Wettbewerb-Analyse.
 *
 * Rechnet die Konkurrenten-Cash-Schätzung (Kontostände, Max-Gebote,
 * Netto-Teamwert) für ALLE Manager einer Liga zurück – identisch für die
 * Wettbewerb-Seite und die Share-Image-Route, damit beide dieselben Zahlen
 * zeigen. Details zum Modell: docs/kickbase-bonus-regeln.md.
 */

import { after } from "next/server";
import { kb } from "@/lib/kickbase/api";
import { withKbAuth } from "@/lib/auth";
import { collectOnVisit } from "@/lib/collect/collector";
import { loadLeagueCollect } from "@/lib/collect/league-store";
import {
  computeManagerStats,
  calibrateFromOwnAccount,
  calibrateResidualPerPoint,
  detectInitialBudget,
  DEFAULT_CALIBRATION,
  type ManagerComputedStats,
} from "@/lib/competitor";
import type { KbRankingUser } from "@/lib/kickbase/types";

export interface CompetitionData {
  members: KbRankingUser[];
  stats: ManagerComputedStats[];
  /** Für den Netto-Teamwert-Verlauf (Chart). */
  chartManagers: Array<{
    id: string;
    name: string;
    squad: Awaited<ReturnType<typeof kb.managerSquad>> | null;
    transfers: Awaited<ReturnType<typeof kb.managerTransferAll>>;
    currentCash: number;
  }>;
  leagueName: string | null;
  leagueStartMs: number;
  initialBudget: number;
  residualRate: number;
  matchdaysPlayed: number;
  seasonFinished: boolean;
  collect: { daysCovered: number; daysPlayed: number; startBudgetSource: "measured" | "default" } | null;
}

/**
 * Zieht Ranking/Overview/Achievements/Budget + je Manager Squad/Transfers/Dashboard,
 * kalibriert am eigenen Account und liefert die fertigen Stats. Gibt `null`, wenn
 * keine Liga-Mitglieder gefunden werden.
 */
export async function assembleCompetitionStats(
  token: string,
  leagueId: string,
  userId: string
): Promise<CompetitionData | null> {
  const path = `/league/${leagueId}/wettbewerb`;

  const [ranking, overview, ownAchievementsRaw, myRealBudget] = await Promise.all([
    withKbAuth(path, () => kb.ranking(token, leagueId)).catch(() => ({} as Awaited<ReturnType<typeof kb.ranking>>)),
    withKbAuth(path, () => kb.leagueOverviewWithManagers(token, leagueId)).catch(() => ({} as Awaited<ReturnType<typeof kb.leagueOverviewWithManagers>>)),
    // Bewusst `null` statt `{ total: 0 }`: "Abruf gepatzt" und "Liga hat noch
    // keine Erfolge" sind NICHT dasselbe. Die Startbudget-Messung darf nur mit
    // einem echt abgerufenen Wert rechnen, sonst brennt sie sich falsch ein.
    withKbAuth(path, () => kb.userAchievementsTotal(token, leagueId)).catch(() => null),
    withKbAuth(path, () => kb.myBudget(token, leagueId)).catch(() => null),
  ]);
  const ownAchievements = ownAchievementsRaw ?? { items: [], total: 0 };

  const members = ranking.us ?? ranking.it ?? [];
  if (members.length === 0) return null;

  const ovRecord = overview as Record<string, unknown>;
  const leagueStartMs = typeof ovRecord.dt === "string" ? Date.parse(ovRecord.dt) : NaN;
  const collect = await loadLeagueCollect(leagueId).catch(() => null);
  const collectedStartBudget = collect?.meta?.startBudget?.value;
  const initialBudget =
    collectedStartBudget !== undefined &&
    Number.isFinite(collectedStartBudget) &&
    collectedStartBudget > 0
      ? collectedStartBudget
      : detectInitialBudget();
  const leagueName = typeof ovRecord.lnm === "string" ? (ovRecord.lnm as string) : null;
  const rankingRec = ranking as Record<string, unknown>;
  const daysPlayed = Number(rankingRec.day ?? 0) || 0;
  const matchdaysPlayed = Number(rankingRec.nd ?? 34) || 34;
  const seasonFinished = daysPlayed >= matchdaysPlayed;
  const leagueTotalPoints = members.reduce((s, u) => s + (u.sp ?? 0), 0);

  const memberData = await Promise.all(
    members.map(async (m) => {
      const [squad, transfers, dashboard] = await Promise.all([
        withKbAuth(path, () => kb.managerSquad(token, leagueId, m.i)).catch(() => null),
        withKbAuth(path, () => kb.managerTransferAll(token, leagueId, m.i)).catch(() => []),
        withKbAuth(path, () => kb.managerDashboard(token, leagueId, m.i)).catch(() => null),
      ]);
      return { manager: m, squad: squad ?? null, transfers, dashboard };
    })
  );

  const meRealCash = myRealBudget?.b !== undefined ? myRealBudget.b : undefined;
  const meData = memberData.find((d) => d.manager.i === userId);

  const ownTp = Number(
    (meData?.dashboard as { tp?: number } | null)?.tp ?? meData?.manager.sp ?? 0
  );
  const ownSoldVolume = (meData?.transfers ?? [])
    .filter((t) => t.tty === 2 && Date.parse(t.dt) > leagueStartMs)
    .reduce((s, t) => s + (t.trp ?? 0), 0);
  const calRaw =
    ownAchievements.total > 0 && ownTp > 0
      ? calibrateFromOwnAccount({ achievements: ownAchievements, ownTp, ownSoldVolume })
      : DEFAULT_CALIBRATION;

  const observedPointsByManager = new Map<string, number[]>();
  if (daysPlayed > 0 && collect && Object.keys(collect.days).length >= daysPlayed) {
    for (const member of members) {
      const points: number[] = [];
      let complete = true;
      for (let day = 1; day <= daysPlayed; day++) {
        const rec = collect.days[day]?.perManager[member.i];
        if (!rec) {
          complete = false;
          break;
        }
        points.push(rec.mdp);
      }
      if (complete) observedPointsByManager.set(member.i, points);
    }
  }

  const buildInput = (d: (typeof memberData)[number], cal: typeof DEFAULT_CALIBRATION) => {
    const isMe = d.manager.i === userId;
    return {
      userId: d.manager.i,
      name: d.manager.n,
      image: d.manager.uim,
      initialBudget,
      transfers: d.transfers,
      squad: d.squad,
      rankingEntry: d.manager,
      dashboard: d.dashboard as { tp?: number; mdw?: number; pl?: number } | null,
      leagueStartMs,
      seasonFinished,
      matchdaysPlayed,
      leagueTotalPoints,
      observedMatchdayPoints: observedPointsByManager.get(d.manager.i),
      calibration: cal,
      achievements: isMe && ownAchievements.total > 0 ? ownAchievements : undefined,
      realCashFromApi: isMe ? meRealCash : undefined,
    };
  };

  let residualRate = DEFAULT_CALIBRATION.residualPerPoint;
  if (meData && meRealCash !== undefined) {
    const pass1 = computeManagerStats(buildInput(meData, { ...calRaw, residualPerPoint: 0 }));
    residualRate = calibrateResidualPerPoint(pass1) ?? DEFAULT_CALIBRATION.residualPerPoint;
  }
  const calibration = { ...calRaw, residualPerPoint: residualRate };

  const stats: ManagerComputedStats[] = memberData.map((d) =>
    computeManagerStats(buildInput(d, calibration))
  );

  const chartManagers = memberData.map((d) => {
    const st = stats.find((s) => s.userId === d.manager.i);
    return {
      id: d.manager.i,
      name: d.manager.n,
      squad: d.squad,
      transfers: d.transfers,
      currentCash: st ? st.cashEstimate : initialBudget,
    };
  });

  const ownStats = stats.find((s) => s.userId === userId);
  const daysSinceStart = Number.isFinite(leagueStartMs)
    ? Math.max(0, Math.floor((Date.now() - leagueStartMs) / 86_400_000))
    : 0;
  const collectArgs = {
    token,
    leagueId,
    userId,
    ranking,
    leagueStartMs,
    meRealCash,
    preloaded: collect ?? undefined,
    // Nur messen, wenn die Erfolge WIRKLICH abgerufen wurden. `ownStats`
    // liefert sonst die Schätzung (inklusive der 2,2 Mio Pauschale aus der
    // Referenzliga), und die würde sich als "gemessenes" Startbudget
    // dauerhaft einbrennen. Fehlt der Wert, schreibt der Collector bei junger
    // Liga bewusst nichts und ein späterer Besuch misst nach.
    ownComponents:
      ownStats && ownAchievementsRaw
        ? {
            transferNet: ownStats.transferBalance,
            pointsPremium: ownStats.estimatedPointsBonus,
            winBonus: ownStats.estimatedWinBonus,
            achievementsTotal: ownAchievementsRaw.total,
            daysSinceStart,
          }
        : undefined,
  };

  // Sammeln blockiert den Seitenaufruf nicht: Next führt das nach dem Response aus.
  // Gemessen 05.08.2026 gegen Liga 089: 469 ms kalt (5 Backfill-Versuche), 0 ms warm
  // (1h-Throttle). In der Saison mit echten Spieltagsdaten eher mehr, deshalb `after`.
  try {
    after(() => {
      void collectOnVisit(collectArgs).catch(() => undefined);
    });
  } catch {
    // Kein Request-Scope (z.B. Diagnose-Skript): dann eben inline, aber best-effort.
    await collectOnVisit(collectArgs).catch(() => undefined);
  }

  return {
    members,
    stats,
    chartManagers,
    leagueName,
    leagueStartMs,
    initialBudget,
    residualRate,
    matchdaysPlayed,
    seasonFinished,
    collect: collect
      ? {
          daysCovered: Object.keys(collect.days).length,
          daysPlayed,
          startBudgetSource: collect.meta?.startBudget?.source ?? "default",
        }
      : null,
  };
}
