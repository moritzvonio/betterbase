import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "Datenschutz",
  robots: { index: false, follow: true },
};

// TODO Mourice: finale Texte – Verantwortlichen (Anschrift/E-Mail) ergänzen und
// die Datenschutzerklärung vor dem Launch rechtlich prüfen lassen. Die Abschnitte
// unten beschreiben den tatsächlichen Datenfluss (Vercel, Session-Cookie,
// Kickbase-Login, Stripe) als Gerüst.
export default function DatenschutzPage() {
  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Datenschutzerklärung</h1>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 mb-8">
          Hinweis: Diese Datenschutzerklärung ist ein Gerüst und wird vor dem Launch
          vervollständigt und rechtlich geprüft.
        </div>

        <Section title="Verantwortlicher">
          <p>Mourice Engelmann</p>
          <p className="text-muted-foreground">[Anschrift und E-Mail folgen – siehe Impressum]</p>
        </Section>

        <Section title="Hosting & Reichweitenmessung">
          <p>
            Ligabase wird bei Vercel gehostet. Zur Reichweitenmessung nutzen wir Vercel
            Web Analytics – cookielos und ohne personenbezogene Profile. Es werden keine
            Werbe-Tracker eingesetzt, daher gibt es kein Cookie-Banner.
          </p>
        </Section>

        <Section title="Session-Cookie">
          <p>
            Nach dem Login setzen wir ein technisch notwendiges, verschlüsseltes
            httpOnly-Cookie (<span className="font-mono text-xs">bb_session</span>), damit
            du eingeloggt bleibst. Es dient ausschließlich der Anmeldung, nicht dem
            Tracking.
          </p>
        </Section>

        <Section title="Kickbase-Login">
          <p>
            Du meldest dich mit deinen bestehenden Kickbase-Zugangsdaten an. Dein Passwort
            wird nicht gespeichert, sondern nur einmalig gegen einen Kickbase-Token
            getauscht, der verschlüsselt im Session-Cookie liegt. Wir lesen ausschließlich
            Daten, die du auch selbst in der Kickbase-App siehst.
          </p>
        </Section>

        <Section title="Zahlungen">
          <p>
            Ligabase ist in der offenen Beta komplett kostenlos – es findet keine
            Zahlungsabwicklung statt. Sollte künftig ein bezahlter Pro-Zugang
            eingeführt werden, würden wir dafür den Zahlungsdienstleister Stripe
            nutzen; die zur Zahlungsabwicklung nötigen Daten würden direkt an Stripe
            übermittelt. Wir speichern keine Kreditkartendaten.
          </p>
        </Section>

        <Section title="Deine Rechte">
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der
            Verarbeitung deiner personenbezogenen Daten. Wende dich dazu an den oben
            genannten Verantwortlichen.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h2>
      <div className="text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
