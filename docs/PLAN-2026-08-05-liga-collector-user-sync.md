# Plan: Liga-Collector + User-State-Sync (2026-08-05)

> Umsetzung: frische Session, `/maestro docs/PLAN-2026-08-05-liga-collector-user-sync.md`.
> Dieser Plan ist selbsttragend – kein Chat-Kontext nötig.

## 0. Projekt-Steckbrief + Regeln (für den Kalt-Start)

- **Repo:** `/Users/chiefmourice/betterbase` – Ligabase (ligabase.de), Kickbase-Companion.
  Package-Name intern `kickbasemvp`. Next.js 16 App Router (Turbopack), TypeScript strict,
  Tailwind 4, Vercel, **Vercel KV** (einzige Persistenz – KEINE Datenbank), Session =
  JWE-verschlüsselter Cookie `bb_session` mit Kickbase-Bearer-Token.
- **Git:** Solo-Repo, Commits DIREKT auf `main` (kein PR-Flow). **NIE `git add -A`** –
  immer scoped mit expliziten Pfaden (Mourice arbeitet parallel im selben Working Tree).
- **Dev-Server:** `pnpm dev` auf Port 3000. Läuft dort schon einer, ist das Mourices
  eigener – NICHT killen, für Verifikation den laufenden nutzen (HMR) oder `next start`
  auf anderem Port.
- **Tests/Build:** `pnpm vitest run` (muss grün bleiben), `pnpm build` IMMER voll
  durchlaufen lassen („Compiled successfully" kommt VOR dem Type-Check; erst die
  Routen-Tabelle am Ende beweist Erfolg). Exit-Code werten.
- **Deploy:** NUR nach Mourices ausdrücklichem OK (`vercel --prod` aus dem Repo-Root).
  Bis dahin lebt alles auf `main`.
- **Sprache/Typografie:** Kundensichtbare deutsche Strings mit ECHTEN Umlauten,
  NIRGENDS Em-Dash (—; U+2013 „–" ist ok). Nutzer werden geduzt (bestehende Konvention).
- **Offene Beta:** `FREE_BETA = true` in `lib/entitlement.ts` – alle Gates offen, es gibt
  KEIN Pricing. Nichts bauen, das Bezahl-Flächen reaktiviert.
- **Privacy-Versprechen (hart):** Kickbase-Tokens landen NUR im Cookie, NIEMALS in KV
  oder sonstwo serverseitig. Der Collector speichert ausschließlich abgeleitete Zahlen.
- **Lokales Dev ohne KV:** `KV_REST_API_URL`/`KV_REST_API_TOKEN` fehlen lokal oft.
  Muster im Repo: `const KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);`
  + best-effort try/catch. Wo Route schreibt + Seite liest, `globalThis`-In-Memory-Fallback
  nutzen (Vorbild `lib/snapshot-store.ts:33-36`), sonst degradiert lesen (null = nicht da).
- **Test-Liga:** `6871934` („Liga 089", 10 Manager, Mourice = „Chief Mourice", userId
  `1270088`). `.env.local` enthält `KICKBASE_EMAIL`/`KICKBASE_PASSWORD` für Test-Scripts
  (Muster: `scripts/cash-snapshot.ts:18-31` – manuelles .env-Parsing, kb-Import DANACH
  via `await import`; `--env-file` klappt NICHT für `@/`-Aliase).
- **Saison-Kontext:** Heute ist Off-Season. Bundesliga-Saisonstart 28.08.2026
  (`SEASON_2627.start` in `lib/season.ts:9-19`). `ranking?dayNumber` liefert NACH
  Saisonende nur Nullen – rückwirkende Spieltagsdaten gibt es nur WÄHREND der Saison.
  Off-Season-Daten dürfen gesammelte Daten NIE überschreiben.

## 1. Ziel + Warum

Die Konkurrenten-Cash-Schätzung (Kern-Feature) soll in der neuen Saison 26/27 in den
ersten ~10 Spieltagen nahezu exakt sein und danach ehrlich ausgewiesene Varianz haben.
Dafür sammelt die App beim Seitenbesuch die Daten ein, die Kickbase später wegwirft
(Spieltags-Rankings, Startbudget-Messung, Cash-Anker), und das Modell nutzt beobachtete
Daten statt Raten, wo vorhanden. Zweitens: Aufstellungs-Planer und Watchlist hängen
heute am Gerät (localStorage/Cookie) – sie wandern an die Kickbase-User-ID in KV, damit
jedes Gerät nach Login denselben Stand zeigt.

## 2. Nicht-Ziele

- KEIN Cron, KEIN Hintergrund-Job, KEIN serverseitiges Token-Storage. Collection läuft
  ausschließlich im Request-Pfad eines eingeloggten Liga-Mitglieds.
- KEINE Datenbank/Supabase-Einführung – alles Vercel KV.
- KEIN Push-SENDER. Es existiert heute kein Code-Pfad, der Pushes verschickt (`web-push`
  ist nicht mal installiert) – das bleibt so; nur das Subscription-Storage wird umgebaut.
- KEINE Änderung an Paywall/Beta/Stripe-Code.
- KEINE Lineup-Historie / Einzelspieler-Achievement-Exaktrechnung (bleibt Rate, s. Annahme 9).
- KEINE Rück-Korrektur alter Multi-Season-Ligen – die bekommen nur den Ehrlichkeits-Banner.
- Der Aufstellungs-Planer überträgt weiterhin NICHTS zu Kickbase (nur Ligabase-intern).

## 3. Getroffene Annahmen

1. **Tagesbonus-Default „voll eingesammelt"** (Mourice-Entscheidung 05.08.): Die bisherige
   Aktivitäts-Heuristik (letzter Transfer + 7 Tage) entfällt ersatzlos; jeder Manager
   bekommt die volle Streak seit Liga-Start. Kippt Unterschätzung in leichte Überschätzung.
2. **Startbudget-Messung nur bei junger Liga** (Alter ≤ 3 Tage beim ersten Besuch):
   eigener Cash minus bekannte Boni, gerundet auf 500.000 €. Ältere Ligen: 50M-Annahme
   mit sichtbarem Label. Grund: nur früh sind alle Korrekturterme nahezu exakt.
3. **Spieltags-Tiers exakt nur bei Voll-Coverage** (alle gespielten Spieltage gesammelt),
   sonst weiterhin Rate + Coverage-Anzeige. Grund: Teil-Coverage-Hybride sind schwer
   erklärbar; Backfill stellt Voll-Coverage in der Praxis ohnehin her.
4. **Multi-Season-Erkennung:** `leagueStartMs < Date.parse("2026-06-01")` → Liga stammt
   aus einer früheren Saison → Warnbanner. Einfach, robust, keine API-Zusatzcalls.
5. **Sync-Konfliktregel:** Beim ersten Login nach dem Umbau wird lokaler Bestand
   hochgeladen, wenn serverseitig nichts liegt (Migration). Danach gilt Server-Stand
   beim Laden, Last-Write-Wins beim Speichern. Watchlist migriert als Union
   (Cookie ∪ KV, Cap 50).
6. **Push:** nur Storage-Umbau auf Mehrgeräte-Liste unter der User-ID (Cap 5 Geräte,
   Dedup per Endpoint). Kein Sender (Nicht-Ziel).
7. **Ligen ohne Besuche sammeln nichts** – akzeptiert; für die rechnet auch niemand
   Schätzungen an. Backfill heilt Lücken beim nächsten Besuch (solange Saison läuft).
8. **UI-Flags bleiben lokal:** `lb-seen-wettbewerb`, `lb-install-dismissed` (reine
   Geräte-UX, kein Sync-Wert).
9. **Einzelspieler-Achievements bleiben Rate** (`playerAchPayoutPerPoint`): exakt bräuchte
   Lineup-Historie je Manager je Spieltag – unverhältnismäßig, und in den ersten Wochen
   ist der Betrag winzig.
10. **KV-Key-Präfix `collect:` bzw. `user:`** – neue Namespaces, kollisionsfrei mit
    bestehenden (`stats:`, `snapshot:`, `mv:hist:`, `networth:`, `trial:`, `referral:`).

## 4. Slices

### Slice 1: Collection-Layer + Write-through im Wettbewerb (L)

- **Warum:** Fundament – ohne gesammelte Daten keine Exaktrechnung; muss vor dem 28.08.
  live sein, damit ab Spieltag 1 gesammelt wird.
- **Ist:**
  - `lib/competition-data.ts:46-150` – `assembleCompetitionStats(token, leagueId, userId)`
    zieht parallel `kb.ranking` (ohne dayNumber), `kb.leagueOverviewWithManagers`,
    `kb.userAchievementsTotal`, `kb.myBudget` (Z. 53-58), dann je Mitglied
    `managerSquad`/`managerTransferAll`/`managerDashboard` (Z. 72-81). Kalibrierung
    Z. 92-127. Rückgabe Z. 140-150 inkl. `initialBudget` (aus `detectInitialBudget()`,
    Z. 64) und `residualRate`.
  - `lib/kickbase/api.ts:72-77` – `kb.ranking(token, leagueId, dayNumber?)` existiert
    bereits (Query-Param `dayNumber`).
  - KV-Muster: `lib/snapshot-store.ts:28-62` (Availability-Check, globalThis-Fallback,
    `kv.set(key, data, { ex })`), `lib/admin/analytics.ts:29-93` (User-Key-Schema).
  - `scripts/cash-snapshot.ts:92-99` – zeigt den funktionierenden dayNumber-Loop
    (`for day = 1..totalDays`, `totalDays` aus `rankingRec.nd ?? 34`).
- **Soll:** Beim Besuch der Wettbewerb-Seite (und jeder anderen Fläche, die
  `assembleCompetitionStats` ruft) wird nebenbei gesammelt und in KV abgelegt:
  Spieltags-Rankings (Backfill fehlender Tage), Startbudget-Messung (junge Liga),
  Cash-Anker des Besuchers, Max-Teamwert je Manager.
- **Bauschritte:**
  1. NEU `lib/collect/league-store.ts` mit KV-Availability-Check nach Repo-Muster und
     diesen Keys/Shapes (Typen exportieren):
     - `collect:league:{leagueId}:meta` →
       `{ leagueStartMs: number; startBudget?: { value: number; source: "measured" | "default"; measuredAt: number }; maxTv: Record<string, number>; lastBackfillAt?: number }`
     - `collect:league:{leagueId}:days` →
       `Record<number, { perManager: Record<string, { mdp: number; mdpl: number }>; collectedAt: number }>`
       (Spieltag → Manager-ID → Spieltagspunkte/Platzierung; max 34 Einträge, ein Key pro Liga)
     - `collect:league:{leagueId}:anchors` →
       `Record<string, Record<string, number>>` (userId → ISO-Datum (YYYY-MM-DD) → echter Cash;
       pro User auf die letzten 90 Einträge kappen)
     - Funktionen (Signaturen): `loadLeagueCollect(leagueId): Promise<{ meta, days } | null>`,
       `saveLeagueMeta(leagueId, meta): Promise<void>`,
       `saveLeagueDays(leagueId, days): Promise<void>`,
       `recordCashAnchor(leagueId, userId, cash): Promise<void>`.
       Alle Writes best-effort (try/catch, nie werfen). Kein TTL (Daten sind das Archiv).
       `globalThis`-In-Memory-Fallback wie `lib/snapshot-store.ts:33-36`, damit lokales
       Dev ohne KV funktioniert.
  2. NEU `lib/collect/collector.ts` mit
     `collectOnVisit(opts: { token: string; leagueId: string; userId: string; ranking: KbRankingResponse; overview: unknown; meRealCash?: number; ownComponents?: { transferNet: number; pointsPremium: number; winBonus: number; achievementsTotal: number; daysSinceStart: number } }): Promise<void>` –
     wird aus `assembleCompetitionStats` NACH dem Datenzug aufgerufen (await, aber
     komplett best-effort; ein Fehler darf die Seite nie brechen):
     - **Meta/MaxTv:** je Manager `maxTv[managerId] = max(bisher, aktueller Teamwert)`.
     - **Startbudget-Messung:** wenn `meta.startBudget` fehlt UND
       `now - leagueStartMs <= 3 Tage` UND `meRealCash` vorhanden:
       `value = round500k(meRealCash - transferNet - pointsPremium - winBonus - achievementsTotal - estimateDailyBonus(daysSinceStart))`,
       `source: "measured"`. Sonst wenn `meta.startBudget` fehlt und Liga älter:
       `{ value: INITIAL_BUDGET, source: "default" }` (einmalig schreiben).
     - **Backfill:** `currentDay` aus dem Season-Ranking (`rankingRec.day`); wenn
       Spieltage `1..currentDay` im Store fehlen UND `meta.lastBackfillAt` älter als
       1 Stunde: bis zu 5 fehlende Tage sequenziell via
       `kb.ranking(token, leagueId, day)` ziehen. **Guard:** einen Tag NUR speichern,
       wenn `Σ mdp > 0` über alle Manager (genullte Off-Season-/Fehler-Antworten
       niemals speichern und niemals vorhandene Tage überschreiben).
       `meta.lastBackfillAt = now` nach jedem Versuch.
     - **Cash-Anker:** `recordCashAnchor(leagueId, userId, meRealCash)` (nur wenn vorhanden),
       1 Eintrag pro Tag (gleicher Tag wird überschrieben).
  3. `lib/competition-data.ts`: `collectOnVisit(...)` nach Phase 2 einbauen (die
     `ownComponents` fallen bei der bestehenden Eigen-Berechnung ohnehin an bzw. sind
     aus `meData` ableitbar); zusätzlich `loadLeagueCollect(leagueId)` VOR der
     Berechnung laden und (Slice 2) ans Modell durchreichen. `CompetitionData` um
     `collect: { daysCovered: number; daysPlayed: number; startBudgetSource: "measured" | "default" } | null`
     erweitern (für die UI in Slice 3).
- **Edge-Cases:** KV nicht konfiguriert (alles no-op, Seite unverändert); Kickbase-401
  während Backfill (still abbrechen, `withKbAuth` NICHT für die Zusatz-Calls nutzen –
  kein Redirect aus einem best-effort-Pfad); zwei Mitglieder besuchen gleichzeitig
  (letzter Write gewinnt, Datenverlust unkritisch da idempotent nachholbar);
  Liga mit `currentDay = 0` (nichts zu backfillen).
- **Akzeptanzkriterien:**
  - [ ] Besuch der Wettbewerb-Seite erzeugt bei konfiguriertem KV die drei Keys
    (per Test-Script gegen die Test-Liga nachweisbar).
  - [ ] Genullte Ranking-Antworten (Off-Season, wie JETZT testbar) erzeugen KEINE
    `days`-Einträge.
  - [ ] Seite rendert unverändert schnell und fehlerfrei, wenn KV fehlt oder alle
    Collect-Calls fehlschlagen (lokal ohne KV verifizieren).
  - [ ] Kein Token und keine E-Mail landet in irgendeinem KV-Value (Code-Review des
    Slices + grep über die neuen Module).
- **Verify:** `pnpm vitest run` (neue Unit-Tests für `round500k`, Backfill-Guard
  „Σ mdp > 0", Anker-Kappung); lokal `pnpm dev` → eingeloggt
  `/league/6871934/wettbewerb` öffnen → Konsole/KV prüfen (lokal: In-Memory-Fallback
  per Debug-Log). Off-Season-Realität beachten: `days` MUSS heute leer bleiben –
  genau das ist der Test des Null-Guards.

### Slice 2: Modell nutzt beobachtete Daten + Streak „voll" (M)

- **Warum:** Der eigentliche Genauigkeits-Gewinn: beobachtete Spieltagsdaten schlagen
  Raten; Tagesbonus-Annahme wird auf Mourices Vorgabe umgestellt.
- **Ist:**
  - `lib/competitor.ts:277-281` – Tagesbonus mit Aktivitäts-Heuristik
    (`lastTxMs + 7 Tage`, Auslauf-Deckel).
  - `lib/competitor.ts:288-313` – Achievement-Schätzung: `tiers: cal.tierPayoutPerPoint * tp`
    (Rate ≈ 280 €/Pkt aus `DEFAULT_CALIBRATION`, `lib/competitor.ts:51-57`).
  - `lib/kickbase/bonus-catalog.ts:81` – `teamPointsTierPayout(mdp: number): number`
    existiert bereits (exakte Tier-Auszahlung für einen Spieltagswert).
  - `lib/competitor.ts:212-241` – `ComputeManagerInput` (wird erweitert).
  - Zwei-Pass-Kalibrierung: `lib/competition-data.ts:118-127`.
- **Soll:** Für Manager mit Voll-Coverage der gesammelten Spieltage wird der Tier-Anteil
  exakt gerechnet; der Tagesbonus unterstellt für ALLE die volle Streak seit Liga-Start;
  das gemessene Startbudget ersetzt die 50M-Annahme.
- **Bauschritte:**
  1. `lib/competitor.ts`: `ComputeManagerInput` erweitern um
     `observedMatchdayPoints?: number[]` (die gesammelten mdp-Werte dieses Managers,
     nur übergeben, wenn Coverage vollständig ist). In der Achievement-Berechnung:
     wenn vorhanden → `tiers = Σ teamPointsTierPayout(mdp)` statt Rate; im
     `achievementParts`-Objekt kenntlich machen (neues Feld `tiersObserved: boolean`
     in `ManagerComputedStats`, für die UI).
  2. `lib/competitor.ts:277-281`: Heuristik entfernen –
     `const daysActive = Math.max(0, Math.floor((now - inp.leagueStartMs) / 86_400_000));`
     (`lastTxMs`-Tracking kann bleiben, wird aber für den Bonus nicht mehr benutzt).
     Kommentar: Entscheidung Mourice 05.08.2026, volle Streak als Default.
  3. `lib/competitor.ts`: `computeManagerStats` akzeptiert `initialBudget` bereits via
     Input (`lib/competitor.ts:245`) – keine Änderung nötig; stattdessen
     `lib/competition-data.ts:64`: `initialBudget` aus `collect.meta.startBudget?.value`
     wenn vorhanden, sonst `detectInitialBudget()`.
  4. `lib/competition-data.ts`: je Manager `observedMatchdayPoints` aus den geladenen
     `days` bauen (nur wenn `Object.keys(days).length >= daysPlayed` und der Manager in
     allen Tagen vorkommt), an `computeManagerStats` geben. `daysPlayed` = `rankingRec.day`
     (heute schon als `matchdaysPlayed`-Quelle ähnlich vorhanden, Z. 68).
  5. `scripts/cash-validate.ts`: neuen Modus dokumentieren – wenn Snapshot
     `perDayRankings` mit echten Werten enthält, Tier-Anteil exakt rechnen (gleiche
     Funktion importieren), damit die Validierung die neue Genauigkeit zeigt.
- **Edge-Cases:** Manager tritt mid-season bei (fehlt in frühen Tagen → keine
  Voll-Coverage → Rate, korrekt); `observedMatchdayPoints` mit 0-Werten (legitim –
  Manager hatte 0-Punkte-Spieltag; Guard liegt auf Liga-Ebene in Slice 1);
  Saison 25/26-Altdaten existieren nicht → alles läuft wie heute über Raten.
- **Akzeptanzkriterien:**
  - [ ] Unit-Test: Manager mit bekannten mdp-Reihen → Tier-Summe exakt
    (`teamPointsTierPayout`-Fixtures aus `docs/kickbase-bonus-regeln.md`).
  - [ ] Unit-Test: Tagesbonus = `estimateDailyBonus(volle Tage seit Liga-Start)`,
    unabhängig von Transfer-Daten.
  - [ ] `pnpm cash:validate` läuft unverändert durch (Liga 089, Raten-Pfad) – keine
    Regression im ehrlichen Fehler (± unverändert bis leicht besser durch Streak-Umstellung).
  - [ ] Bestehende 31 Tests + neue grün.
- **Verify:** `pnpm vitest run`; `pnpm cash:validate 2>&1 | grep "EHRLICHER FEHLER"`
  (Vorher/Nachher-Vergleich in den Commit-Text).

### Slice 3: Ehrlichkeits-UI (Datenherkunft + Multi-Season-Banner) (S)

- **Warum:** Neue Nutzer mit alten Ligen sehen heute selbstbewusste Zahlen, die 36-86 %
  daneben liegen können (validiert 05.08.); Beobachtet-vs-Geschätzt soll sichtbar sein.
- **Ist:** `app/league/[id]/wettbewerb/page.tsx:203-241` – Methodik-Karte („Methodik der
  Cash-Berechnung", zweispaltig „Exakt aus Kickbase" / „Geschätzt"). Header Z. 271-291.
  `cashUncertain` greift nur bei 0 Transfers (`lib/competitor.ts:377`).
- **Soll:** (a) Liga aus früherer Saison (`leagueStartMs < 2026-06-01`) → amber
  Warnbanner unter dem Header: Titel „Liga läuft über mehrere Saisons", Text sinngemäß:
  übertragener Kontostand + passiv punktende Kader sind nicht rekonstruierbar, die
  Cash-Schätzung ist für diese Liga deutlich ungenauer; in einer frisch zur Saison
  gestarteten Liga ist sie nahezu exakt. (b) In der Methodik-Karte eine Zeile
  Datenherkunft: „Spieltagsdaten: X von Y Spieltagen beobachtet" (aus
  `CompetitionData.collect`) + Startbudget-Label „(gemessen)" / „(Standard 50M
  angenommen)". (c) Kein Banner, keine Herkunftszeile, wenn die Liga jung ist und
  noch nichts gesammelt wurde (ehrlicher Leerzustand: „noch keine Spieltage gespielt").
- **Bauschritte:**
  1. `app/league/[id]/wettbewerb/page.tsx`: Banner-Komponente im selben File (Muster:
     bestehende amber-Hinweisboxen, z.B. `app/upgrade/page.tsx` Abbruch-Hinweis-Stil),
     Bedingung aus `leagueStartMs`.
  2. Methodik-Karte um die Herkunftszeile erweitern (Props aus `CompetitionData.collect`
     + `initialBudget`-Source).
- **Edge-Cases:** `leagueStartMs = NaN` (kein Banner, keine Herkunft – still degradieren);
  Liga 26/27 vor Spieltag 1 (Y=0 → Leerzustand-Text).
- **Akzeptanzkriterien:**
  - [ ] Liga 089 (Start 2025-08-01) zeigt den Multi-Season-Banner.
  - [ ] Banner-Text mit echten Umlauten, ohne Em-Dash, geduzt.
  - [ ] Screenshot-Beleg beider Zustände (mit/ohne Banner) im Verify.
- **Verify:** eingeloggt `/league/6871934/wettbewerb` (Banner sichtbar, Screenshot);
  Herkunftszeile zeigt „0 von 34" bzw. Leerzustand korrekt.

### Slice 4: Watchlist an die User-ID (S)

- **Warum:** Watchlist ist heute ein Klartext-Cookie (`bb_watch`) – gerätegebunden,
  geht bei Browserwechsel verloren.
- **Ist:** `lib/watchlist.ts` (56 Zeilen: `getWatched()`, `isWatched()`, `setWatched()`,
  `watchPlayer()`, `unwatchPlayer()`, Cookie `bb_watch`, MAX 50, maxAge 1 Jahr);
  `app/api/watchlist/route.ts` (GET ohne Auth, POST mit `getSession()`);
  Call-Sites: `app/league/[id]/spieler/[pid]/page.tsx:76` (`isWatched`),
  `.../WatchButton.tsx:20-24` (POST), `app/league/[id]/watchlist/page.tsx:26`
  (`getWatched`).
- **Soll:** Watchlist liegt in KV unter `user:{userId}:watchlist` (string[], Cap 50).
  Erster Zugriff mit vorhandenem Cookie-Bestand und leerem KV → Union-Migration,
  danach ist KV die Wahrheit. Cookie wird nicht mehr geschrieben.
- **Bauschritte:**
  1. `lib/watchlist.ts` umbauen: alle Funktionen bekommen `userId: string` als ersten
     Parameter (`getWatched(userId)`, `isWatched(userId, playerId)`,
     `watchPlayer(userId, playerId)`, `unwatchPlayer(userId, playerId)`). KV-Zugriff
     nach Repo-Muster + globalThis-Fallback. Migration IN `getWatched`: wenn KV leer
     und Cookie `bb_watch` nicht leer → Union in KV schreiben, Cookie löschen.
  2. Call-Sites anpassen (alle drei haben die Session bereits im Scope; GET-Route:
     jetzt Session-Pflicht → `401` ohne Session – `WatchButton` rendert nur eingeloggt,
     `push-toggle`-artiger anonymer Zugriff existiert nicht).
- **Edge-Cases:** gleicher User, zwei Geräte mit unterschiedlichen Cookies → zweites
  Gerät migriert per Union beim ersten Zugriff (KV dann nicht mehr leer → dessen
  Cookie wird verworfen; akzeptierter Rand, dokumentieren im Code-Kommentar);
  KV down → leere Liste statt Fehler (Seite funktioniert, ehrlicher Leerzustand).
- **Akzeptanzkriterien:**
  - [ ] Watch-Toggle auf Spieler-Seite persistiert in KV (Key nachweisbar).
  - [ ] Bestehendes `bb_watch`-Cookie wird beim ersten Zugriff übernommen (Union) und
    gelöscht.
  - [ ] `/league/[id]/watchlist` zeigt die KV-Liste.
- **Verify:** lokal mit Cookie-Bestand testen (Cookie von Hand setzen →
  Migration greift); `pnpm vitest run` (Unit-Test für Union-Migration mit
  In-Memory-Fallback).

### Slice 5: Aufstellungs-Planer an die User-ID (M)

- **Warum:** Mourices Kernwunsch: „mit jedem Login der gleiche Stand, nicht nur per
  Chrome" – der Planner-State liegt heute NUR im localStorage des Geräts.
- **Ist:** `app/league/[id]/aufstellung/Planner.tsx` – Client-Komponente,
  `PlannerState { slots: Record<string, string | null>; sells: string[] }` (Z. 152-157),
  Key `bb_plan_${leagueId}_v2` (Z. 239), Hydrate Z. 246-259, Persist Z. 262-269.
  Page (Server) rendert `<Planner leagueId players budget deadline matchday>` und sagt
  „Dein Plan wird lokal gespeichert" (page.tsx:100).
- **Soll:** Server-Stand unter `user:{userId}:plan:{leagueId}`
  (`PlannerState & { updatedAt: number }`). Laden: Server-Stand gewinnt; ist er leer
  und localStorage hat einen Stand → Migration (hochladen). Speichern: debounced
  (~1,5 s) an den Server, localStorage bleibt als Offline-Cache parallel bestehen.
- **Bauschritte:**
  1. NEU `app/api/planner/[leagueId]/route.ts`: GET (Session-Pflicht → 401; Response
     `{ plan: PlannerState | null, updatedAt?: number }`), PUT (Session-Pflicht, zod-Body
     `{ slots: record, sells: string[] }`, Größen-Guard: max ~30 Slots / 50 sells;
     schreibt mit `updatedAt: Date.now()`; Response `{ ok: true }`). KV + globalThis-
     Fallback nach Repo-Muster.
  2. `Planner.tsx`: Hydrate-Effect erweitern – erst `GET /api/planner/{leagueId}`;
     bei `plan` → State setzen (+ in localStorage spiegeln); bei `null` → localStorage
     lesen, falls vorhanden State setzen UND einmalig per PUT hochladen. Persist-Effect:
     zusätzlich debounced PUT (Timer im Effect, cleanup beachten); localStorage-Write
     bleibt. Fetch-Fehler: still auf localStorage-Verhalten zurückfallen (App bleibt
     offline nutzbar).
  3. `page.tsx:100`: Hinweistext ändern zu sinngemäß „Dein Plan wird an deinem
     Ligabase-Konto gespeichert und auf allen Geräten geladen – nicht zu Kickbase
     übertragen."
- **Edge-Cases:** schnelles Klicken vor Hydrate-Abschluss (bestehendes
  `hydrated`-Gate weiterverwenden – erst nach Server-Antwort `hydrated=true`);
  zwei Geräte parallel offen (Last-Write-Wins, Annahme 5); Server 401 nach
  Session-Ablauf mitten in der Nutzung (still lokal weiterspeichern).
- **Akzeptanzkriterien:**
  - [ ] Aufstellung auf Gerät A bauen → in zweitem Browser(-Profil) einloggen →
    gleiche Aufstellung erscheint (lokal mit zwei Browser-Profilen nachstellbar).
  - [ ] Bestehender localStorage-Stand wird beim ersten Laden hochmigriert.
  - [ ] Ohne KV/offline verhält sich der Planner wie heute (localStorage only).
- **Verify:** Playwright/Browser: zwei Kontexte, Migration + Cross-Device-Load mit
  Screenshot-Beleg; `pnpm vitest run` für die Route (zod-Guards).

### Slice 6: Push-Subscriptions als Mehrgeräte-Liste (S)

- **Warum:** `bb_push`-Cookie hält genau EINE Subscription pro Browser; der Code-Kommentar
  in `lib/push.ts:4-6` fordert selbst den Umbau („swap this module for a DB-backed
  implementation that supports multiple devices per user").
- **Ist:** `lib/push.ts` (JWE-Cookie `bb_push`, `StoredPushSubscription { endpoint,
  keys{p256dh,auth}, userId, createdAt }`, set/get/clear);
  `app/api/push/subscribe/route.ts` (GET subscribed?, POST speichern, DELETE löschen);
  `components/push-toggle.tsx` (subscribe/unsubscribe-Flow). KEIN Sende-Pfad existiert.
- **Soll:** Subscriptions liegen unter `user:{userId}:push` als
  `StoredPushSubscription[]` (Dedup per `endpoint`, Cap 5, ältester fliegt raus).
  GET meldet `subscribed` anhand des aktuellen Geräts (Endpoint-Abgleich via Query
  nicht möglich – stattdessen: GET bleibt Cookie-frei und meldet, ob für den User
  IRGENDEINE Subscription existiert; der präzise Geräte-Status kommt clientseitig aus
  `reg.pushManager.getSubscription()`, was `push-toggle.tsx` bereits kann).
  Cookie `bb_push` entfällt (bestehende Cookies laufen einfach aus; keine Migration
  nötig – Annahme: Push wurde mangels Sender nie produktiv genutzt).
- **Bauschritte:**
  1. `lib/push.ts` umbauen: `addPushSubscription(userId, sub)`,
     `removePushSubscription(userId, endpoint)`, `getPushSubscriptions(userId)` –
     KV-Liste wie Soll. JWE-/Cookie-Code entfernen.
  2. `app/api/push/subscribe/route.ts`: POST → add (Body um nichts erweitern, `endpoint`
     ist drin); DELETE → Body `{ endpoint }` (zod), entfernt genau das Gerät; GET →
     `{ subscribed: liste.length > 0 }`.
  3. `components/push-toggle.tsx`: `disable()` schickt den Endpoint der lokalen
     Subscription im DELETE-Body; Initial-State primär aus
     `reg.pushManager.getSubscription()` statt Server-GET (Server-GET als Fallback).
- **Edge-Cases:** DELETE für unbekannten Endpoint (ok:true, idempotent); 6. Gerät
  (ältestes fliegt, Kommentar im Code); User ohne Session (401 wie heute).
- **Akzeptanzkriterien:**
  - [ ] Subscribe auf zwei Browser-Profilen erzeugt ZWEI Einträge unter demselben User-Key.
  - [ ] Unsubscribe entfernt nur das eigene Gerät.
  - [ ] `pnpm build` grün, keine `bb_push`-Referenzen mehr im Code.
- **Verify:** zwei Browser-Profile lokal; KV-Key-Inhalt prüfen (Test-Script oder
  Debug-Log im In-Memory-Fallback).

## 5. Reihenfolge + Abhängigkeiten

- **S1 → S2 → S3** bauen aufeinander auf (Collection → Modell → UI).
- **S4, S5, S6** sind unabhängig von S1-S3 und untereinander → parallelisierbar.
- Harte Deadline nur für S1+S2 (+S3 klein): vor dem 28.08.2026 live, damit ab
  Spieltag 1 gesammelt wird. S4-S6 sind deadline-frei.

## 6. Risiken + Guards

- **`ranking?dayNumber`-Fensterbreite unbekannt** (reicht der Rückblick die ganze
  laufende Saison?): Off-Season nicht testbar. Guard: Backfill läuft bei jedem Besuch
  (nicht nur einmal), Coverage-Anzeige macht Lücken sichtbar; Ops-Punkt „Verify an
  Spieltag 2" (§7).
- **Genullte Antworten überschreiben Archiv:** Guard „Σ mdp > 0" + nie vorhandene
  Tage überschreiben (Slice 1, Akzeptanzkriterium).
- **KV-Command-Volumen:** Collection nur auf Wettbewerb-Flächen, Backfill gedrosselt
  (max 5 Tage/Besuch, 1h-Throttle). Referenz: das Pageview-Tracking
  (`lib/admin/analytics.ts:81-93`) feuert heute schon bis zu 6 Commands pro Klick –
  der Collector bleibt darunter.
- **Latenz der Wettbewerb-Seite:** Backfill-Calls sind sequenziell (max 5) und laufen
  NACH dem Datenzug; wenn messbar spürbar (> ~500 ms zusätzlich), Backfill nach dem
  Response-Streaming ausführen (Next `after()` oder fire-and-forget mit `waitUntil`-
  Semantik) – Umsetzer entscheidet nach Messung, dokumentiert in §8.
- **Planner-Datenverlust bei Migration:** Server gewinnt nur, wenn er WIRKLICH einen
  Stand hat; leerer Server überschreibt nie lokalen Stand (Slice 5 Hydrate-Logik).
- **Privacy-Regression:** Akzeptanzkriterium in S1 (kein Token/keine E-Mail in KV) +
  Code-Review-Punkt für jeden Slice.

## 7. Ops nach Merge

1. Deploy nach Mourices OK: `vercel --prod` (aus `~/betterbase`).
2. **An Spieltag 2 der Saison 26/27 (um den 05.09.2026):** Ein-Zeiler-Probe, ob
   `dayNumber=1` rückwirkend echte Werte liefert (Muster `scripts/cash-snapshot.ts`,
   eigene Liga): bestätigt die Backfill-Annahme. Ergebnis in
   `docs/kickbase-bonus-regeln.md` notieren.
3. **Beim Anlegen der neuen 26/27-Liga:** früh (Tag ≤ 3) einmal die Wettbewerb-Seite
   öffnen → Startbudget-Messung greift; prüfen: Label „(gemessen)" + plausibler Wert.
   Zusätzlich als Liga-Admin `GET /v4/leagues/{id}/settings` mit Bearer-Token proben
   (Stand 05.08.2026: als Nicht-Admin kommt 500 `{"err":2,"errMsg":"NotFound"}`;
   Admin-Fall ungetestet) – liefert es das Startbudget, Issue „Settings statt
   Messung" anlegen.
4. KV-Dashboard (Upstash/Vercel) nach der ersten Woche auf Command-Volumen prüfen.
5. Memory/Handoff aktualisieren: Collector live ab wann, Coverage-Stand Test-Liga.

## 8. Abweichungen (füllt der Umsetzer)

### Plan-Reconcile 05.08.2026 (vor Baubeginn)

`main` stand beim Reconcile unverändert auf `6c47620` (synchron mit `origin/main`),
alle zitierten Pfade, Signaturen und Zeilennummern des Plans wurden gegen den echten
Code bestätigt, 31 Tests grün. Zwei Zitierfehler IM PLAN (keine Code-Bewegung, daher
kein Neu-Review nötig):

1. **`estimateDailyBonus` liegt in `lib/competitor.ts:129-135`**, nicht in
   `lib/kickbase/bonus-catalog.ts` (Slice 1, Bauschritt 2 impliziert den falschen
   Import-Pfad). In `bonus-catalog.ts` liegt nur `teamPointsTierPayout` – das stimmt.
2. **`app/upgrade/page.tsx` enthält keine amber Hinweisbox** und taugt damit nicht als
   Stilvorbild für den Multi-Season-Banner (Slice 3, Bauschritt 1). Die Seite nutzt
   durchgehend den grünen Markenton (`border-primary/30 bg-primary/[0.06]`). Echte
   amber-Vorbilder im Repo: `app/league/[id]/wettbewerb/page.tsx:598`
   (`border-amber-300 bg-amber-50/40`) und `app/league/[id]/page.tsx:408-443`.

Ergänzend bestätigt: KV-Präfixe `collect:` und `user:` sind repo-weit ungenutzt
(Annahme 10 gilt); `zod` ^4.4.3 vorhanden; `web-push` nicht installiert (Nicht-Ziel
bleibt gültig); `SessionPayload` hat `userId` UND `token`; `FREE_BETA = true`.

Umsetzungsrahmen: Codex als Umsetzer je Slice, Verifikation durch den Orchestrator.
Gebaut wird sequenziell (nicht S4-S6 parallel), weil Codex direkt im Arbeitsbaum
editiert und parallele `pnpm build`-Läufe sich im `.next`-Verzeichnis gegenseitig
zerlegen würden.

### Abweichungen beim Bauen

**Ops (kein Plan-Inhalt): Codex-Modell auf `gpt-5.5` gepinnt.** Der erste Codex-Auftrag
brach nach 9 Sekunden mit HTTP 400 ab: `The 'gpt-5.6-sol' model requires a newer version
of Codex`. `~/.codex/config.toml` pinnt global `model = "gpt-5.6-sol"`, die installierte
CLI 0.143.0 kennt das Modell nicht. Alle Codex-Aufträge dieses Laufs gehen deshalb mit
explizitem `--model gpt-5.5 --effort high` raus. Betrifft nur die Werkzeugkette, nicht
den Plan. Dauerhafte Lösung wäre ein `codex update` oder ein Zurückdrehen des
Modell-Pins in der config.toml (Mourice-Entscheidung, nicht Teil dieses Laufs).

**Ops: nichts gepusht.** Das Repo ist Vercel-verknüpft (Projekt `betterbase`, Remote
`moritzvonio/kickbasemvp`). Ein Push auf `main` würde damit ein Prod-Deployment
auslösen, und Deploy braucht laut Abschnitt 0 Mourices ausdrückliches OK. Alle Commits
dieses Laufs liegen deshalb LOKAL auf `main` und warten auf die Freigabe.

**Slice 1: Startbudget-Default nur noch bei alter Liga (Korrektur am Plan-Wortlaut).**
Der Plan sagt in Bauschritt 2: „Sonst wenn `meta.startBudget` fehlt und Liga älter:
`{ value: INITIAL_BUDGET, source: "default" }` (einmalig schreiben)". Die erste
Umsetzung schrieb den Default in JEDEM nicht-messbaren Fall, also auch bei einer jungen
Liga, bei der `kb.myBudget` an genau diesem Besuch gepatzt hat (der Call ist mit
`.catch(() => null)` abgesichert). Folge wäre gewesen: `meta.startBudget` existiert,
die Messung läuft nie wieder, die Liga hängt dauerhaft auf 50M Standard, obwohl sie
messbar gewesen wäre. Genau das hätte den Ops-Schritt 7.3 still ausgehebelt.
Jetzt gilt: junge Liga ohne Cash-Daten schreibt NICHTS, ein späterer Besuch im
3-Tage-Fenster kann noch messen. Drei Regressionstests in `tests/collect.test.ts`.

**Slice 1: Sammellauf in `after()` statt inline (Entscheidung nach Messung, Abschnitt 6).**
Abschnitt 6 verlangt eine Messung und überlässt dem Umsetzer die Entscheidung.
Gemessen am 05.08.2026 gegen Liga 089: `collectOnVisit` braucht **469 ms kalt** (5
Backfill-Versuche) und **0 ms warm** (1h-Throttle greift). Das liegt knapp unter der
500-ms-Schwelle, ist aber der günstigste denkbare Fall, weil Off-Season-Antworten leer
sind; in der Saison mit echten Spieltagsdaten wird es mehr. Der Aufruf hängt deshalb in
`after()` aus `next/server` und blockiert den Seitenaufruf nicht mehr. Laufzeit-Beweis:
eingeloggter Aufruf von `/league/6871934/wettbewerb` liefert HTTP 200, der
`after`-Callback ist nachweislich gelaufen und `collectOnVisit` sauber beendet.
Fallback: ohne Request-Scope (Diagnose-Skripte) läuft der Sammellauf inline weiter.

**Slice 1: KV-Command-Volumen gesenkt (Guard aus Abschnitt 6).** Die erste Umsetzung lud
den Bestand zweimal pro Besuch (einmal in `assembleCompetitionStats`, einmal im
Collector) und schrieb den Cash-Anker bedingungslos, zusammen rund 6 Commands pro
Aufruf. Abschnitt 6 fordert aber ausdrücklich „der Collector bleibt darunter" (unter den
6 des Pageview-Trackings). Jetzt reicht der Aufrufer seinen bereits geladenen Stand per
`preloaded` durch, und `recordCashAnchor` schreibt nicht, wenn Tag und Betrag unverändert
sind.

**Slice 1: `INITIAL_BUDGET` nicht über `lib/competitor.ts` re-exportieren.** Die erste
Umsetzung legte dort einen Re-Export an; der Collector importiert die Konstante jetzt
direkt aus `lib/kickbase/bonus-catalog.ts`. `lib/competitor.ts` bleibt in S1 unberührt.

**Slice 2: Akzeptanzkriterium „keine Regression im ehrlichen Fehler" gilt nur für die
Zielliga.** Das Kriterium nennt Liga 089 und den Raten-Pfad, und dort ist es erfüllt:
16,2 % -> 7,2 % und 12,3 % -> -2,6 %, also klar besser. Die beiden Multi-Season-Ligen
in den Snapshots driften dagegen ab, eine davon deutlich:

| Liga | Tagesbonus vorher -> nachher | Fehler vorher -> nachher |
|---|---|---|
| Liga 089 (aktuelle Saison) | 28,75M -> 33,35M | 16,2 % -> 7,2 % |
| Kickbase 23/24 (multi-season) | 28,65M -> 106,55M | 86,1 % -> 50,8 % |
| Kickbase 24/25 (multi-season) | 27,85M -> 69,45M | -36,0 % -> -94,3 % |

Ursache ist kein Fehler, sondern Annahme 1: bei den alten Ligen liegt der Liga-Start
700 bis 1000 Tage zurück, die volle Streak ergibt dort 70 bis 106 Mio „Tagesbonus".
Die frühere Aktivitäts-Heuristik hat das zufällig gedeckelt. Bei einer frisch
gestarteten 26/27-Liga sind maximal rund 280 Tage möglich, also etwa 28 Mio, was
realistisch ist. Das Nicht-Ziel „keine Rück-Korrektur alter Multi-Season-Ligen" deckt
genau diesen Fall ab, und der Banner aus Slice 3 macht ihn für Nutzer sichtbar.
**Wenn das nicht gewollt ist, wäre der kleinste Eingriff ein Deckel auf die Tage seit
Liga-Start (etwa auf die Länge einer Saison) – bewusst NICHT gebaut, weil es dem
Nicht-Ziel widerspricht.**

**Slice 2: Methodik-Karte behauptete die alte Methode.** Nicht im Plan vorgesehen, aber
zwingende Folge: die Karte sagte weiterhin „Tagesbonus: 100k/Tag bis zur letzten
Aktivität". Nach der Umstellung war das ein kundensichtbarer Falschtext, den weder Test
noch Build meldet. Jetzt: „100k/Tag als volle Streak seit Liga-Start (kann
überschätzen)".

**Slice 3: Methodik-Karte in eigene Komponente ausgelagert.** Um `collect` und die
Startbudget-Quelle sauber als Props durchzureichen, ist die Karte aus dem Haupt-Return
in eine lokale Komponente `MethodologyCard` gewandert. Reine Struktur, keine
Verhaltensänderung.

**Slice 4: Entfernte Spieler kamen aus dem Cookie zurück.** Der Plan sagt nur
„KV leer + Cookie vorhanden -> migrieren". Das reicht nicht, weil `cookies().delete()`
in Server Components wirft und `getWatched` genau dort läuft (Spieler-Seite,
Watchlist-Seite). Das `bb_watch` überlebt die Migration also im Regelfall. Behandelt man
dann „Key fehlt" und „Key ist leer" gleich, wird nach dem Entfernen des letzten Spielers
erneut migriert und der gelöschte Spieler ist zurück – bei jedem Entfernen.
`loadWatched` unterscheidet die beiden Fälle jetzt: sobald einmal geschrieben wurde,
gewinnt KV, auch bei leerer Liste. Regressionstest mit gemocktem `next/headers`, dessen
`delete()` wie in einer Server Component wirft.

**Slice 4: Zwei Nutzer an einem Gerät erben denselben Altbestand.** `bb_watch` war nie
an einen User gebunden. Loggt sich Nutzer B auf einem Gerät ein, auf dem Nutzer A ein
Cookie hinterlassen hat, übernimmt B dessen Merkliste. Bewusst NICHT abgesichert: es
sind reine Spieler-IDs, der Fall ist auf die Übergangszeit begrenzt, und eine Absicherung
bräuchte eine User-Markierung in einem Legacy-Cookie, das ohnehin verschwindet.

**Slice 5: Der Planner konnte dauerhaft einfrieren.** Der Plan schreibt vor, `hydrated`
erst nach der Server-Antwort zu setzen. `hydrated` sperrt aber alle sechs Interaktionen
(Ziehen, Ablegen, Entfernen, Verkaufen), und `fetch` hat kein Timeout. Eine hängende
Route hätte den Planner unbedienbar gemacht, ohne dass die Oberfläche etwas anzeigt –
heute ist er sofort bedienbar. Ergänzt: 4-Sekunden-Deckel, danach läuft er rein lokal
weiter (das ist genau das vom Plan geforderte Fallback-Verhalten).

**Slice 5: Hydrate durfte nicht an `initialState` hängen.** Die Seite ist
`force-dynamic` mit `revalidate = 0`; ein neuer RSC-Payload gibt `players` eine neue
Identität und hätte einen zweiten Hydrate-Lauf ausgelöst, der den gerade bearbeiteten
Plan mit dem Server-Stand überschreibt (der Upload ist um 1,5 s verzögert). Der Effect
hängt jetzt nur an `leagueId` und `storageKey`, `initialState` kommt über eine Ref.

### Runde 2: Befunde der adversarialen Prüfung (drei Sonnet-Prüfer)

**Behoben (Details im Commit `8e141cc`):** laufender Spieltag fror als Zwischenstand
ein; Startbudget-Messung rechnete mit geschätzten statt echten Erfolgen; transienter
KV-Lesefehler beim Planner sah aus wie „noch nie gespeichert"; Planner-Änderungen
innerhalb der 1,5-Sekunden-Verzögerung gingen beim Wegnavigieren verloren; Summenformel
der Methodik-Karte war unvollständig; Startbudget-Label war ein fester Text statt aus
dem Betrag abgeleitet.

**Wichtig für die Zukunft: `lfmd` ist NICHT „last finished matchday".** Die Prüfung
schlug vor, `ranking.day` durch `lfmd` zu ersetzen. An der echten API gemessen
(05.08.2026, alle drei eigenen Ligen): `day=34`, `lfmd=1`, `nd=34`, `sn="25/26"`. Ein
Wechsel auf `lfmd` hätte den Collector auf Spieltag 1 beschränkt. Das Feld nicht ohne
erneute Messung während der laufenden Saison verwenden.

**Bewusst NICHT geändert (im Plan akzeptiert):**
- Last-Write-Wins bei gleichzeitigen Schreibern (Abschnitt 4, Edge-Cases von Slice 1
  und Annahme 5). Verlorene Spieltage holt der Backfill beim nächsten Besuch nach.
- UTC-Schwelle des Multi-Season-Banners (Annahme 4). An der Grenze 01.06.2026 gibt es
  ein Zwei-Stunden-Fenster, in dem eine Liga falsch eingeordnet würde.

**Offen, braucht eine Entscheidung von Mourice:**
1. **Cash-Anker liegen liga-weit** (`collect:league:{id}:anchors`), enthalten aber den
   echten Kontostand jedes Besuchers. Heute reine Schreibablage ohne Lesepfad, deshalb
   folgenlos; eine Warnung steht an der Typdefinition. Umstellung auf
   `user:{userId}:...` kostet jetzt zehn Zeilen, nach dem ersten Produktiv-Einsatz eine
   Datenmigration.
2. **Saisonwechsel bei „Liga fortsetzen"**: der Store schlüsselt nur nach `leagueId`,
   nicht nach Saison. Läuft dieselbe Liga in die Saison 27/28 weiter, treffen die
   Spieltage 1-34 der neuen Saison auf bereits vorhandene Einträge der alten und werden
   nie gesammelt. Betrifft frühestens Mitte 2027. Das Ranking liefert `sn` („25/26"),
   der Key könnte das aufnehmen.
3. **Push-Status kann nach einer verlorenen Browser-Subscription eine Karteileiche auf
   dem Server zurücklassen.** Ohne Sende-Pfad folgenlos, sollte aber vor dem
   Scharfschalten von Push behoben werden.

**Vorbestehend, nicht in diesem Lauf angefasst:** `tests/cash-model.test.ts:121-139`
prüft algebraisch nur sich selbst (`structural = REAL - cashEstimateError` ist per
Definition wieder die Schätzung) und kann keinen Formelfehler finden.

**Slice 3: Zustand „ohne Banner" nur erzwungen belegbar.** Alle real verfügbaren Ligen
sind vor dem 01.06.2026 gestartet, es gibt heute also keine Liga, die den Banner nicht
zeigt. Der Zustand wurde per temporär gedrehter Datumsschwelle im Browser belegt und
die Änderung danach zurückgenommen (Screenshot vorhanden). Gleiches Vorgehen für den
Leerzustand `daysPlayed = 0` und das Label „(gemessen)".
