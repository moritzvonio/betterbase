import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { getAccess } from "@/lib/entitlement";
import { assembleCompetitionStats } from "@/lib/competition-data";
import { snapshotConfigured } from "@/lib/snapshot-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatEUR, formatDelta, cn } from "@/lib/utils";
import { ShareButtons } from "@/components/share-button";
import type { ManagerComputedStats } from "@/lib/competitor";
import {
  Wallet,
  Target,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Crown,
  Trophy,
  Info,
  Swords,
  Lock,
} from "lucide-react";
import { Suspense } from "react";
import { NetWorthChartSection } from "../NetWorthChartSection";

export const metadata: Metadata = { title: "Wettbewerb" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WettbewerbPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { id: leagueId } = await params;
  const sp = await searchParams;
  const path = `/league/${leagueId}/wettbewerb`;
  const session = await requireSessionOrRedirect(path);
  const access = await getAccess(session.userId);
  // Free (Testphase abgelaufen, nicht Pro) → Teaser statt Vollansicht.
  const locked = !access.pro && !access.trial;

  // Free-User (locked) bekommt eine FIXE Sortierung – sonst könnte er über die
  // Sort-Tabs (?sort=cash|maxbid|…) nacheinander jedes Top-2-Paar im Klartext
  // aufdecken und so die ganze Liga gratis auslesen.
  const requestedSort = (sp.sort ?? "netto") as
    | "netto"
    | "cash"
    | "maxbid"
    | "tv"
    | "daygain"
    | "balance"
    | "points";
  const sortKey = locked ? "netto" : requestedSort;

  const data = await assembleCompetitionStats(session.token, leagueId, session.userId);
  if (!data) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <EmptyState
            icon={<Swords className="size-6" />}
            title="Keine Liga-Mitglieder gefunden"
            description="Wir konnten die Manager-Liste nicht laden. Probier später erneut."
          />
        </Card>
      </div>
    );
  }
  const { stats, chartManagers, leagueStartMs, initialBudget, residualRate } = data;

  const me = stats.find((s) => s.userId === session.userId);
  const others = stats.filter((s) => s.userId !== session.userId);

  const sorters: Record<typeof sortKey, (a: ManagerComputedStats, b: ManagerComputedStats) => number> = {
    netto: (a, b) => b.netTeamValue - a.netTeamValue,
    cash: (a, b) => b.cashEstimate - a.cashEstimate,
    maxbid: (a, b) => b.maxBidSingleSell - a.maxBidSingleSell,
    tv: (a, b) => b.teamValue - a.teamValue,
    daygain: (a, b) => b.dayGain - a.dayGain,
    balance: (a, b) => b.transferBalance - a.transferBalance,
    points: (a, b) => (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0),
  };
  const sortedOthers = others.slice().sort(sorters[sortKey] ?? sorters.netto);

  // Wie viele Konkurrenten-Zeilen der Free-Teaser klar zeigt: 2 – aber nur,
  // wenn danach noch etwas gesperrt bleibt. Bei ≤2 Konkurrenten würde der
  // Teaser sonst die komplette Liga gratis offenlegen.
  const TEASER_ROWS = 2;
  const teaserVisible = sortedOthers.length > TEASER_ROWS ? TEASER_ROWS : 0;

  const SORT_TABS: Array<{ key: typeof sortKey; label: string; icon: typeof Wallet }> = [
    { key: "netto", label: "Netto-Teamwert", icon: TrendingUp },
    { key: "cash", label: "Kontostand", icon: Wallet },
    { key: "maxbid", label: "Max-Gebot", icon: Target },
    { key: "tv", label: "Teamwert", icon: Users },
    { key: "daygain", label: "Tagesgewinn", icon: ArrowUp },
    { key: "balance", label: "Transferbilanz", icon: ArrowUp },
    { key: "points", label: "Punkte", icon: Trophy },
  ];

  return (
    <div className="space-y-6">
      <Header trialEnd={access.trial && !access.pro ? access.trialEnd : undefined} />

      {/* My own card (highlighted) */}
      {me && (
        <section className="slide-up">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
            Du
          </h2>
          <ManagerCard stats={me} budget={initialBudget} highlight />
        </section>
      )}

      {/* Netto-Teamwert chart – Suspense-gestreamt, blockiert die Seite nicht */}
      {!locked && Number.isFinite(leagueStartMs) && (
        <Suspense fallback={<ChartSkeleton startMs={leagueStartMs} />}>
          <NetWorthChartSection
            leagueId={leagueId}
            token={session.token}
            managers={chartManagers}
            leagueStartMs={leagueStartMs}
            initialBudget={initialBudget}
            highlightUserId={session.userId}
          />
        </Suspense>
      )}

      {/* Sort tabs – nur für freigeschaltete Nutzer (locked = fixe Sortierung) */}
      <section className="slide-up slide-up-2">
        {!locked && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
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
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-full text-[11px] font-medium border transition-colors",
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
        {!locked && (
          <div className="mb-3">
            <ShareButtons leagueId={leagueId} snapshotEnabled={snapshotConfigured()} />
          </div>
        )}
        {/* Große Vergleichs-Tabelle (alle Manager, alle Stats nebeneinander).
            Free-Teaser: eigene Zeile + 2 Konkurrenten klar, Rest gesperrt.
            Bei ≤2 Konkurrenten würden 2 Teaser-Zeilen die ganze Liga zeigen –
            dann alle Konkurrenten sperren, damit die Paywall greift. */}
        <CompareTable
          stats={
            (locked
              ? [me, ...sortedOthers.slice(0, teaserVisible)]
              : [me, ...sortedOthers]
            ).filter(Boolean) as ManagerComputedStats[]
          }
          myUserId={session.userId}
          lockedRows={locked ? sortedOthers.length - teaserVisible : 0}
        />

        {locked ? (
          <UpgradeTeaser count={sortedOthers.length} />
        ) : (
          /* Detail-Cards (klassische Card-Ansicht für Drill-Down) */
          <details className="mt-6">
            <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground font-semibold hover:text-foreground py-2">
              Detail-Karten anzeigen ({sortedOthers.length} Manager)
            </summary>
            <div className="grid gap-3 mt-3">
              {sortedOthers.map((s) => (
                <ManagerCard key={s.userId} stats={s} budget={initialBudget} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Methodik-Hinweis */}
      <Card className="bg-primary/[0.04] border-primary/20 slide-up slide-up-2">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-2.5">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Info className="size-3.5 text-primary" />
            Methodik der Cash-Berechnung
          </div>
          <div>
            Cash = <span className="font-mono text-foreground">{formatEUR(initialBudget, { compact: true })}</span> Start
            + Transferbilanz + Punkteprämie (1.000 € × Punkt) + Spieltagssiege (1 Mio × Sieg)
            + Tagesbonus (100k-Streak) + Erfolge. Das Regelwerk ist empirisch gegen
            echte Kontostände verifiziert.
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            <div>
              <span className="font-medium text-foreground">📊 Exakt aus Kickbase:</span>
              <ul className="list-disc ml-4 mt-1">
                <li><span className="text-emerald-700 font-semibold">Eigener Cash</span>: direkt aus <code className="font-mono">/me/budget</code></li>
                <li>Alle Käufe + Verkäufe seit Liga-Start (paginiert)</li>
                <li>Saisonpunkte + Spieltagssiege je Manager (Dashboard)</li>
                <li>Eigene Erfolge: Σ ac × er aus <code className="font-mono">/user/achievements</code></li>
              </ul>
            </div>
            <div>
              <span className="font-medium text-foreground">🧮 Geschätzt (für andere Manager):</span>
              <ul className="list-disc ml-4 mt-1">
                <li><span className="text-sky-700">Tagesbonus</span>: 100k/Tag als volle Streak seit Liga-Start (kann überschätzen)</li>
                <li><span className="text-violet-700">Erfolge</span>: exakte Teile (Teamwert, Meister) + Raten, die am eigenen Account geeicht sind</li>
                <li><span className="text-amber-700">Rest-Term</span>: {residualRate.toFixed(0)} €/Punkt (aus deinem IST-Cash kalibriert)</li>
              </ul>
            </div>
          </div>
          <div>
            <span className="font-medium text-foreground">Max-Gebot</span> nach 33 %-Regel:
            Verkauf an Liga-Bank gibt 67 % des MV.{" "}
            <span className="font-mono">Cash + 0,67 × MV teuerster Spieler</span> = realistischer Max-Bid.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChartSkeleton({ startMs }: { startMs: number }) {
  return (
    <section className="slide-up slide-up-1">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <TrendingUp className="size-4" />
            </span>
            Netto-Teamwert seit Liga-Start
            <Badge variant="muted" className="ml-auto text-[10px]">
              seit {new Date(startMs).toLocaleDateString("de-DE")}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 sm:h-80 w-full rounded-lg bg-muted/40 animate-pulse flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Verlauf wird geladen …</span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Header({ trialEnd }: { trialEnd?: Date }) {
  return (
    <div className="slide-up">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3 flex-wrap">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Swords className="size-5" />
        </span>
        Wettbewerb
        {trialEnd && (
          <Badge variant="muted" className="text-[10px] font-medium">
            Testphase bis {trialEnd.toLocaleDateString("de-DE")}
          </Badge>
        )}
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Kontostände, Max-Gebote und Transferbilanzen aller Manager – zurückgerechnet
        aus den öffentlichen Liga-Daten.
      </p>
    </div>
  );
}

/* Free-Teaser: prominenter CTA-Block unter der (gesperrten) Vergleichstabelle. */
function UpgradeTeaser({ count }: { count: number }) {
  return (
    <Card className="mt-6 border-primary/40 bg-primary/[0.05] overflow-hidden">
      <CardContent className="p-6 text-center">
        <div className="size-11 rounded-full bg-primary/15 mx-auto flex items-center justify-center mb-3">
          <Lock className="size-5 text-primary" />
        </div>
        <h3 className="font-semibold text-base mb-1">
          Sieh alle Kontostände + Max-Gebote
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
          {count > 2
            ? `${count - 2} weitere Mitspieler sind gesperrt. `
            : ""}
          Schalte die kompletten Kontostände, Max-Gebote und den
          Netto-Teamwert-Verlauf deiner Liga frei – Pro für 6 € pro Halbserie.
        </p>
        <Link
          href="/upgrade"
          className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
        >
          Pro freischalten
        </Link>
      </CardContent>
    </Card>
  );
}

function ManagerCard({
  stats,
  budget,
  highlight,
}: {
  stats: ManagerComputedStats;
  budget: number;
  highlight?: boolean;
}) {
  const balanceColor =
    stats.transferBalance > 0
      ? "text-emerald-600"
      : stats.transferBalance < 0
      ? "text-rose-600"
      : "text-muted-foreground";
  const dayColor =
    stats.dayGain > 0
      ? "text-emerald-600"
      : stats.dayGain < 0
      ? "text-rose-600"
      : "text-muted-foreground";

  return (
    <Card
      className={cn(
        "card-hover overflow-hidden relative",
        highlight && "ring-2 ring-primary/40 card-glow"
      )}
    >
      {highlight && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-emerald-300" />
      )}
      <CardContent className="p-4">
        {/* Header row: avatar + name + Netto-Teamwert hero */}
        <div className="flex items-start gap-3 mb-4">
          <UserAvatar name={stats.name} image={stats.image} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{stats.name}</span>
              {stats.placement === 1 && (
                <Crown className="size-3.5 text-amber-500 shrink-0" />
              )}
              {highlight && (
                <Badge variant="default" className="text-[10px] py-0">Du</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground tabular flex items-center gap-2 flex-wrap mt-0.5">
              {stats.placement !== undefined && <span>Platz #{stats.placement}</span>}
              {stats.seasonPoints !== undefined && (
                <span className="font-mono">{stats.seasonPoints.toLocaleString("de-DE")} Pkt</span>
              )}
              <span className="text-muted-foreground">·</span>
              <span>{stats.squadSize} Spieler</span>
              {stats.matchdayWins > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-amber-600 font-medium">
                    {stats.matchdayWins}× Spieltagssieg
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Netto-Teamwert hero */}
          <div className="text-right shrink-0">
            <div
              className={cn(
                "text-xl sm:text-2xl font-bold tabular leading-none gradient-text"
              )}
            >
              {formatEUR(stats.netTeamValue, { compact: true })}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-1">
              Netto-Teamwert (gesch.)
            </div>
          </div>
        </div>

        {/* Stat grid – 2 zeilen × 3 spalten auf mobile, 6 spalten auf desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-sm">
          <Stat
            label="Teamwert"
            value={formatEUR(stats.teamValue, { compact: true })}
            icon={<Users className="size-3" />}
            sub="reine Spieler-Σ"
          />
          <Stat
            label="Kontostand"
            value={
              <span className={stats.cashEstimate < 0 ? "text-rose-600" : ""}>
                {formatEUR(stats.cashEstimate, { compact: true })}
              </span>
            }
            icon={<Wallet className="size-3" />}
            tone={stats.cashEstimate < 0 ? "danger" : undefined}
            sub={stats.cashMethod === "ist" ? "exakt (API)" : "geschätzt"}
          />
          <Stat
            label="Max-Gebot"
            value={formatEUR(stats.maxBidSingleSell, { compact: true })}
            icon={<Target className="size-3" />}
            tone="primary"
            sub={`max ${formatEUR(stats.maxBidTotal, { compact: true })}`}
          />
          <Stat
            label="Tagesgewinn"
            value={
              <span className={dayColor}>
                {stats.dayGain ? formatDelta(stats.dayGain) : "0 €"}
              </span>
            }
            icon={
              stats.dayGain > 0 ? (
                <TrendingUp className="size-3" />
              ) : stats.dayGain < 0 ? (
                <TrendingDown className="size-3" />
              ) : (
                <TrendingUp className="size-3" />
              )
            }
            tone={stats.dayGain > 0 ? "success" : stats.dayGain < 0 ? "danger" : undefined}
          />
          <Stat
            label="Transferbilanz"
            value={
              <span className={balanceColor}>
                {stats.transferBalance ? formatDelta(stats.transferBalance) : "0 €"}
              </span>
            }
            icon={
              stats.transferBalance >= 0 ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )
            }
            sub={`${stats.transferCount} Transfers`}
          />
          <Stat
            label="Punkte"
            value={
              stats.seasonPoints !== undefined
                ? stats.seasonPoints.toLocaleString("de-DE")
                : "–"
            }
            icon={<Trophy className="size-3" />}
            sub={
              stats.placement !== undefined
                ? `Platz #${stats.placement}`
                : undefined
            }
          />
        </div>

        {/* Estimate-vs-Real Vergleich (nur eigener User) – Validierung */}
        {stats.realCashFromApi !== undefined && (
          <CashValidationPanel stats={stats} />
        )}

        {/* Cash composition mini-bar */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-2 flex-wrap">
            Cash-Komposition {stats.cashMethod === "ist" ? "(Strukturmodell zur Kontrolle)" : "(geschätzt)"}
            <span className="text-muted-foreground/70 normal-case tracking-normal">
              ({stats.daysActive} Tage · {stats.transferCount} Transfers)
            </span>
          </div>
          <div className="flex items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground tabular flex-wrap">
            <span>
              Start <span className="text-foreground font-mono">{formatEUR(budget, { compact: true })}</span>
            </span>
            <span className="text-rose-600">
              − {formatEUR(stats.totalBought, { compact: true })} Käufe
            </span>
            <span className="text-emerald-600">
              + {formatEUR(stats.totalSold, { compact: true })} Verkäufe
            </span>
            <span className="text-emerald-700">
              + {formatEUR(stats.estimatedPointsBonus, { compact: true })} Punkteprämie
            </span>
            {stats.estimatedWinBonus > 0 && (
              <span className="text-amber-600">
                + {formatEUR(stats.estimatedWinBonus, { compact: true })} Siege
              </span>
            )}
            <span className="text-sky-600">
              + {formatEUR(stats.estimatedLoginBonus, { compact: true })} Tagesbonus
            </span>
            {stats.realAchievementBonus !== undefined ? (
              <span className="text-violet-700 font-semibold">
                + {formatEUR(stats.realAchievementBonus, { compact: true })} Erfolge (exakt)
              </span>
            ) : (
              <span className="text-violet-600">
                + ~{formatEUR(stats.estimatedAchievementBonus, { compact: true })} Erfolge
              </span>
            )}
            {stats.calibratedResidualBonus > 0 && (
              <span className="text-muted-foreground">
                + {formatEUR(stats.calibratedResidualBonus, { compact: true })} Rest
              </span>
            )}
            {stats.cashUncertain && (
              <Badge variant="muted" className="text-[9px]">
                ungenau
              </Badge>
            )}
          </div>

          {/* Achievement-Breakdown – nur für eigenen User */}
          {stats.achievementBreakdown && stats.achievementBreakdown.length > 0 && (
            <details className="mt-2 text-[10px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground tabular">
                Erfolge im Detail ({stats.achievementBreakdown.filter((a) => a.ac > 0).length} aktiv)
              </summary>
              <div className="mt-1.5 grid sm:grid-cols-2 gap-x-3 gap-y-0.5 pl-2">
                {stats.achievementBreakdown
                  .filter((a) => a.ac > 0 && a.total > 0)
                  .sort((a, b) => b.total - a.total)
                  .map((a) => (
                    <div
                      key={a.t}
                      className="flex items-center justify-between text-[10px] text-muted-foreground tabular"
                    >
                      <span className="truncate">
                        {a.n} <span className="text-foreground/60">×{a.ac}</span>
                      </span>
                      <span className="font-mono text-violet-700 font-semibold">
                        {formatEUR(a.total, { compact: true })}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Validierungs-Panel: Strukturmodell vs. echter Cash (eigener User) ── */
function CashValidationPanel({ stats }: { stats: ManagerComputedStats }) {
  const real = stats.realCashFromApi ?? 0;
  const err = stats.cashEstimateError ?? 0;
  const absErr = Math.abs(err);
  const structural = real - err;

  const lines: Array<{ label: string; value: number; color?: string; note?: string }> = [
    { label: "Start-Budget", value: stats.initialBudget },
    { label: "Transferbilanz", value: stats.transferBalance, color: stats.transferBalance < 0 ? "text-rose-700" : "text-emerald-700", note: `${stats.transferCount} Transfers` },
    { label: "Punkteprämie", value: stats.estimatedPointsBonus, color: "text-emerald-700", note: `${stats.totalMatchdayPoints.toLocaleString("de-DE")} Pkt × 1k` },
    { label: "Spieltagssiege", value: stats.estimatedWinBonus, color: "text-amber-700", note: `${stats.matchdayWins} × 1 Mio` },
    { label: "Tagesbonus", value: stats.estimatedLoginBonus, color: "text-sky-700", note: `${stats.daysActive} Tage (Streak-Modell)` },
    { label: stats.realAchievementBonus !== undefined ? "Erfolge (exakt, API)" : "Erfolge (geschätzt)", value: stats.estimatedAchievementBonus, color: "text-violet-700" },
    { label: "Rest-Term (kalibriert)", value: stats.calibratedResidualBonus, color: "text-muted-foreground" },
  ];

  const accurate = absErr < 1_000_000;
  const tone = accurate ? "success" : absErr < 5_000_000 ? "muted" : "danger";

  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer list-none flex flex-wrap items-center gap-2 text-[11px] py-1.5 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="font-medium">Wie genau ist das Modell?</span>
        <Badge variant={tone} className="text-[9px]">
          {accurate ? "✓ Validiert an deinem Konto" : "Abweichung"} · {err > 0 ? "+" : ""}
          {formatEUR(err, { compact: true })}
        </Badge>
      </summary>
      <div
        className={cn(
          "mt-2 rounded-lg border p-3",
          accurate
            ? "border-emerald-300 bg-emerald-50/40"
            : absErr < 5_000_000
            ? "border-amber-300 bg-amber-50/40"
            : "border-rose-300 bg-rose-50/40"
        )}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-2">
          📊 Modell-Validierung an deinem Konto
        </div>

      <div className="grid grid-cols-3 gap-2 text-xs tabular mb-3">
        <div className="bg-white/70 rounded p-2 ring-1 ring-border">
          <div className="text-[10px] text-muted-foreground">Strukturmodell</div>
          <div className="font-mono font-bold text-base">
            {formatEUR(structural, { compact: true })}
          </div>
        </div>
        <div className="bg-white/70 rounded p-2 ring-1 ring-emerald-200">
          <div className="text-[10px] text-muted-foreground">Echt (Kickbase)</div>
          <div className="font-mono font-bold text-base text-emerald-700">
            {formatEUR(real, { compact: true })}
          </div>
        </div>
        <div
          className={cn(
            "rounded p-2 ring-1",
            absErr < 1_000_000 ? "bg-emerald-100/60 ring-emerald-300" : "bg-amber-100/60 ring-amber-300"
          )}
        >
          <div className="text-[10px] text-muted-foreground">Abweichung</div>
          <div className="font-mono font-bold text-base">
            {err > 0 ? "+" : ""}
            {formatEUR(err, { compact: true })}
          </div>
        </div>
      </div>

      <div className="text-[11px] tabular space-y-1">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center justify-between border-b border-border/30 pb-0.5">
            <span className="flex items-center gap-1.5">
              <span className={cn("font-mono w-3", l.color)}>{l.value < 0 ? "−" : "+"}</span>
              <span>{l.label}</span>
              {l.note && (
                <span className="text-[10px] text-muted-foreground">({l.note})</span>
              )}
            </span>
            <span className={cn("font-mono font-medium", l.color)}>
              {formatEUR(Math.abs(l.value), { compact: true })}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border">
          <span className="font-semibold">= Strukturmodell</span>
          <span className="font-mono font-bold">{formatEUR(structural, { compact: true })}</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-3 italic">
        Dein Kontostand kommt exakt aus <code className="font-mono">/me/budget</code>.
        Dasselbe Strukturmodell schätzt die anderen Manager – die Abweichung oben
        zeigt, wie gut es aktuell trifft (Rest-Term wird daraus geeicht).
      </p>
      </div>
    </details>
  );
}

function Stat({
  label,
  value,
  icon,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  sub?: string;
  tone?: "primary" | "success" | "danger";
}) {
  const wrap: Record<string, string> = {
    primary: "bg-primary/5 ring-primary/20",
    success: "bg-emerald-500/[0.06] ring-emerald-500/20",
    danger: "bg-rose-500/[0.06] ring-rose-500/20",
  };
  return (
    <div
      className={cn(
        "rounded-lg ring-1 ring-border px-2.5 py-2",
        tone && wrap[tone]
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
        {icon}
        {label}
      </div>
      <div className="font-mono font-semibold tabular text-sm">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground tabular mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Große tabellarische Übersicht aller Manager mit allen wichtigen Stats
 * nebeneinander. Eigener User wird hervorgehoben.
 */
function CompareTable({
  stats,
  myUserId,
  lockedRows = 0,
}: {
  stats: ManagerComputedStats[];
  myUserId: string;
  /** Anzahl gesperrter Platzhalterzeilen (Free-Teaser) – enthalten KEINE echten Daten. */
  lockedRows?: number;
}) {
  return (
    <Card className="overflow-hidden mb-6">
      <div className="relative">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs tabular">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left pl-4 py-2.5 font-semibold w-10 sticky left-0 z-20 bg-muted">#</th>
              <th className="text-left py-2.5 font-semibold min-w-[140px] sticky left-10 z-20 bg-muted">
                Manager
              </th>
              <th className="text-right py-2.5 font-semibold">Punkte</th>
              <th className="text-right py-2.5 font-semibold">Siege</th>
              <th className="text-right py-2.5 font-semibold">Teamwert</th>
              <th className="text-right py-2.5 font-semibold">Cash</th>
              <th className="text-right py-2.5 font-semibold bg-primary/[0.04]">
                Netto-TW
              </th>
              <th className="text-right py-2.5 font-semibold">Max-Gebot</th>
              <th className="text-right py-2.5 font-semibold">Δ Transfer</th>
              <th className="text-right pr-4 py-2.5 font-semibold">24 h</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const isMe = s.userId === myUserId;
              return (
                <tr
                  key={s.userId}
                  className={cn(
                    "border-b border-border/40 last:border-0",
                    isMe && "bg-primary/[0.06] font-medium"
                  )}
                >
                  <td
                    className={cn(
                      "pl-4 py-2.5 text-muted-foreground sticky left-0 z-10",
                      isMe ? "bg-emerald-50" : "bg-card"
                    )}
                  >
                    {i + 1}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 sticky left-10 z-10 shadow-[6px_0_6px_-4px_rgba(0,0,0,0.06)]",
                      isMe ? "bg-emerald-50" : "bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar name={s.name} image={s.image} size="xs" />
                      <span className={cn("truncate", isMe && "font-semibold")}>
                        {s.name}
                      </span>
                      {isMe && (
                        <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-bold bg-primary text-primary-foreground">
                          Du
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right py-2.5 font-mono font-semibold">
                    {s.seasonPoints?.toLocaleString("de-DE") ?? "–"}
                  </td>
                  <td className="text-right py-2.5 font-mono text-amber-700">
                    {s.matchdayWins > 0 ? `${s.matchdayWins}×` : "–"}
                  </td>
                  <td className="text-right py-2.5 font-mono">
                    {formatEUR(s.teamValue, { compact: true })}
                  </td>
                  <td
                    className={cn(
                      "text-right py-2.5 font-mono",
                      s.cashEstimate < 0 ? "text-rose-600" : "text-foreground"
                    )}
                  >
                    {formatEUR(s.cashEstimate, { compact: true })}
                    {s.cashMethod === "ist" && (
                      <span className="text-emerald-600 ml-0.5" title="exakt aus API">
                        ✓
                      </span>
                    )}
                  </td>
                  <td className="text-right py-2.5 font-mono font-semibold bg-primary/[0.04]">
                    {formatEUR(s.netTeamValue, { compact: true })}
                  </td>
                  <td className="text-right py-2.5 font-mono text-muted-foreground">
                    {formatEUR(s.maxBidSingleSell, { compact: true })}
                  </td>
                  <td
                    className={cn(
                      "text-right py-2.5 font-mono",
                      s.transferBalance > 0
                        ? "text-emerald-600"
                        : s.transferBalance < 0
                        ? "text-rose-600"
                        : "text-muted-foreground"
                    )}
                  >
                    {s.transferBalance === 0
                      ? "–"
                      : (s.transferBalance > 0 ? "+" : "") +
                        formatEUR(s.transferBalance, { compact: true })}
                  </td>
                  <td
                    className={cn(
                      "text-right pr-4 py-2.5 font-mono",
                      s.dayGain > 0
                        ? "text-emerald-600"
                        : s.dayGain < 0
                        ? "text-rose-600"
                        : "text-muted-foreground"
                    )}
                  >
                    {s.dayGain === 0
                      ? "–"
                      : (s.dayGain > 0 ? "+" : "") +
                        formatEUR(s.dayGain, { compact: true })}
                  </td>
                </tr>
              );
            })}
            {/* Gesperrte Platzhalterzeilen – bewusst OHNE echte Manager-Werte
                (kein View-Source-Leak), nur geblurrte Punkte. */}
            {Array.from({ length: lockedRows }).map((_, i) => (
              <tr
                key={`locked-${i}`}
                className="border-b border-border/40 last:border-0 select-none pointer-events-none"
                aria-hidden
              >
                <td className="pl-4 py-2.5 text-muted-foreground sticky left-0 z-10 bg-card">
                  <span className="blur-sm">{stats.length + i + 1}</span>
                </td>
                <td className="py-2.5 sticky left-10 z-10 bg-card shadow-[6px_0_6px_-4px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center gap-2 min-w-0 blur-sm">
                    <span className="size-5 rounded-full bg-muted-foreground/30 shrink-0" />
                    <span className="truncate text-muted-foreground">Mitspieler</span>
                  </div>
                </td>
                {Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="text-right py-2.5 font-mono text-muted-foreground">
                    <span className="blur-sm">•••</span>
                  </td>
                ))}
                <td className="text-right pr-4 py-2.5 font-mono text-muted-foreground">
                  <span className="blur-sm">•••</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {/* Scroll-Affordance: weiche Fade-Kante rechts (nur < md, wo die Tabelle scrollt) */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent md:hidden" />
      </div>
      <p className="text-[10px] text-muted-foreground px-4 py-2 border-t border-border bg-muted/30">
        Sortierung folgt deiner Tab-Auswahl oben · Netto-TW = Teamwert + Cash
        (Gesamt-Vermögen) · Max-Gebot = Cash + 67 % vom teuersten Squad-Spieler
      </p>
    </Card>
  );
}
