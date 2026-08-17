import type { Metadata } from "next";
import Link from "next/link";
import { kb } from "@/lib/kickbase/api";
import { requireSessionOrRedirect, withKbAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamTag } from "@/components/ui/team-tag";
import { PositionBadge } from "@/components/ui/position-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { PointBar, BatteryBar, HotBadge } from "@/components/ui/point-bar";
import { MvMiniSpark } from "./MvMiniSpark";
import {
  predictMv,
  computeGlobalDowPct,
  dowPatternSampleCounts,
  type MvPoint,
} from "@/lib/mv-predict";
import { getRecentNewsForPlayers } from "@/lib/news/store";
import { RankBadge, RankNumber } from "@/components/ui/rank-badge";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { formatEUR, cn } from "@/lib/utils";
import { marketEntryPid, type KbCompetitionPlayer } from "@/lib/kickbase/types";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Clock,
  ShoppingCart,
  Goal,
  Footprints,
  Trophy,
  TrendingUp,
  Wallet,
  Layers,
  Newspaper,
} from "lucide-react";

export const metadata: Metadata = { title: "Transfermarkt" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SortKey =
  | "points"
  | "avg"
  | "mv"
  | "mvt"
  | "expiry"
  | "pos"
  | "goals";

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { id: leagueId } = await params;
  const sp = await searchParams;
  const sortKey: SortKey = (
    ["points", "avg", "mv", "mvt", "expiry", "pos", "goals"] as const
  ).includes((sp.sort ?? "") as SortKey)
    ? ((sp.sort ?? "points") as SortKey)
    : "points";
  const path = `/league/${leagueId}/markt`;
  const session = await requireSessionOrRedirect(path);

  // 1. Get market listings
  const marketData = await withKbAuth(path, () =>
    kb.market(session.token, leagueId)
  ).catch(() => ({ it: [] as Awaited<ReturnType<typeof kb.market>>["it"] }));
  const items = marketData.it ?? [];

  // 2. Per market entry: fetch the league-specific player detail in parallel.
  //    The detail endpoint returns RICH data (tp = total season points, ap = avg,
  //    g = goals, a = assists) – guaranteed to have the right fields per player.
  const detailFetches = await Promise.all(
    items.map(async (e) => {
      const pid = marketEntryPid(e);
      if (!pid) return null;
      try {
        const d = await kb.player(session.token, leagueId, pid);
        return { pid, detail: d };
      } catch {
        return { pid, detail: null };
      }
    })
  );
  const detailMap = new Map<string, Awaited<ReturnType<typeof kb.player>>>();
  for (const item of detailFetches) {
    if (item?.detail) detailMap.set(item.pid, item.detail);
  }

  // 2b. MV-History (letzte 14 Tage) für jeden Markt-Spieler – parallel
  // Endpoint akzeptiert nur den Default 92. Wir holen die volle Historie
  // – für die Prognose brauchen wir möglichst viele Wochentag-Samples,
  // für die visuelle Sparkline reichen die letzten 14 Tage.
  const mvHistFetches = await Promise.all(
    items.map(async (e) => {
      const pid = marketEntryPid(e);
      if (!pid) return null;
      try {
        const h = await kb.marketValue(session.token, leagueId, pid, 92);
        const all = (h.it ?? []).slice().sort((a, b) => a.dt - b.dt);
        return { pid, full: all, last14: all.slice(-14) };
      } catch {
        return { pid, full: [] as MvPoint[], last14: [] as MvPoint[] };
      }
    })
  );
  const mvFullMap = new Map<string, MvPoint[]>();
  const mvHistMap = new Map<string, MvPoint[]>();
  for (const item of mvHistFetches) {
    if (item) {
      mvFullMap.set(item.pid, item.full);
      mvHistMap.set(item.pid, item.last14);
    }
  }

  // News-Indikator: für alle Markt-Spieler die letzten News (24h) holen.
  // Differenzierung gegen Kickly: User sieht sofort wenn ein angebotener Spieler
  // aktuelle News (Verletzung, Aufstellungs-Zweifel) hat – Kaufrisiko-Signal.
  const allMarketPids = items.map((it) => marketEntryPid(it)).filter(Boolean);
  const recentNews = await getRecentNewsForPlayers(allMarketPids, {
    limit: 200,
  }).catch(() => []);
  const newsByPlayer = new Map<string, number>();
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  for (const news of recentNews) {
    if (news.publishedAt.getTime() < sinceMs) continue;
    for (const pid of news.playerIds) {
      newsByPlayer.set(pid, (newsByPlayer.get(pid) ?? 0) + 1);
    }
  }

  // Saisonweiten Wochentag-Pattern aus ALLEN Markt-Histories berechnen.
  // Mit ~23 Spielern × 92 Tage = ~2000 Δ-Werte → ~280 Samples pro Wochentag.
  // So wird der DoW-Effekt ein robuster Liga-Trend, nicht eine 14-Tage-Schätzung.
  const allHistories = Array.from(mvFullMap.values()).filter(
    (h) => h.length >= 7
  );
  const globalDowPct = computeGlobalDowPct(allHistories);
  const dowSamples = dowPatternSampleCounts(allHistories);
  // Diagnose nur wenn DEBUG_PREDICT=1 gesetzt
  if (process.env.DEBUG_PREDICT === "1") {
    const dowMean = globalDowPct.reduce((s, v) => s + v, 0) / 7;
    const relPct = globalDowPct.map((p) => p - dowMean);
    console.log(
      "[MARKT-PRED] DoW relativ (So..Sa):",
      relPct.map((p) => (p * 100).toFixed(2) + "%").join(" / "),
      "| samples:",
      dowSamples.join("/")
    );
  }

  // 3. Try to also build a Bundesliga-weite player pool for rank computation.
  //    competitionPlayers is best-effort – if it fails, we skip ranks.
  const compChunks = await Promise.all(
    [1, 2, 3, 4].map((pos) =>
      withKbAuth(path, () =>
        kb.competitionPlayers(session.token, "1", { position: pos })
      ).catch(() => ({ it: [] as KbCompetitionPlayer[] }))
    )
  );
  const allComp: KbCompetitionPlayer[] = compChunks.flatMap((c) => c.it ?? []);

  // Build ranking maps:
  //   rankByPid       → 1-N across all Bundesliga players (overall)
  //   rankByPidPos    → 1-N within position
  //   maxByPos        → max points per position (for PointBar normalization)
  const allSorted = allComp.slice().sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
  const rankByPid = new Map<string, number>();
  allSorted.forEach((cp, i) => rankByPid.set(cp.pi, i + 1));

  const rankByPidPos = new Map<string, number>();
  const sortedByPos: Record<number, KbCompetitionPlayer[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const cp of allComp) sortedByPos[cp.pos]?.push(cp);
  for (const list of Object.values(sortedByPos)) {
    list.sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
    list.forEach((cp, i) => rankByPidPos.set(cp.pi, i + 1));
  }

  const maxByPos: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1 };
  for (const cp of allComp) {
    if (typeof cp.p === "number" && cp.p > (maxByPos[cp.pos] ?? 0)) maxByPos[cp.pos] = cp.p;
  }

  // Battery-Skala für Spielerpunkte-Ø: absolute Skala statt per-Position-Max.
  // Begründung: Der User möchte konsistente Farbe-Aussage über alle Positionen.
  // 50 Pkt Ø ist solide-rot (Ersatz/sehr schwach), 130 Pkt Ø ist Top-Performer.
  const AVG_BAR_MIN = 50;
  const AVG_BAR_MAX = 130;

  const compMap = new Map<string, KbCompetitionPlayer>();
  for (const p of allComp) compMap.set(p.pi, p);

  /**
   * Resolve player stats with fallback chain:
   *   1. Player detail (most reliable: tp, ap, g, a)
   *   2. competitionPlayer entry (p, ap, g, a)
   *   3. Empty zeros
   */
  function statsFor(pid: string) {
    const d = detailMap.get(pid);
    const c = compMap.get(pid);
    return {
      points: (d?.tp ?? c?.p ?? 0) as number,
      avg: (d?.ap ?? c?.ap ?? 0) as number,
      goals: (d?.g ?? c?.g ?? 0) as number,
      assists: (d?.a ?? c?.a ?? 0) as number,
    };
  }

  const sorters: Record<SortKey, (a: typeof items[number], b: typeof items[number]) => number> = {
    points: (a, b) =>
      statsFor(marketEntryPid(b)).points - statsFor(marketEntryPid(a)).points,
    avg: (a, b) => statsFor(marketEntryPid(b)).avg - statsFor(marketEntryPid(a)).avg,
    mv: (a, b) => (b.mv ?? 0) - (a.mv ?? 0),
    mvt: (a, b) => (b.mvt ?? 0) - (a.mvt ?? 0),
    // Aufsteigend nach Sekunden bis Ablauf – bald ablaufend zuerst.
    // Ohne exs (z.B. eigene Angebote) ans Ende sortieren.
    expiry: (a, b) => {
      const ax = a.exs ?? Number.POSITIVE_INFINITY;
      const bx = b.exs ?? Number.POSITIVE_INFINITY;
      return ax - bx;
    },
    pos: (a, b) => a.pos - b.pos,
    goals: (a, b) =>
      statsFor(marketEntryPid(b)).goals - statsFor(marketEntryPid(a)).goals,
  };
  const sorted = items.slice().sort(sorters[sortKey]);

  const SORT_TABS: Array<{
    key: SortKey;
    label: string;
    icon: typeof Trophy;
  }> = [
    { key: "points", label: "Saison-Punkte", icon: Trophy },
    { key: "avg", label: "Ø Spieltag", icon: TrendingUp },
    { key: "expiry", label: "Bald ablaufend", icon: Clock },
    { key: "mv", label: "Marktwert", icon: Wallet },
    { key: "mvt", label: "MV-Trend", icon: ArrowUp },
    { key: "goals", label: "Tore", icon: Goal },
    { key: "pos", label: "Position", icon: Layers },
  ];
  const activeSort = SORT_TABS.find((t) => t.key === sortKey);

  return (
    <div className="space-y-6">
      <div className="slide-up">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <ShoppingCart className="size-5" />
          </span>
          Transfermarkt
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {items.length === 0
            ? "Aktuell keine Angebote"
            : `${items.length} ${items.length === 1 ? "Angebot" : "Angebote"} · sortiert nach ${activeSort?.label ?? "Saison-Punkten"}`}
        </p>
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap slide-up slide-up-1">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1">
            Sortieren
          </span>
          {SORT_TABS.map((t) => {
            const active = sortKey === t.key;
            const Icon = t.icon;
            return (
              <Link
                key={t.key}
                href={`?sort=${t.key}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="size-3" />
                {t.label}
              </Link>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <Card className="slide-up slide-up-1">
          <EmptyState
            icon={<ShoppingCart className="size-6" />}
            title="Markt ist leer"
            description="Aktuell sind keine Spieler im Transfermarkt. Schau später nochmal vorbei."
          />
        </Card>
      ) : (
        <div className="grid gap-2.5 slide-up slide-up-1">
          {sorted.map((p) => {
            const pid = marketEntryPid(p);
            // Echter Tages-Δ in € aus Spieler-Detail (tfhmvt) oder als
            // Fallback aus den letzten beiden MV-History-Punkten. `mvt` aus
            // Markt-Entry ist nur ein -1..+2 Indikator und KEIN €-Wert.
            const detail = detailMap.get(pid);
            const mvHistTmp = mvHistMap.get(pid) ?? [];
            const dayChange =
              detail?.tfhmvt ??
              (mvHistTmp.length >= 2
                ? mvHistTmp[mvHistTmp.length - 1].mv -
                  mvHistTmp[mvHistTmp.length - 2].mv
                : 0);
            const TrendIcon =
              dayChange > 0 ? ArrowUp : dayChange < 0 ? ArrowDown : Minus;
            const trendColor =
              dayChange > 0
                ? "text-emerald-600"
                : dayChange < 0
                ? "text-rose-600"
                : "text-muted-foreground";
            const priceDiff = p.prc - p.mv;
            const priceDiffPct = p.mv > 0 ? (priceDiff / p.mv) * 100 : 0;
            const priceEqualsMv = priceDiff === 0;

            const s = statsFor(pid);
            const points = s.points;
            const avg = s.avg;
            const goals = s.goals;
            const assists = s.assists;
            const max = maxByPos[p.pos] ?? 1;
            const pct = points > 0 ? points / max : 0;
            const overallRank = rankByPid.get(pid);
            const posRank = rankByPidPos.get(pid);

            // Sparkline: letzte 14 Tage
            const mvHist = mvHistMap.get(pid) ?? [];
            // Prognose: ganze 92-Tage-Historie + saisonweiter DoW-Pattern
            const mvFull = mvFullMap.get(pid) ?? [];
            const prediction = predictMv(mvFull, { globalDowPct });

            return (
              <Link
                key={pid}
                href={`/league/${leagueId}/spieler/${pid}`}
                className="card-hover block rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-stretch gap-4">
                  <div className="shrink-0 self-stretch flex items-center">
                    <PlayerAvatar
                      pim={p.pim}
                      tid={p.tid}
                      size={112}
                      rounded="lg"
                      className="ring-0"
                    />
                  </div>

                  {/* Center column: name + tags + stats grid */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{p.n}</span>
                      <RankBadge rank={overallRank} total={allComp.length} />
                      <HotBadge pct={pct} />
                      {(() => {
                        const newsCount = newsByPlayer.get(pid) ?? 0;
                        if (newsCount === 0) return null;
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            title={`${newsCount} aktuelle News (24h) zu diesem Spieler`}
                          >
                            <Newspaper className="size-3" />
                            {newsCount} News
                          </span>
                        );
                      })()}
                      {p.exs !== undefined && p.exs > 0 && (
                        <Badge variant="muted" className="text-[10px] gap-1">
                          <Clock className="size-3" />
                          {formatExpiry(p.exs)}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <TeamTag tid={p.tid} size="xs" />
                      <PositionBadge pos={p.pos} className="text-[9px] h-4 px-1" />
                      {posRank && (
                        <RankNumber
                          rank={posRank}
                          total={sortedByPos[p.pos]?.length}
                        />
                      )}
                      {p.u?.n && <span className="truncate">von {p.u.n}</span>}
                    </div>

                    {/* Battery + numbers row */}
                    <div className="flex items-center gap-3 pt-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <BatteryBar
                          value={avg}
                          min={AVG_BAR_MIN}
                          max={AVG_BAR_MAX}
                          width={120}
                          height={18}
                        />
                        <div className="flex flex-col leading-tight">
                          <span className="text-base font-bold tabular leading-none">
                            {avg > 0 ? avg : "–"}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium leading-none mt-0.5">
                            Ø Spieltag
                          </span>
                        </div>
                      </div>
                      <div className="h-6 w-px bg-border/60 hidden sm:block" />
                      <div className="flex flex-col leading-tight hidden sm:flex">
                        <span className="text-sm font-mono font-semibold tabular leading-none text-muted-foreground">
                          {points.toLocaleString("de-DE")}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium leading-none mt-0.5">
                          Saison
                        </span>
                      </div>
                    </div>

                    {/* Mobile-only Saison-Total + Goals/Assists */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap sm:hidden">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted tabular font-mono">
                        {points.toLocaleString("de-DE")} P Saison
                      </span>
                    </div>

                    {/* Goals + assists pill */}
                    {(goals > 0 || assists > 0) && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {goals > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted tabular">
                            <Goal className="size-3" />
                            {goals} {goals === 1 ? "Tor" : "Tore"}
                          </span>
                        )}
                        {assists > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted tabular">
                            <Footprints className="size-3" />
                            {assists} {assists === 1 ? "Vorlage" : "Vorlagen"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* MV-Graph + Prediction (eigene Spalte zwischen Stats und Preis) */}
                  {mvHist.length >= 2 && (
                    <div className="hidden md:flex items-center gap-3 shrink-0 self-center min-w-0">
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
                          MV · 14 Tage
                        </span>
                        <div className="w-[180px] lg:w-[200px]">
                          <MvMiniSpark points={mvHist} height={72} />
                        </div>
                      </div>
                      {prediction && <PredictionBlock prediction={prediction} />}
                    </div>
                  )}

                  {/* Right column: Preis + Tages-Steigerung */}
                  <div className="text-right shrink-0 self-center">
                    <div className="font-mono font-bold text-lg tabular leading-tight">
                      {formatEUR(p.prc, { compact: true })}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium leading-none mt-0.5">
                      {priceEqualsMv ? "Preis = MV" : "Preis"}
                    </div>

                    {/* Marktwert nur zeigen wenn ≠ Preis (vermeidet Redundanz) */}
                    {!priceEqualsMv && (
                      <div className="mt-2 text-xs font-mono tabular text-muted-foreground">
                        MV {formatEUR(p.mv, { compact: true })}
                        <div
                          className={cn(
                            "text-[10px] font-mono mt-0.5 font-semibold tabular",
                            priceDiff > 0
                              ? "text-amber-600"
                              : "text-emerald-600"
                          )}
                        >
                          {priceDiff > 0 ? "+" : ""}
                          {priceDiffPct.toFixed(0)}% vs MV
                        </div>
                      </div>
                    )}

                    {/* 24h-Δ als echter €-Wert (aus tfhmvt) */}
                    {dayChange !== 0 && Math.abs(dayChange) >= 1 && (
                      <div
                        className={cn(
                          "font-mono tabular text-xs flex items-center justify-end gap-0.5 font-semibold mt-2",
                          trendColor
                        )}
                        title="Marktwert-Veränderung in den letzten 24 h"
                      >
                        <TrendIcon className="size-3" />
                        {dayChange > 0 ? "+" : ""}
                        {formatEUR(dayChange, { compact: true })}
                        <span className="text-muted-foreground/70 font-normal ml-1">
                          24 h
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-4 leading-relaxed">
        💡 Batterie zeigt den Ø-Saisonpunkt-Stand relativ zum besten Spieler der Position.
        <br />
        💎 <span className="font-semibold">TOP 5</span> Diamant ·{" "}
        🥇 <span className="font-semibold">TOP 25</span> Gold ·{" "}
        🥈 <span className="font-semibold">TOP 50</span> Silber ·{" "}
        🥉 <span className="font-semibold">TOP 100</span> Bronze
      </p>
    </div>
  );
}

function formatExpiry(seconds: number): string {
  if (seconds <= 0) return "abgelaufen";
  const hours = Math.floor(seconds / 3600);
  if (hours < 1) return `${Math.floor(seconds / 60)}m`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Kompakter Prognose-Block neben der MV-Sparkline. Zeigt zwei klare Werte:
 *  - Δ MV bis zum nächsten Spieltag (Veränderung)
 *  - Erwarteter MV-Stand bei Spieltag-Anpfiff (Zielwert)
 * Konfidenz nur als kleiner Punkt im Tooltip.
 */
function PredictionBlock({
  prediction,
}: {
  prediction: import("@/lib/mv-predict").MvPrediction;
}) {
  const { deltaUntilMatchday, daysUntilMatchday, mvAtMatchday, confidence } =
    prediction;
  const up = deltaUntilMatchday > 0;
  const flat = Math.abs(deltaUntilMatchday) < 5_000;
  const color = flat
    ? "text-muted-foreground"
    : up
    ? "text-emerald-700"
    : "text-rose-700";
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const conf =
    confidence >= 0.7 ? "hoch" : confidence >= 0.4 ? "mittel" : "niedrig";
  const dayLabel =
    daysUntilMatchday === 0
      ? "heute"
      : daysUntilMatchday === 1
      ? "morgen"
      : `in ${daysUntilMatchday} Tagen`;

  return (
    <div
      className="shrink-0 flex flex-col items-end leading-tight tabular"
      title={`Prognose ${dayLabel} · Konfidenz ${conf}`}
    >
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
        Bis Spieltag · {dayLabel}
      </span>
      <span
        className={cn(
          "font-mono font-bold text-base flex items-center gap-1 leading-tight",
          color
        )}
      >
        <Icon className="size-3.5" />
        {up ? "+" : ""}
        {formatEUR(deltaUntilMatchday, { compact: true })}
      </span>
      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
        → MV {formatEUR(mvAtMatchday, { compact: true })}
      </span>
    </div>
  );
}
