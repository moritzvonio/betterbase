import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { PushToggle } from "@/components/push-toggle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Logo } from "@/components/ui/logo";
import { Bell, Sparkles, Settings } from "lucide-react";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireSessionOrRedirect("/account");

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 glass">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/leagues" className="hover:opacity-90 transition">
            <Logo size={28} />
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-10 space-y-6">
        <div className="slide-up">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Settings className="size-5" />
            </span>
            Account
          </h1>
        </div>

        {/* Profile card with avatar */}
        <Card className="slide-up slide-up-1">
          <CardContent className="p-6 flex items-center gap-4">
            <UserAvatar name={session.name ?? "?"} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-lg truncate">{session.name ?? "–"}</div>
              <div className="text-sm text-muted-foreground truncate">{session.email ?? "–"}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono tabular">
                ID: {session.userId}
              </div>
            </div>
            <Badge variant="success" className="gap-1 py-1 px-3 shrink-0">
              <Sparkles className="size-3" /> Beta
            </Badge>
          </CardContent>
        </Card>

        {/* Zugang: offene Beta – Pro/Trial-Flächen kommen mit dem Pricing zurück
            (FREE_BETA in lib/entitlement). */}
        <Card className="slide-up slide-up-2 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-700" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Zugang
            </CardTitle>
            <CardDescription>Offene Beta – alles freigeschaltet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Status" value="Offene Beta (alle Features frei)" />
            <p className="text-muted-foreground">
              Wettbewerb, Bid-Advisor und der Netto-Teamwert-Verlauf sind während
              der Beta für alle kostenlos. Nach der Beta kann ein kleiner Preis
              für einzelne Pro-Flächen kommen.
            </p>
          </CardContent>
        </Card>

        {/* Push card */}
        <Card className="slide-up slide-up-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4 text-primary" />
              Push-Notifications
            </CardTitle>
            <CardDescription>
              Marktwert-Drops, neue Transfers in deiner Liga, Watchlist-Alerts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushToggle />
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center pt-4">
          Ligabase ist nicht offiziell mit Kickbase verbunden. Nutzung auf eigene Verantwortung.
        </p>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
