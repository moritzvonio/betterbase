import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/ui/logo";
import { TeamCrest } from "@/components/ui/team-tag";
import { Sparkline } from "@/components/ui/sparkline";
import { FormDots } from "@/components/ui/form-dots";
import {
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  Lock,
  Zap,
  Trophy,
  Wallet,
  Activity,
  Crown,
  Star,
  CheckCircle2,
  Globe,
  MapPin,
  Newspaper,
  Swords,
} from "lucide-react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ_ITEMS, type FaqEntry } from "@/lib/seo/faq-data";
import {
  softwareApplicationSchema,
  organizationSchema,
  faqPageSchema,
} from "@/lib/seo/schema";
import { env } from "@/lib/env";

const BASE = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: { absolute: "Kickbase Tool – Kontostände, Max-Gebote & Marktwerte | Ligabase" },
  description:
    "Ligabase zeigt dir die geschätzten Kontostände und Max-Gebote aller Mitspieler deiner Kickbase-Liga – plus Bid-Advisor, Live-Punkte und Top-50. In der offenen Beta komplett kostenlos.",
  keywords: [
    "Kickbase Tool",
    "Kickbase Marktwerte",
    "Kickbase Marktwert Prognose",
    "Kickbase Trading",
    "Kickbase Tipps",
    "Kickbase Analyse Tool",
    "Kickbase Statistiken",
    "Kickbase Aufstellung",
    "Bundesliga Fantasy Manager Tool",
  ],
  alternates: { canonical: `${BASE}/` },
  openGraph: {
    title: "Kickbase Tool – Kontostände, Max-Gebote & Live-Punkte",
    description:
      "Sieh die geschätzten Kontostände und Max-Gebote aller Mitspieler deiner Kickbase-Liga. Plus Bid-Advisor, Live-Punkte und Top-50.",
    type: "website",
    locale: "de_DE",
    url: `${BASE}/`,
  },
};

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[
          softwareApplicationSchema(BASE),
          organizationSchema(BASE),
          faqPageSchema(),
        ]}
      />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <StatsStrip />
        <Features />
        <DashboardPreview />
        <Pricing />
        <Trust />
        <FAQ />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

/* ─── Header ───────────────────────────────────────────── */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 glass">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link href="/">
          <Logo size={32} />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#preview" className="hover:text-foreground transition">Preview</a>
          <a href="#pricing" className="hover:text-foreground transition">Beta</a>
          <a href="#faq" className="hover:text-foreground transition">FAQ</a>
          <Link href="/blog" className="hover:text-foreground transition">Blog</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login">
              Loslegen <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ─── Hero ─────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background blobs */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] size-[480px] bg-emerald-300/30 rounded-full blur-3xl blob" />
        <div className="absolute top-[20%] right-[-15%] size-[520px] bg-emerald-400/20 rounded-full blur-3xl blob blob-delay-1" />
        <div className="absolute top-[60%] left-[20%] size-[360px] bg-emerald-200/25 rounded-full blur-3xl blob blob-delay-2" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-20 pb-12 sm:pt-28 sm:pb-20">
        <div className="text-center">
          <Badge variant="default" className="mb-6 slide-up gap-1.5 py-1 px-3">
            <span className="size-1.5 rounded-full bg-primary pulse-dot" />
            Saison 26/27 – offene Beta, alles kostenlos
          </Badge>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-[0.95] slide-up slide-up-1">
            Sieh, was deine Liga{" "}
            <span className="gradient-text">wirklich bieten kann</span>.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed slide-up slide-up-2">
            Kontostände und Max-Gebote aller Mitspieler, zurückgerechnet aus den
            öffentlichen Liga-Daten – mathematisch am eigenen Konto validiert.
            Login mit deinem Kickbase-Account, dein Passwort wird{" "}
            <span className="text-foreground font-medium">nicht gespeichert</span>.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 slide-up slide-up-3">
            <Button asChild size="lg" className="w-full sm:w-auto card-glow">
              <Link href="/login">
                <Zap className="size-4" /> Jetzt mit Kickbase einloggen
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href="#preview">Preview ansehen</a>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground slide-up slide-up-4">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5 text-primary" /> Kein Passwort-Storage
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-primary" /> DSGVO-konform
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5 text-primary" /> Hosting in DE
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary" /> Kostenlos in der Beta
            </span>
          </div>
        </div>

        {/* Floating preview card */}
        <div className="mt-16 max-w-4xl mx-auto slide-up slide-up-4">
          <HeroPreviewCard />
        </div>
      </div>
    </section>
  );
}

function HeroPreviewCard() {
  return (
    <div className="relative">
      <div
        className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-emerald-200/50 to-emerald-100/0 blur-2xl"
        aria-hidden
      />
      <div className="rounded-2xl border border-border bg-card shadow-[0_24px_64px_-24px_rgba(15,23,42,0.18)] overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/40">
          <span className="size-2.5 rounded-full bg-rose-400/60" />
          <span className="size-2.5 rounded-full bg-amber-400/60" />
          <span className="size-2.5 rounded-full bg-emerald-400/60" />
          <span className="ml-3 text-[11px] font-mono text-muted-foreground">
            ligabase.de/league/haramlig
          </span>
        </div>
        {/* Preview content */}
        <div className="p-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4 col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-1.5">
                <Trophy className="size-4 text-primary" /> Liga-Tabelle
              </div>
              <Badge variant="muted" className="text-[10px]">Spieltag 17</Badge>
            </div>
            <div className="space-y-2">
              {[
                { rank: 1, name: "Jonas", pts: 12_847, you: false, badge: "🥇" },
                { rank: 2, name: "Du", pts: 12_419, you: true, badge: "🥈" },
                { rank: 3, name: "Lena", pts: 11_998, you: false, badge: "🥉" },
                { rank: 4, name: "Max", pts: 11_502, you: false },
              ].map((r) => (
                <div
                  key={r.rank}
                  className={
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm " +
                    (r.you ? "bg-primary/[0.07] ring-1 ring-primary/20" : "")
                  }
                >
                  <span className="text-xs font-mono text-muted-foreground w-6">
                    {r.badge ?? `#${r.rank}`}
                  </span>
                  <span className={"flex-1 truncate " + (r.you ? "font-semibold" : "")}>
                    {r.name}
                  </span>
                  <span className="font-mono tabular text-sm">
                    {r.pts.toLocaleString("de-DE")}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <MiniKpi
              icon={<Crown className="size-3.5" />}
              label="Platz"
              value="#2"
              sub="von 12"
            />
            <MiniKpi
              icon={<TrendingUp className="size-3.5" />}
              label="Letzter Spieltag"
              value="+892"
              accent="success"
            />
            <MiniKpi
              icon={<Wallet className="size-3.5" />}
              label="Budget"
              value="4,2 Mio €"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "success";
}) {
  return (
    <div className="rounded-xl border border-border p-3 bg-card">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
        {icon}
        {label}
      </div>
      <div className={"text-lg font-bold tabular " + (accent === "success" ? "text-emerald-600" : "")}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ─── Stats strip ──────────────────────────────────────── */
function StatsStrip() {
  const stats: Array<{ value?: string; icon?: React.ReactNode; label: string }> = [
    { value: "432", label: "Bundesliga-Spieler im Blick" },
    { value: "18", label: "Vereins-Quellen + Kicker & Sportschau" },
    { value: "0 €", label: "alles kostenlos in der Beta" },
    { icon: <MapPin className="size-5 text-primary" />, label: "Hosting in Deutschland" },
  ];
  return (
    <section className="border-y border-border/50 bg-gradient-to-r from-primary/[0.04] via-transparent to-primary/[0.04]">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-y-4 gap-x-8 text-center">
          {stats.map((s) => (
            <div key={s.label} className="flex-1 min-w-[130px]">
              <div className="text-2xl font-bold tabular flex items-center justify-center h-8">
                {s.value ?? s.icon}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─────────────────────────────────────────── */
function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Was du kriegst"
          title="Drei Hebel, die Kickbase nicht hat"
          description="Genau das, was in der Kickbase-App fehlt – und was kein anderes Tool so zeigt."
        />
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <FeatureCard
            icon={<Swords className="size-5" />}
            title="Cash-Röntgenblick"
            desc="Kontostände, Max-Gebote und Netto-Teamwert aller Mitspieler – zurückgerechnet aus öffentlichen Liga-Daten und am eigenen Konto validiert. Das kann kein anderes Tool."
            visual={<CashVisual />}
          />
          <FeatureCard
            icon={<TrendingUp className="size-5" />}
            title="Bid-Advisor & Trading"
            desc="Sieh das Bietverhalten deiner Konkurrenten, wie hoch du realistisch bieten musst, plus Squad-Steiger und Auto-Targets aus dem Transfermarkt."
            visual={<BidVisual />}
          />
          <FeatureCard
            icon={<Newspaper className="size-5" />}
            title="News & Top-50"
            desc="Bundesliga-News aus 18 Vereins-Quellen plus Kicker und Sportschau, automatisch deinen Spielern zugeordnet. Dazu die Top-50-Punkteliste der Liga."
            visual={<NewsVisual />}
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  visual,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  visual: React.ReactNode;
}) {
  return (
    <Card className="card-hover group overflow-hidden flex flex-col">
      <CardHeader>
        <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2 ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">{desc}</p>
        <div className="rounded-lg bg-muted/50 ring-1 ring-border p-3 mt-auto">{visual}</div>
      </CardContent>
    </Card>
  );
}

function CashVisual() {
  return (
    <div className="space-y-1.5">
      {[
        { name: "Jonas", cash: "31,4 Mio", bid: "48,9 Mio", you: false },
        { name: "Du", cash: "12,8 Mio", bid: "37,2 Mio", you: true },
        { name: "Lena", cash: "6,1 Mio", bid: "29,5 Mio", you: false },
      ].map((row, i) => (
        <div
          key={i}
          className={
            "flex items-center justify-between text-[11px] px-1.5 py-1 rounded " +
            (row.you ? "bg-primary/[0.07] ring-1 ring-primary/20" : "")
          }
        >
          <span className="font-medium truncate flex items-center">
            <span className="inline-flex size-4 rounded-full bg-primary/15 text-primary text-[8px] items-center justify-center font-bold mr-1.5">
              {row.name[0]}
            </span>
            {row.name}
          </span>
          <span className="flex items-center gap-2 font-mono tabular">
            <span className="text-foreground">{row.cash}</span>
            <span className="text-muted-foreground">max {row.bid}</span>
          </span>
        </div>
      ))}
      <div className="text-[9px] text-muted-foreground pt-0.5">
        Kontostand · Max-Gebot (geschätzt)
      </div>
    </div>
  );
}

function BidVisual() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="size-6 rounded bg-emerald-500/15 text-emerald-600 inline-flex items-center justify-center">
          <ArrowRight className="size-3" />
        </span>
        <span className="flex-1">
          <span className="font-semibold">Jonas</span>{" "}
          <span className="text-muted-foreground">bietet meist +12 % über Marktwert</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="size-6 rounded bg-emerald-500/15 text-emerald-600 inline-flex items-center justify-center">
          <ArrowRight className="size-3" />
        </span>
        <span className="flex-1">
          <span className="font-semibold">Auto-Target</span>{" "}
          <span className="text-muted-foreground">3 Spieler mit steigendem Marktwert</span>
        </span>
      </div>
      <div className="pt-1.5 mt-1.5 border-t border-border/60">
        <Sparkline
          values={[10, 12, 11, 14, 13, 16, 18, 17, 20, 22]}
          width={240}
          height={28}
          color="#10b981"
          className="w-full"
        />
      </div>
    </div>
  );
}

function NewsVisual() {
  return (
    <div className="space-y-1.5">
      {[
        { icon: <Newspaper className="size-3" />, text: "Verletzung: Ausfall bis Winter", time: "12 Min" },
        { icon: <Activity className="size-3" />, text: "Startelf bestätigt", time: "1 Std" },
        { icon: <Trophy className="size-3" />, text: "Top-50: 3 aus deiner Liga", time: "heute" },
      ].map((row, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-card ring-1 ring-border">
          <span className="size-5 rounded bg-primary/15 text-primary inline-flex items-center justify-center">
            {row.icon}
          </span>
          <span className="flex-1 truncate font-medium">{row.text}</span>
          <span className="text-muted-foreground">{row.time}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Dashboard preview section ────────────────────────── */
function DashboardPreview() {
  return (
    <section id="preview" className="py-20 sm:py-28 bg-gradient-to-b from-transparent via-emerald-50/40 to-transparent">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Live-Preview"
          title="So sieht dein Liga-Dashboard aus"
          description="Echte Daten, echte Player-Cards, echte Spieltag-Form. Alles in einer Übersicht."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <PlayerCardPreview
            name="Granit Xhaka"
            tid="7"
            pos={3}
            mv="18,4 Mio"
            mvDelta="+312k"
            trendValues={[8.2, 8.5, 8.4, 8.7, 9.1, 9.0, 9.3, 9.6, 10.1, 10.5]}
            form={[122, 88, 154, 0, 96]}
          />
          <PlayerCardPreview
            name="Serhou Guirassy"
            tid="3"
            pos={4}
            mv="42,9 Mio"
            mvDelta="-890k"
            trendValues={[10.8, 10.6, 10.4, 10.2, 10.0, 9.7, 9.5, 9.3, 9.0]}
            form={[210, 184, 0, 142, 168]}
            negative
          />
        </div>
      </div>
    </section>
  );
}

function PlayerCardPreview({
  name,
  tid,
  pos,
  mv,
  mvDelta,
  trendValues,
  form,
  negative,
}: {
  name: string;
  tid: string;
  pos: number;
  mv: string;
  mvDelta: string;
  trendValues: number[];
  form: number[];
  negative?: boolean;
}) {
  const POS_LABEL = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" }[pos] ?? "?";
  return (
    <Card className="card-hover overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <TeamCrest tid={tid} size={48} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base truncate">{name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="chip">{POS_LABEL}</span>
              <span>72 Pkt Ø</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold tabular">{mv}</div>
            <div className={"text-xs font-mono tabular " + (negative ? "text-rose-600" : "text-emerald-600")}>
              {mvDelta}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Form letzte 5</div>
            <FormDots points={form} />
          </div>
          <Sparkline
            values={trendValues}
            width={120}
            height={36}
            color={negative ? "#f43f5e" : "#10b981"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Beta (ex Pricing – Preismodell kommt nach der Beta zurück) ── */
function Pricing() {
  return (
    <section id="pricing" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="Beta"
          title="Offene Beta – alles kostenlos"
          description="Ligabase ist in der offenen Beta. Alle Features sind freigeschaltet – kein Abo, keine Zahlung, kein Haken."
        />
        <div className="mt-14 max-w-md mx-auto">
          <PricingCard
            name="Beta"
            price="0 €"
            period="während der Beta"
            tagline="Einloggen mit Kickbase – mehr braucht es nicht."
            features={[
              { ok: true, text: "Liga-Dashboard & Tabelle" },
              { ok: true, text: "Wettbewerb: Kontostände + Max-Gebote aller Manager" },
              { ok: true, text: "Bid-Advisor" },
              { ok: true, text: "Netto-Teamwert-Verlauf der Liga" },
              { ok: true, text: "Top-50, News mit Spieler-Tagging, Aufstellungs-Planer" },
            ]}
            cta={
              <Button asChild className="w-full card-glow">
                <Link href="/login">Kostenlos loslegen</Link>
              </Button>
            }
            featured
          />
        </div>

        <p className="mt-10 max-w-2xl mx-auto text-center text-sm text-muted-foreground">
          Nach der Beta kann ein kleiner Preis für einzelne Pro-Flächen kommen –
          solange die Beta läuft, ist alles frei.
        </p>
      </div>
    </section>
  );
}

function PricingCard({
  name,
  price,
  period,
  tagline,
  features,
  cta,
  highlight,
  featured,
}: {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: { ok: boolean; text: string }[];
  cta: React.ReactNode;
  highlight?: string;
  featured?: boolean;
}) {
  return (
    <Card
      className={
        "relative overflow-hidden " +
        (featured
          ? "card-glow border-primary/40"
          : "card-hover")
      }
    >
      {featured && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-700" />
      )}
      {highlight && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow-md">{highlight}</Badge>
      )}
      <CardHeader>
        <CardTitle className="text-lg">{name}</CardTitle>
        <CardDescription className="pt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-foreground tracking-tight tabular">{price}</span>
            <span className="text-xs">{period}</span>
          </div>
          <p className="mt-2 text-xs">{tagline}</p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {features.map((f) => (
            <li key={f.text} className={"flex items-start gap-2 " + (f.ok ? "" : "text-muted-foreground/60")}>
              <CheckCircle2
                className={"size-4 shrink-0 mt-0.5 " + (f.ok ? "text-primary" : "text-muted-foreground/40")}
              />
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
        {cta}
      </CardContent>
    </Card>
  );
}

/* ─── Trust ───────────────────────────────────────────── */
function Trust() {
  return (
    <section className="py-16 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-6 md:grid-cols-3">
          <TrustItem icon={<Lock className="size-5" />} title="Passwort wird nicht gespeichert">
            Wir tauschen dein Passwort sofort gegen einen Kickbase-Token. Der Token landet
            verschlüsselt in einem httpOnly-Cookie – niemals in unserer Datenbank.
          </TrustItem>
          <TrustItem icon={<ShieldCheck className="size-5" />} title="Nicht offiziell">
            Ligabase ist nicht mit Kickbase, der DFL oder einem Bundesliga-Verein verbunden.
            Die Nutzung erfolgt auf eigene Verantwortung.
          </TrustItem>
          <TrustItem icon={<Sparkles className="size-5" />} title="DSGVO-konform">
            Hosting in der EU, keine Werbe-Tracker, kein Cookie-Banner-Spam. Reichweitenmessung
            cookielos über Vercel Analytics.
          </TrustItem>
        </div>
      </div>
    </section>
  );
}

function TrustItem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/20">
        {icon}
      </span>
      <div>
        <div className="font-semibold mb-1">{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

/* ─── FAQ ─────────────────────────────────────────────── */
function FAQ() {
  return (
    <section id="faq" className="py-20 sm:py-28 border-t border-border/60 bg-gradient-to-b from-transparent to-emerald-50/30">
      <div className="mx-auto max-w-3xl px-4">
        <SectionHeading
          eyebrow="FAQ"
          title="Kickbase FAQ: Marktwert, Punkte & Trading"
          description="Die wichtigsten Fragen zu Kickbase und Ligabase – kurz beantwortet, mit offiziellen Quellen."
        />
        <div className="mt-12 space-y-4">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ q, a, source }: FaqEntry) {
  return (
    <details className="group rounded-xl border border-border bg-card p-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex items-center justify-between cursor-pointer list-none font-semibold">
        {q}
        <span className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 ml-3 group-open:rotate-45 transition-transform text-base">
          +
        </span>
      </summary>
      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
        <p>{a}</p>
        {source && (
          <p className="mt-2 text-xs">
            Quelle:{" "}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {source.label}
            </a>
          </p>
        )}
      </div>
    </details>
  );
}

/* ─── Final CTA ───────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4">
        <div className="relative rounded-3xl overflow-hidden p-10 sm:p-16 text-center">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700" />
          <div className="absolute inset-0 -z-10 opacity-25" aria-hidden>
            <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
              <circle cx="100" cy="50" r="22" fill="none" stroke="white" strokeWidth="0.5" />
              <line x1="100" y1="0" x2="100" y2="100" stroke="white" strokeWidth="0.5" />
              <rect x="0" y="20" width="20" height="60" fill="none" stroke="white" strokeWidth="0.5" />
              <rect x="180" y="20" width="20" height="60" fill="none" stroke="white" strokeWidth="0.5" />
            </svg>
          </div>
          <Badge variant="secondary" className="mb-5 backdrop-blur bg-white/20 text-white border-white/30">
            <Sparkles className="size-3 mr-1.5" /> Beta läuft
          </Badge>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
            Bereit für die smartere Saison?
          </h2>
          <p className="text-emerald-50/90 text-lg max-w-xl mx-auto mb-8">
            In 90 Sekunden eingeloggt. Kein neues Konto. Kein Risiko.
          </p>
          <Button asChild size="lg" variant="secondary" className="bg-white text-emerald-700 hover:bg-emerald-50">
            <Link href="/login">
              <Zap className="size-4" /> Mit Kickbase einloggen
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────── */
function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <Logo size={28} />
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed max-w-[220px]">
              Der Companion für deine Kickbase-Liga: Kontostände, Max-Gebote und
              mehr. Nicht offiziell mit Kickbase verbunden.
            </p>
          </div>
          <FooterCol title="Produkt">
            <Link href="/login">Login</Link>
            <a href="#features">Features</a>
            <a href="#pricing">Beta</a>
            <a href="#faq">FAQ</a>
            <Link href="/blog">Blog & Tipps</Link>
          </FooterCol>
          <FooterCol title="Rechtliches">
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
          </FooterCol>
          <FooterCol title="Status">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
              Alle Systeme OK
            </span>
            <span className="text-muted-foreground">Saison 26/27</span>
          </FooterCol>
        </div>
        <div className="mt-8 pt-6 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between">
          <span>© 2026 Ligabase</span>
          <span>Made in Hannover</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold mb-3">{title}</div>
      <div className="flex flex-col gap-2 text-muted-foreground [&>*:hover]:text-foreground [&>*]:transition-colors">
        {children}
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────── */
function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <div className="chip mx-auto mb-4">
        <Star className="size-3" />
        {eyebrow}
      </div>
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
      {description && (
        <p className="mt-3 text-muted-foreground text-base sm:text-lg">{description}</p>
      )}
    </div>
  );
}
