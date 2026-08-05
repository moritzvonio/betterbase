import type { Metadata } from "next";
import { kb } from "@/lib/kickbase/api";
import { requireSessionOrRedirect, withKbAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardList } from "lucide-react";
import { Planner, type PlannerPlayer } from "./Planner";
import type { KbLineupPlayer, KbSquadPlayer } from "@/lib/kickbase/types";

export const metadata: Metadata = { title: "Aufstellung" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AufstellungPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = await params;
  const path = `/league/${leagueId}/aufstellung`;
  const session = await requireSessionOrRedirect(path);

  const [overview, squad, budget] = await Promise.all([
    withKbAuth(path, () => kb.lineupOverview(session.token, leagueId)).catch(() => null),
    withKbAuth(path, () => kb.squad(session.token, leagueId)).catch(() => ({ it: [] as KbSquadPlayer[] })),
    withKbAuth(path, () => kb.myBudget(session.token, leagueId)).catch(() => null),
  ]);

  const lineupPlayers = overview?.lp ?? [];
  const squadPlayers = squad.it ?? [];

  // Merge: prefer lineup data (has lo, opponents) but enrich with squad data (mvgl, tfhmvt)
  const merged: PlannerPlayer[] = [];
  const seen = new Set<string>();

  for (const lp of lineupPlayers) {
    const sq = squadPlayers.find((s) => s.i === lp.pi);
    seen.add(lp.pi);
    merged.push(toPlannerPlayer(lp, sq));
  }
  for (const sq of squadPlayers) {
    if (!seen.has(sq.i)) {
      merged.push({
        id: sq.i,
        name: sq.n,
        pos: sq.pos,
        mv: sq.mv ?? 0,
        ap: sq.ap,
        tp: sq.p ?? sq.tp,
        tid: sq.tid,
        pim: sq.pim,
        lo: undefined,
        st: sq.st,
        tfhmvt: sq.tfhmvt,
        mvgl: sq.mvgl,
      });
    }
  }

  if (merged.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="Kein Kader gefunden"
            description="Wir konnten keine Spieler für deinen Kader laden. Liga in Kickbase prüfen oder später erneut versuchen."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />
      <Planner
        leagueId={leagueId}
        players={merged}
        budget={budget?.b ?? 0}
        deadline={overview?.lis}
        matchday={overview?.mdln}
      />
    </div>
  );
}

function Header() {
  return (
    <div className="slide-up">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <ClipboardList className="size-5" />
        </span>
        Aufstellungs-Planer
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Plane deine Aufstellung, Verkaufs-Kandidaten und Budget für den nächsten Spieltag.
        Dein Plan wird an deinem Ligabase-Konto gespeichert und auf allen Geräten geladen –
        nicht zu Kickbase übertragen.
      </p>
    </div>
  );
}

function toPlannerPlayer(lp: KbLineupPlayer, sq?: KbSquadPlayer): PlannerPlayer {
  return {
    id: lp.pi,
    name: lp.n ?? sq?.n ?? "?",
    pos: lp.pos ?? sq?.pos ?? 0,
    mv: (lp.mv && lp.mv > 0 ? lp.mv : sq?.mv) ?? 0,
    ap: lp.ap ?? sq?.ap,
    tp: lp.tp ?? sq?.p ?? sq?.tp,
    tid: lp.tid ?? sq?.tid ?? "?",
    pim: lp.pim ?? sq?.pim,
    lo: lp.lo,
    isCaptain: lp.ictp,
    st: lp.st ?? sq?.st,
    next1: lp.t1,
    next2: lp.t2,
    tfhmvt: sq?.tfhmvt,
    mvgl: sq?.mvgl,
  };
}
