import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { kb } from "@/lib/kickbase/api";
import { requireSessionOrRedirect, withKbAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { TeamCrest } from "@/components/ui/team-tag";
import { PositionBadge } from "@/components/ui/position-icon";
import { FormDots } from "@/components/ui/form-dots";
import { formatEUR, formatDelta } from "@/lib/utils";
import {
  POSITION_LABELS,
  playerImageUrl,
  teamMeta,
  dtDayToDate,
  type KbMarketValuePoint,
} from "@/lib/kickbase/types";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Minus,
  TrendingUp,
  Target,
  ShoppingCart,
  Wallet,
  Activity,
  Calendar,
} from "lucide-react";
import { MarketValueChart } from "./MarketValueChart";
import { WatchButton } from "./WatchButton";
import { isWatched } from "@/lib/watchlist";
import { getRecentNewsForPlayer } from "@/lib/news/store";
import { getPlayerIndex } from "@/lib/news/player-index";
import { NewsCard } from "@/components/news/news-card";
import { Newspaper } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}): Promise<Metadata> {
  const { id, pid } = await params;
  try {
    const session = await requireSessionOrRedirect(`/league/${id}/spieler/${pid}`);
    const p = await kb.player(session.token, id, pid);
    return { title: `${p.fn ? p.fn + " " : ""}${p.n}` };
  } catch {
    return { title: "Spieler" };
  }
}

interface ChartPoint {
  ts: number;
  date: string;
  mv: number;
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id: leagueId, pid: playerId } = await params;
  const path = `/league/${leagueId}/spieler/${playerId}`;
  const session = await requireSessionOrRedirect(path);

  const [player, mv92, perf, watched] = await Promise.all([
    withKbAuth(path, () => kb.player(session.token, leagueId, playerId)).catch(() => null),
    withKbAuth(path, () => kb.marketValue(session.token, leagueId, playerId, 92)).catch(() => null),
    withKbAuth(path, () => kb.performance(session.token, leagueId, playerId)).catch(() => null),
    isWatched(session.userId, playerId),
  ]);

  if (!player) notFound();

  const team = teamMeta(player.tid);
  const img = playerImageUrl(player.pim);

  const points: ChartPoint[] = (mv92?.it ?? []).map((p: KbMarketValuePoint) => ({
    ts: p.dt,
    date: dtDayToDate(p.dt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
    mv: p.mv,
  }));

  const trend24 = (player as { tfhmvt?: number }).tfhmvt ?? 0;
  const TrendIcon = trend24 > 0 ? ArrowUp : trend24 < 0 ? ArrowDown : Minus;
  const trendColor =
    trend24 > 0 ? "text-emerald-600" : trend24 < 0 ? "text-rose-600" : "text-muted-foreground";

  const firstMv = points[0]?.mv;
  const lastMv = points[points.length - 1]?.mv ?? player.mv;
  const change92 = firstMv && lastMv ? lastMv - firstMv : 0;
  const change92Pct = firstMv ? (change92 / firstMv) * 100 : 0;

  // Performance shape: { it: [{ ti: "season", ph: [matchday entries] }, ...] }
  // Pick the LAST entry (= current season) and flatten its matchdays.
  const seasons = perf?.it ?? [];
  const currentSeason = seasons[seasons.length - 1];
  const matchdays = currentSeason?.ph ?? [];
  const perfPoints = matchdays
    .map((m) => m.p)
    .filter((p): p is number => typeof p === "number");

  return (
    <div className="space-y-6">
      <Link
        href={`/league/${leagueId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Dashboard
      </Link>

      {/* Player hero card with team gradient */}
      <Card
        className="overflow-hidden relative"
        style={{
          background: `linear-gradient(135deg, ${team.color}10 0%, transparent 60%)`,
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: `linear-gradient(to right, ${team.color}, ${team.color}88)` }}
        />
        <CardContent className="p-5 sm:p-7 slide-up">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div
              className="size-24 sm:size-28 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-2xl font-bold ring-1 ring-border shadow-sm"
              style={{ background: `linear-gradient(135deg, ${team.color}33, ${team.color}11)` }}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={player.n} className="w-full h-full object-cover" />
              ) : (
                <span style={{ color: team.color }}>{team.short}</span>
              )}
            </div>

            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
                <TeamCrest tid={player.tid} size={20} />
                <span className="font-semibold text-foreground">{team.name}</span>
                <PositionBadge pos={player.pos} />
                {player.st !== undefined && player.st !== 0 && (
                  <Badge variant="danger">Status {player.st}</Badge>
                )}
                {(player as { iotm?: boolean }).iotm && (
                  <Badge variant="default" className="gap-1">
                    <ShoppingCart className="size-3" /> Auf Markt
                  </Badge>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                {player.fn ? `${player.fn} ` : ""}
                <span className="text-primary">{player.n}</span>
              </h1>
              {perfPoints.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                    Form letzte 5
                  </div>
                  <FormDots points={perfPoints} />
                </div>
              )}
            </div>

            <div className="shrink-0">
              <WatchButton playerId={playerId} initialWatched={watched} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 slide-up slide-up-1">
        <StatCard
          icon={<Wallet className="size-4" />}
          label="Marktwert"
          value={formatEUR(player.mv, { compact: true })}
          sub={
            <span className={trendColor + " font-mono inline-flex items-center gap-0.5 tabular"}>
              <TrendIcon className="size-3" />
              {formatDelta(trend24)} 24h
            </span>
          }
          accent="primary"
        />
        <StatCard
          icon={<TrendingUp className="size-4" />}
          label="92-Tage-Trend"
          value={`${change92Pct > 0 ? "+" : ""}${change92Pct.toFixed(1)}%`}
          sub={formatDelta(change92)}
          accent={change92 > 0 ? "success" : change92 < 0 ? "danger" : "info"}
          trend={change92 > 0 ? "up" : change92 < 0 ? "down" : "flat"}
        />
        <StatCard
          icon={<Target className="size-4" />}
          label="Punkte gesamt"
          value={player.tp !== undefined ? player.tp.toLocaleString("de-DE") : "–"}
          sub={
            player.g !== undefined || player.a !== undefined
              ? `${player.g ?? 0} Tore · ${player.a ?? 0} Vorlagen`
              : undefined
          }
          accent="success"
        />
        <StatCard
          icon={<Activity className="size-4" />}
          label="Ø pro Spieltag"
          value={player.ap !== undefined ? String(player.ap) : "–"}
          accent="info"
        />
      </div>

      {/* Market value chart */}
      <Card className="slide-up slide-up-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <TrendingUp className="size-4" />
            </span>
            Marktwert · 92 Tage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {points.length < 2 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Nicht genug Daten für einen Chart.
            </p>
          ) : (
            <>
              <MarketValueChart data={points} color="#10b981" />
              <div className="grid grid-cols-3 gap-3 mt-5 text-xs">
                <Mini label="Tief 92T" value={mv92?.lmv ? formatEUR(mv92.lmv, { compact: true }) : "–"} />
                <Mini label="Hoch 92T" value={mv92?.hmv ? formatEUR(mv92.hmv, { compact: true }) : "–"} />
                <Mini
                  label="Heute"
                  value={trend24 ? formatDelta(trend24) : "0 €"}
                  className={trendColor}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Performance per matchday */}
      <Card className="slide-up slide-up-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2">
              <span className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Target className="size-4" />
              </span>
              Spieltage
            </span>
            {currentSeason?.ti && (
              <span className="text-xs text-muted-foreground font-normal">
                Saison {currentSeason.ti}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {matchdays.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Keine Spieltag-Daten für diese Saison.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="text-left pl-1">
                      <Calendar className="size-3 inline mr-1" />
                      Spieltag
                    </th>
                    <th className="text-left">Begegnung</th>
                    <th className="text-center hidden sm:table-cell">Min</th>
                    <th className="text-right pr-1">Punkte</th>
                  </tr>
                </thead>
                <tbody>
                  {matchdays
                    .slice()
                    .reverse()
                    .slice(0, 18)
                    .map((m, i) => {
                      const pts = m.p;
                      const isHome = m.pt === m.t1;
                      const opp = isHome ? m.t2 : m.t1;
                      const oppMeta = teamMeta(opp);
                      const goalsFor = isHome ? m.t1g : m.t2g;
                      const goalsAg = isHome ? m.t2g : m.t1g;
                      return (
                        <tr key={i}>
                          <td className="pl-1 font-mono tabular text-muted-foreground">
                            {m.day !== undefined ? `MD ${m.day}` : `#${i + 1}`}
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">
                                {isHome ? "vs" : "@"}
                              </span>
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
                                style={{ backgroundColor: `${oppMeta.color}1a`, color: oppMeta.color }}
                              >
                                {oppMeta.short}
                              </span>
                              {goalsFor !== undefined && goalsAg !== undefined && (
                                <span className="font-mono tabular text-muted-foreground">
                                  {goalsFor}:{goalsAg}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-center text-xs text-muted-foreground tabular hidden sm:table-cell">
                            {m.mp ?? "–"}
                          </td>
                          <td className="text-right pr-1 font-mono font-semibold">
                            {pts !== undefined ? (
                              <span
                                className={
                                  pts >= 200
                                    ? "text-emerald-700"
                                    : pts >= 100
                                    ? "text-emerald-600"
                                    : pts >= 50
                                    ? "text-amber-600"
                                    : pts > 0
                                    ? "text-rose-600"
                                    : "text-muted-foreground"
                                }
                              >
                                {pts}
                              </span>
                            ) : (
                              "–"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* News-Sektion zu diesem Spieler */}
      <PlayerNewsSection
        playerId={playerId}
        playerName={player.n ?? "Spieler"}
        leagueId={leagueId}
      />
    </div>
  );
}

async function PlayerNewsSection({
  playerId,
  playerName,
  leagueId,
}: {
  playerId: string;
  playerName: string;
  leagueId: string;
}) {
  const [news, idx] = await Promise.all([
    getRecentNewsForPlayer(playerId, { limit: 8 }),
    getPlayerIndex(),
  ]);
  if (news.length === 0) return null;

  const playerNameMap: Record<
    string,
    { name: string; pim?: string; tid?: string }
  > = {};
  for (const [pid, meta] of Object.entries(idx.byPlayerId)) {
    playerNameMap[pid] = { name: meta.name, pim: meta.pim, tid: meta.tid };
  }

  return (
    <Card id="news" className="slide-up scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-primary" />
          News zu {playerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {news.map((item) => (
          <NewsCard
            key={item.externalId}
            item={item}
            playerNameMap={playerNameMap}
            leagueId={leagueId}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className={"font-mono font-semibold tabular " + (className ?? "text-foreground")}>
        {value}
      </div>
    </div>
  );
}
