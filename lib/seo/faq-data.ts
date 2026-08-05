/**
 * FAQ-Inhalte – SEO/GEO-optimiert.
 *
 * Antworten sind "answer-first" (direkte Antwort im ersten Satz, ~40–70 Wörter),
 * damit AI-Suchmaschinen (ChatGPT, Perplexity, Google AI Overviews) sie zitieren.
 * Fakten sind mit offiziellen Kickbase-Quellen belegt (verifizierte URLs) – gut
 * für E-E-A-T & GEO. Eigene Formulierungen (kein Copy-Paste der Quellen).
 *
 * Bewusst NICHT behauptet (offiziell nicht veröffentlicht): exakte €/Punkt-Rate
 * der Punkteprämie, Höchstbetrag des Login-Bonus.
 */
export interface FaqEntry {
  q: string;
  /** Plain-Text-Antwort (wird auch 1:1 ins FAQPage-JSON-LD übernommen). */
  a: string;
  /** Optionale autoritative Quelle. */
  source?: { url: string; label: string };
}

export const FAQ_ITEMS: FaqEntry[] = [
  {
    q: "Wie funktioniert Kickbase?",
    a: "Kickbase ist ein Fantasy-Manager zur Fußball-Bundesliga: Du stellst aus echten Bundesliga-Spielern ein Team auf und sammelst Punkte aus deren realen Leistungen am Spieltag. Über einen Transfermarkt kaufst und verkaufst du Spieler, deren Marktwert sich täglich ändert. Ziel ist, mehr Punkte und Teamwert zu sammeln als die anderen Manager deiner Liga.",
    source: { url: "https://help.kickbase.com/help/was-ist-kickbase", label: "Kickbase Hilfe" },
  },
  {
    q: "Wie wird der Marktwert bei Kickbase berechnet?",
    a: "Der Marktwert spiegelt vor allem Angebot und Nachfrage in der Kickbase-Community wider: Wird ein Spieler häufig gekauft, steigt sein Wert; wird er oft verkauft oder gelistet, sinkt er. Zusätzlich fließen Form und Leistung sowie die erwartete Einsatzzeit (Verletzungen, Sperren, News) ein. Die Spieltagspunkte allein bestimmen den Marktwert nicht direkt.",
    source: { url: "https://help.kickbase.com/help/kickbase-marktwert", label: "Kickbase Hilfe: Marktwert" },
  },
  {
    q: "Um wie viel Uhr werden die Kickbase-Marktwerte aktualisiert?",
    a: "Im Saison-Modus werden die Marktwerte täglich gegen 22:00 Uhr aktualisiert. In Challenges und in der Arena läuft das Update wöchentlich, jeweils montags um 22:00 Uhr. Für deine Transfers zählt immer der Marktwert zum nächsten Update-Zeitpunkt.",
    source: { url: "https://help.kickbase.com/help/kickbase-marktwert", label: "Kickbase Hilfe: Marktwert" },
  },
  {
    q: "Warum sinkt ein Marktwert trotz guter Punkte?",
    a: "Weil nicht die Punkte, sondern Angebot und Nachfrage den Marktwert treiben. Verkaufen oder listen viele Manager einen Spieler – etwa aus Angst vor Rotation, einem schweren Gegner oder einem Formknick – fällt sein Wert, auch wenn er zuletzt stark gepunktet hat. Marktwert ist ein Stimmungsbarometer der Community.",
    source: { url: "https://help.kickbase.com/help/kickbase-marktwert", label: "Kickbase Hilfe: Marktwert" },
  },
  {
    q: "Warum bekomme ich einen Spieler nicht, obwohl mein Gebot über dem Marktwert lag?",
    a: "Bei Kickbase erhält nicht automatisch das höchste Gebot den Zuschlag, und Transfers werden erst zum Transfer-Zeitpunkt (Marktwert-Update um 22:00 Uhr) abgewickelt. Steigt der Marktwert bis dahin über dein Gebot, wird es ungültig. Biete deshalb mit etwas Puffer über dem aktuellen Wert.",
    source: { url: "https://help.kickbase.com/help/transfermarkt", label: "Kickbase Hilfe: Transfermarkt" },
  },
  {
    q: "Mit welchem Budget startet man bei Kickbase?",
    a: "Im klassischen Modus mit Start-Team bekommst du 15 zufällige Spieler im Wert von rund 100 Mio. € plus 50 Mio. € Cash als Transferbudget – zusammen also ein Netto-Teamwert von etwa 150 Mio. €. Im Modus ohne Start-Team startest du mit 200 Mio. € und baust dein Team komplett selbst auf.",
    source: { url: "https://help.kickbase.com/help/was-ist-kickbase", label: "Kickbase Hilfe" },
  },
  {
    q: "Wie viel Prämie gibt es für Spieltagspunkte?",
    a: "Für viele Punkte an einem Spieltag zahlt Kickbase Bonusprämien: ab 1.000 Punkten 250.000 €, ab 1.500 Punkten 500.000 € und ab 2.000 Punkten 1 Mio. €. Der Spieltagssieger erhält zusätzlich 1 Mio. €. Eine feste Prämie pro Einzelpunkt veröffentlicht Kickbase offiziell nicht.",
    source: { url: "https://help.kickbase.com/help/welche-erfolge-kann-ich-in-der-app-erhalten", label: "Kickbase Hilfe: Erfolge" },
  },
  {
    q: "Was bringt der tägliche Login-Bonus bei Kickbase?",
    a: "Für regelmäßiges Einloggen schreibt dir Kickbase einen täglichen Bonus gut. Er startet bei 1.000 € und steigt mit jedem Tag in Folge; lässt du einen Tag aus, beginnt er wieder bei 1.000 €. Den genauen Höchstbetrag gibt Kickbase bewusst nicht bekannt – Dranbleiben lohnt sich also.",
  },
  {
    q: "Wie werden die Kickbase-Punkte berechnet?",
    a: "Die Punkte basieren auf Live-Daten von Stats Perform (Opta): Pro Spiel werden über 95 Aktionen mit hunderten Detail-Kriterien bewertet und zusätzlich von Analysten geprüft. Tore, Vorlagen, Zweikämpfe, Defensivaktionen und Fehler fließen positionsabhängig ein. Korrekturen sind bis zum Abschluss des Spieltags möglich.",
    source: { url: "https://help.kickbase.com/help/wie-werden-die-punkte-berechnet", label: "Kickbase Hilfe: Punkte" },
  },
  {
    q: "Wann werden die Punkteprämien ausgezahlt?",
    a: "Spieltagspunkte-Prämien werden automatisch gutgeschrieben, sobald die finalen Punkte feststehen. Prämien für Erfolge können länger dauern – meist am Montagabend oder in der Nacht danach. Manche Erfolge setzen ein positives Kontoguthaben voraus.",
    source: { url: "https://help.kickbase.com/help/wann-werden-die-punktepramien-ausgeschuttet", label: "Kickbase Hilfe: Prämien" },
  },
  {
    q: "Bis wann muss ich meine Kickbase-Aufstellung setzen?",
    a: "Du stellst genau 11 Spieler auf und kannst Aufstellung und Formation frei ändern, bis der Spieltag beginnt. Änderungen nach 20:29 Uhr zählen erst für den nächsten Spieltag. Punkte gibt es nur für tatsächlich aufgestellte Spieler – Spieler auf der Bank bringen 0 Punkte.",
    source: { url: "https://help.kickbase.com/help/alles-rund-um-deine-aufstellung", label: "Kickbase Hilfe: Aufstellung" },
  },
  {
    q: "Wann sollte ich bei Kickbase Spieler verkaufen?",
    a: "Verkaufe tendenziell, bevor der Marktwert fällt – etwa vor einem schweren Gegner, bei drohender Rotation, nach einer Verletzung oder wenn ein starker Wertanstieg abzuflachen beginnt. Ligabase zeigt dir Marktwert-Prognosen und 14-Tage-Trends, damit du den richtigen Zeitpunkt triffst.",
  },
  {
    q: "Wie berechnet Ligabase die Kontostände der Mitspieler?",
    a: "Ligabase rechnet den Kontostand jedes Managers aus öffentlich sichtbaren Liga-Daten zurück: Startbudget, alle Käufe und Verkäufe seit Liga-Start, Punkteprämien, Spieltagssiege, täglicher Login-Bonus und Erfolge. Das Regelwerk ist empirisch am eigenen, exakt bekannten Kontostand geeicht – die angezeigte Abweichung zeigt dir live, wie genau die Schätzung für die anderen trifft.",
  },
  {
    q: "Was kostet Ligabase und ist es offiziell mit Kickbase verbunden?",
    a: "Ligabase ist ein unabhängiges Companion-Tool und nicht offiziell mit Kickbase, der DFL oder einem Bundesliga-Verein verbunden. Aktuell läuft die offene Beta: Alle Features – Dashboard, Top-50, News, Aufstellungs-Planer, die Kontostände und Max-Gebote aller Mitspieler sowie der Bid-Advisor – sind komplett kostenlos. Nach der Beta kann ein kleiner Preis für einzelne Pro-Flächen kommen. Dein Passwort wird nie gespeichert, sondern nur einmalig gegen einen Token getauscht.",
  },
  {
    q: "Was ist das beste kostenlose Kickbase-Tool?",
    a: "Ein starkes Kickbase-Tool liefert Marktwert-Prognosen, einen Transfer- und Gebots-Advisor, Live-Punkte und Statistiken zu allen Managern deiner Liga. Ligabase bündelt genau das – inklusive Top-50-Punkteliste, Teamwert-Vergleich seit Saisonstart und Bundesliga-News – kostenlos und direkt im Browser, ohne Installation.",
  },
  {
    q: "Kann mein Kickbase-Account durch ein Tool gesperrt werden?",
    a: "Bei Ligabase ist uns kein solcher Fall bekannt. Wir nutzen ausschließlich die offizielle Kickbase-App-API, respektieren deren Rate-Limits, lesen nur Daten, die du selbst auch in der App siehst, und führen keine Aktionen ohne deine ausdrückliche Bestätigung aus.",
  },
];
