import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/app-header";

// Beta-Infoseite. Der Stripe-Checkout-Flow (CheckoutButton, /api/stripe/*)
// bleibt schlafend erhalten und kommt zurück, wenn FREE_BETA (lib/entitlement)
// auf false gedreht wird.
export const metadata: Metadata = { title: "Offene Beta" };

export default function UpgradePage() {
  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />

      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            Offene Beta – alles kostenlos
          </h1>
          <p className="text-muted-foreground">
            Ligabase ist gerade in der offenen Beta. Alle Features sind für alle
            freigeschaltet – ohne Zahlung, ohne Abo.
          </p>
        </div>

        <Card className="border-primary/50 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] relative">
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
            Offene Beta
          </Badge>
          <CardHeader>
            <CardTitle>Beta-Zugang</CardTitle>
            <CardDescription className="flex items-baseline gap-2 pt-1">
              <span className="text-3xl font-bold text-foreground">0 €</span>
              <span className="text-xs">während der Beta</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm space-y-1.5">
              <Feature>Wettbewerb: Kontostände + Max-Gebote aller Manager</Feature>
              <Feature>Bid-Advisor: Bietverhalten deiner Konkurrenten</Feature>
              <Feature>Netto-Teamwert-Verlauf der ganzen Liga</Feature>
              <Feature>Top-50, News und Aufstellungs-Planer</Feature>
            </ul>

            <div className="rounded-md border border-primary/30 bg-primary/[0.06] px-4 py-3 text-sm text-center">
              Nichts freizuschalten – einfach einloggen und loslegen.
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Nach der Beta kann ein kleiner Preis für einzelne Pro-Flächen
              kommen – solange sie läuft, bleibt alles frei.
            </p>
          </CardContent>
        </Card>

        <p className="mt-10 text-xs text-muted-foreground text-center">
          Ligabase ist nicht offiziell mit Kickbase verbunden.{" "}
          <Link href="/leagues" className="underline hover:text-foreground">
            Zurück zu deinen Ligen
          </Link>
        </p>
      </main>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-primary">✓</span>
      <span>{children}</span>
    </li>
  );
}
