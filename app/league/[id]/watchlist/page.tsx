import type { Metadata } from "next";
import Link from "next/link";
import { kb } from "@/lib/kickbase/api";
import { requireSessionOrRedirect, withKbAuth } from "@/lib/auth";
import { getWatched } from "@/lib/watchlist";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamTag } from "@/components/ui/team-tag";
import { PositionBadge } from "@/components/ui/position-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { formatEUR, formatDelta } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import { ArrowDown, ArrowUp, Minus, Star } from "lucide-react";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = await params;
  const path = `/league/${leagueId}/watchlist`;
  const session = await requireSessionOrRedirect(path);
  const ids = await getWatched(session.userId);

  const players = await Promise.all(
    ids.map((pid) =>
      withKbAuth(path, () => kb.player(session.token, leagueId, pid)).catch(() => null)
    )
  );

  return (
    <div className="space-y-6">
      <div className="slide-up">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Star className="size-5" />
          </span>
          Watchlist
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {ids.length === 0
            ? "Du beobachtest noch keine Spieler"
            : `${ids.length} ${ids.length === 1 ? "Spieler" : "Spieler"} im Blick`}
        </p>
      </div>

      {ids.length === 0 ? (
        <Card className="slide-up slide-up-1">
          <EmptyState
            icon={<Star className="size-6" />}
            title="Noch leer"
            description="Öffne einen Spieler und tippe auf »Beobachten«, um ihn hier zu sehen. Push wenn der Marktwert sich bewegt."
          />
        </Card>
      ) : (
        <div className="grid gap-2 slide-up slide-up-1">
          {players.map((p, idx) => {
            if (!p) {
              return (
                <Card key={ids[idx]}>
                  <div className="py-3 px-4 text-sm text-muted-foreground">
                    Spieler {ids[idx]} konnte nicht geladen werden.
                  </div>
                </Card>
              );
            }
            const trend24 = (p as { tfhmvt?: number }).tfhmvt ?? 0;
            const TrendIcon = trend24 > 0 ? ArrowUp : trend24 < 0 ? ArrowDown : Minus;
            const trendColor =
              trend24 > 0
                ? "text-emerald-600"
                : trend24 < 0
                ? "text-rose-600"
                : "text-muted-foreground";
            return (
              <Link
                key={p.i}
                href={`/league/${leagueId}/spieler/${p.i}`}
                className="card-hover block rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  <PlayerAvatar pim={p.pim} tid={p.tid} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-2">
                      {p.fn ? `${p.fn} ` : ""}
                      {p.n}
                      {(p as { iotm?: boolean }).iotm && (
                        <Badge variant="default" className="text-[10px]">
                          Auf Markt
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <TeamTag tid={p.tid} size="xs" />
                      <PositionBadge pos={p.pos} className="text-[9px] h-4 px-1" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold tabular">
                      {formatEUR(p.mv, { compact: true })}
                    </div>
                    <div
                      className={`text-xs flex items-center justify-end gap-0.5 font-mono tabular ${trendColor}`}
                    >
                      <TrendIcon className="size-3" />
                      <span>{trend24 ? formatDelta(trend24) : "0"}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
