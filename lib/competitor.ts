/**
 * Competitor Analysis – schätzt Konkurrenten-Cash aus beobachtbaren Signalen.
 *
 * Strukturmodell (v2, empirisch verifiziert gegen eigenen IST-Cash,
 * Snapshots 2026-07-06 – Herleitung: docs/kickbase-bonus-regeln.md):
 *
 *   cash = 50M Start
 *        + TransferNetto (nur Transfers NACH Liga-Start)
 *        + Punkteprämie:   tp × 1.000 €        (exakt, tp aus Manager-Dashboard)
 *        + Sieg-Prämie:    mdw × ~1,46M        (exakt beobachtbar, Rate s. Katalog)
 *        + Tagesbonus:     100k/Tag streak-basiert (Ramp 10k→100k)
 *        + Achievements:   strukturell geschätzt (exakte Teile + kalibrierte Raten)
 *
 * Eigener User: IST-Cash aus /me/budget (exakt) + dieselbe Schätzung parallel
 * als Validierung (cashEstimateError).
 *
 * 33%-Regel (Verkauf an Liga): 67 % des MV → Max-Bid-Berechnung.
 */

import type {
  KbActivity,
  KbManagerSquadResponse,
  KbManagerTransfer,
  KbRankingUser,
} from "./kickbase/types";
import {
  ACHIEVEMENT_ER,
  DAILY_BONUS_CAP,
  INITIAL_BUDGET,
  MATCHDAY_WIN_PREMIUM,
  POINTS_PREMIUM_PER_POINT,
  SELL_TO_LEAGUE_FACTOR,
  teamPointsTierPayout,
} from "./kickbase/bonus-catalog";

export const SELL_TO_BANK_FACTOR = SELL_TO_LEAGUE_FACTOR;

/** Mannschaftswert-Meilensteine (kumulativ, einmalig): Schwelle → Auszahlung */
export const TEAM_VALUE_MILESTONES: Array<{ min: number; er: number }> = [
  { min: 100_000_000, er: ACHIEVEMENT_ER[400] },
  { min: 150_000_000, er: ACHIEVEMENT_ER[401] },
  { min: 200_000_000, er: ACHIEVEMENT_ER[402] },
  { min: 250_000_000, er: ACHIEVEMENT_ER[403] },
  { min: 300_000_000, er: ACHIEVEMENT_ER[404] },
];

/**
 * Fallback-Raten aus dem eigenen Liga-089-Account (Saison 25/26).
 * Werden pro Liga aus dem eingeloggten User neu kalibriert, wenn dessen
 * Achievements verfügbar sind (calibrateFromOwnAccount).
 */
export const DEFAULT_CALIBRATION: CashCalibration = {
  tierPayoutPerPoint: 11_100_000 / 39_641, // Spieltagspunkte-Tiers ≈ 280 €/Pkt
  playerAchPayoutPerPoint: 9_600_000 / 39_641, // Topscorer/MW/WK/FG ≈ 242 €/Pkt
  handPayoutPerSoldEuro: 9_100_000 / 1_887_917_000, // Händchen ≈ 4,8 €/1000 € Verkaufsvolumen
  flatBase: 2_200_000, // Kreisliga + Regionalliga + Panini + Choreo
  residualPerPoint: 151, // unerklärter Rest der Bilanz-Identität Liga 089 (~6M/39641)
};

export interface CashCalibration {
  tierPayoutPerPoint: number;
  playerAchPayoutPerPoint: number;
  handPayoutPerSoldEuro: number;
  flatBase: number;
  /**
   * €/Saisonpunkt für den nach allen strukturellen Komponenten verbleibenden
   * Rest des eigenen Accounts (Quelle unbekannt, s. docs/kickbase-bonus-regeln.md).
   * Pro Liga via calibrateResidualPerPoint aus dem IST-Cash geeicht.
   */
  residualPerPoint: number;
}

/**
 * Eicht den Rest-Term aus dem eigenen Account: (IST-Cash − Strukturschätzung)
 * pro Saisonpunkt. computeManagerStats liefert cashEstimateError für den
 * eigenen User – daraus direkt die Rate. Ausreißer werden gekappt, damit ein
 * Daten-Problem (z.B. fehlende Transfers) nicht alle Schätzungen verbiegt.
 */
export function calibrateResidualPerPoint(ownStats: ManagerComputedStats): number | undefined {
  if (ownStats.cashEstimateError === undefined) return undefined;
  const tp = ownStats.totalMatchdayPoints;
  if (!tp || tp <= 0) return undefined;
  const rate = ownStats.cashEstimateError / tp;
  return Math.abs(rate) <= 1_000 ? rate : undefined;
}

/** Achievement-Items des eigenen Users (aus /user/achievements + Details). */
export interface OwnAchievements {
  items: Array<{ t: number; n?: string; ac?: number; er: number; total: number }>;
  total: number;
}

/**
 * Kalibriert die weichen Raten aus den ECHTEN Achievements des eingeloggten
 * Users – dadurch tragen Liga-Eigenheiten (Punktniveau, Handelsintensität)
 * in die Schätzung der anderen Manager.
 */
export function calibrateFromOwnAccount(opts: {
  achievements: OwnAchievements;
  ownTp: number;
  ownSoldVolume: number;
}): CashCalibration {
  const { achievements, ownTp, ownSoldVolume } = opts;
  if (!achievements.items.length || ownTp <= 0) return DEFAULT_CALIBRATION;

  const sum = (ts: number[]) =>
    achievements.items
      .filter((i) => ts.includes(i.t))
      .reduce((s, i) => s + (i.ac ?? 0) * (i.er > 0 ? i.er : ACHIEVEMENT_ER[i.t] ?? 0), 0);

  const tierPayout = sum([100, 101, 102, 103]);
  const playerAchPayout = sum([300, 301, 302, 303]);
  const handPayout = sum([700, 701, 702, 703, 704]);
  const flatBase = sum([600, 601, 602, 603, 3000, 4000, 4001]);

  return {
    tierPayoutPerPoint: tierPayout / ownTp,
    playerAchPayoutPerPoint: playerAchPayout / ownTp,
    handPayoutPerSoldEuro: ownSoldVolume > 0 ? handPayout / ownSoldVolume : DEFAULT_CALIBRATION.handPayoutPerSoldEuro,
    flatBase: flatBase > 0 ? flatBase : DEFAULT_CALIBRATION.flatBase,
    residualPerPoint: DEFAULT_CALIBRATION.residualPerPoint,
  };
}

/**
 * Tagesbonus über einen Zeitraum: Tag 1–10 rampen 10k→100k, danach 100k/Tag.
 * Annahme EIN durchgehender Streak (Resets nicht beobachtbar) – leichte
 * Überschätzung, die fehlende Login-Tage ungefähr ausgleicht.
 */
export function estimateDailyBonus(days: number): number {
  if (days <= 0) return 0;
  const rampDays = Math.min(days, 10);
  const ramp = ((rampDays * (rampDays + 1)) / 2) * 10_000;
  const rest = Math.max(0, days - 10) * DAILY_BONUS_CAP;
  return ramp + rest;
}

/** Mannschaftswert-Meilenstein-Auszahlungen für einen (Peak-)Teamwert. */
export function teamValueMilestonePayout(peakTeamValue: number): number {
  return TEAM_VALUE_MILESTONES.reduce((s, m) => s + (peakTeamValue >= m.min ? m.er : 0), 0);
}

export interface ManagerComputedStats {
  userId: string;
  name: string;
  image?: string;
  initialBudget: number;
  /** Σ Kaufsummen (nur post-Liga-Start) */
  totalBought: number;
  /** Σ Verkaufssummen (nur post-Liga-Start) */
  totalSold: number;
  /** Anzahl Transfers vor Liga-Start, die ignoriert wurden */
  preStartTransferCount: number;
  /** Punkteprämie: tp × 1.000 € (exakt) */
  estimatedPointsBonus: number;
  /** Saisonpunkte (tp aus Dashboard bzw. Ranking) */
  totalMatchdayPoints: number;
  /** Spieltagssiege (mdw aus Dashboard) */
  matchdayWins: number;
  /** Sieg-Prämie: mdw × Rate */
  estimatedWinBonus: number;
  /** Tagesbonus-Schätzung (streak-basiert) */
  estimatedLoginBonus: number;
  /** Tage seit Liga-Start (Basis Tagesbonus) */
  daysActive: number;
  /** Achievement-Schätzung gesamt (bzw. exakter API-Wert beim eigenen User) */
  estimatedAchievementBonus: number;
  /** true, wenn der Tier-Anteil aus beobachteten Spieltagen exakt gerechnet wurde */
  tiersObserved: boolean;
  /** Aufschlüsselung der Achievement-Schätzung */
  achievementParts: {
    flatBase: number;
    tiers: number;
    playerAchievements: number;
    mvp: number;
    hand: number;
    teamValueMilestones: number;
    seasonEnd: number;
  };
  /** Kalibrierter Rest-Term: residualPerPoint × tp */
  calibratedResidualBonus: number;
  /** Σ realer Achievement-Total (nur eigener User, aus /user/achievements) */
  realAchievementBonus?: number;
  /** Achievement-Detail (nur eigener User) */
  achievementBreakdown?: Array<{ t: number; n: string; ac: number; er: number; total: number }>;
  /** Geschätzter Cash-Stand (Strukturmodell – auch für eigenen User berechnet) */
  cashEstimate: number;
  /** "ist" = echter Wert übernommen, "structural" = Schätzung */
  cashMethod: "ist" | "structural";
  /** Echter Cash aus /me/budget (nur eigener User) */
  realCashFromApi?: number;
  /** Validierung: realCashFromApi − Strukturschätzung */
  cashEstimateError?: number;
  /** Nettoergebnis aus Transfers (Sells − Buys, post-Start) */
  transferBalance: number;
  /** Anzahl Transfers (post-Start) */
  transferCount: number;
  /** Aktueller Squad-Wert */
  teamValue: number;
  /** Netto-Teamwert: TV + Cash */
  netTeamValue: number;
  /** 24h-Veränderung des Squad-Werts */
  dayGain: number;
  squadSize: number;
  /** Max-Gebot: Cash + 67 % des teuersten Spielers */
  maxBidSingleSell: number;
  /** Theoretisches Max-Gebot: Cash + 67 % des gesamten Kaders */
  maxBidTotal: number;
  seasonPoints?: number;
  placement?: number;
  /** Wenn true: keine Transferdaten verfügbar → Schätzung unsicher */
  cashUncertain: boolean;
}

export interface ComputeManagerInput {
  userId: string;
  name: string;
  image?: string;
  initialBudget?: number;
  transfers?: KbManagerTransfer[];
  squad?: KbManagerSquadResponse | null;
  /** Ranking-Eintrag (sp/spl) */
  rankingEntry?: KbRankingUser;
  /** Manager-Dashboard: tp (Saisonpunkte), mdw (Spieltagssiege) – für ALLE Manager verfügbar */
  dashboard?: { tp?: number; mdw?: number; pl?: number } | null;
  /** Liga-Start (overview.dt) – Transfers davor werden ignoriert (Reset-Modell) */
  leagueStartMs: number;
  /** "Jetzt" für Tages-Berechnungen (Default Date.now()) */
  nowMs?: number;
  /** Saison abgeschlossen? → Meister/Vize-Bonus nach Platzierung */
  seasonFinished?: boolean;
  /** Anzahl gewerteter Spieltage (für MVP-Pool), Default 34 */
  matchdaysPlayed?: number;
  /** Σ Saisonpunkte aller Manager (für MVP-Anteil) */
  leagueTotalPoints?: number;
  /**
   * Gesammelte Spieltagspunkte dieses Managers (aus dem Liga-Archiv).
   * NUR setzen, wenn die Coverage vollständig ist – sonst wird weiter geschätzt.
   */
  observedMatchdayPoints?: number[];
  /** Kalibrierte Raten (aus eigenem Account); Default: Liga-089-Konstanten */
  calibration?: CashCalibration;
  /** Echte Achievement-Daten (nur eigener User) */
  achievements?: OwnAchievements;
  /** Echter Cash aus /me/budget (nur eigener User) */
  realCashFromApi?: number;
  /** @deprecated Feed-Aktivitäten – für das Cash-Modell nicht mehr genutzt */
  activities?: KbActivity[];
}

export function computeManagerStats(inp: ComputeManagerInput): ManagerComputedStats {
  const now = inp.nowMs ?? Date.now();
  const initialBudget = inp.initialBudget ?? INITIAL_BUDGET;
  const cal = inp.calibration ?? DEFAULT_CALIBRATION;
  const transfers = inp.transfers ?? [];

  // Transfers: nur nach Liga-Start (Vorsaison-/Reset-Transfers zählen nicht)
  let totalBought = 0;
  let totalSold = 0;
  let transferCount = 0;
  let preStartTransferCount = 0;
  for (const t of transfers) {
    const ts = Date.parse(t.dt);
    if (!Number.isFinite(ts) || ts <= inp.leagueStartMs) {
      preStartTransferCount++;
      continue;
    }
    transferCount++;
    if (t.tty === 1) totalBought += t.trp ?? 0;
    else if (t.tty === 2) totalSold += t.trp ?? 0;
  }
  const transferNet = totalSold - totalBought;

  // Saisonpunkte + Siege: Dashboard ist die verlässlichste Quelle (auch
  // off-season korrekt); Ranking-sp als Fallback.
  const tp = inp.dashboard?.tp ?? inp.rankingEntry?.sp ?? 0;
  const mdw = inp.dashboard?.mdw ?? 0;
  const placement = inp.dashboard?.pl ?? inp.rankingEntry?.spl;

  const pointsPremium = tp * POINTS_PREMIUM_PER_POINT;
  const winBonus = mdw * MATCHDAY_WIN_PREMIUM;

  // Tagesbonus: volle Streak seit Liga-Start. Entscheidung Mourice 05.08.2026 –
  // die frühere Aktivitäts-Heuristik (letzter Transfer + 7 Tage Auslauf) entfällt
  // ersatzlos. Kippt eine Unterschätzung in eine leichte Überschätzung.
  const daysActive = Math.max(0, Math.floor((now - inp.leagueStartMs) / 86_400_000));
  const dailyBonus = estimateDailyBonus(daysActive);

  // Squad / Teamwert
  const squadPlayers = inp.squad?.it ?? [];
  const teamValue = squadPlayers.reduce((s, p) => s + (p.mv ?? 0), 0);
  const dayGain = squadPlayers.reduce((s, p) => s + (p.tfhmvt ?? 0), 0);

  // Achievements
  const realAchievementBonus = inp.achievements?.total;
  const matchdays = inp.matchdaysPlayed ?? 34;
  const mvpPool = matchdays * ACHIEVEMENT_ER[5001];
  const mvpShare =
    inp.leagueTotalPoints && inp.leagueTotalPoints > 0 ? (tp / inp.leagueTotalPoints) * mvpPool : 0;
  const seasonEnd = inp.seasonFinished
    ? placement === 1
      ? ACHIEVEMENT_ER[2001]
      : placement === 2
        ? ACHIEVEMENT_ER[2002]
        : 0
    : 0;
  const observedMatchdayPoints = inp.observedMatchdayPoints;
  const tiersObserved = observedMatchdayPoints !== undefined && observedMatchdayPoints.length > 0;
  const tiers = tiersObserved
    ? observedMatchdayPoints.reduce((s, mdp) => s + teamPointsTierPayout(mdp), 0)
    : cal.tierPayoutPerPoint * tp;
  const achievementParts = {
    flatBase: cal.flatBase,
    tiers,
    playerAchievements: cal.playerAchPayoutPerPoint * tp,
    mvp: mvpShare,
    hand: cal.handPayoutPerSoldEuro * totalSold,
    teamValueMilestones: teamValueMilestonePayout(teamValue),
    seasonEnd,
  };
  const estimatedAchievementBonus =
    realAchievementBonus !== undefined
      ? realAchievementBonus + seasonEndNotInApi(inp, seasonEnd)
      : Object.values(achievementParts).reduce((s, v) => s + v, 0);

  // Kalibrierter Rest-Term (Quelle unbekannt, aus eigenem IST-Cash geeicht)
  const calibratedResidualBonus = cal.residualPerPoint * tp;

  // Strukturmodell – für ALLE gerechnet (eigener User: Validierung)
  const structuralEstimate =
    initialBudget +
    transferNet +
    pointsPremium +
    winBonus +
    dailyBonus +
    estimatedAchievementBonus +
    calibratedResidualBonus;

  const cashEstimate = inp.realCashFromApi !== undefined ? inp.realCashFromApi : structuralEstimate;
  const cashMethod: "ist" | "structural" = inp.realCashFromApi !== undefined ? "ist" : "structural";
  const cashEstimateError =
    inp.realCashFromApi !== undefined ? inp.realCashFromApi - structuralEstimate : undefined;

  const liquidationValues = squadPlayers
    .map((p) => Math.floor((p.mv ?? 0) * SELL_TO_LEAGUE_FACTOR))
    .sort((a, b) => b - a);
  const topLiq = liquidationValues[0] ?? 0;

  return {
    userId: inp.userId,
    name: inp.name,
    image: inp.image,
    initialBudget,
    totalBought,
    totalSold,
    preStartTransferCount,
    estimatedPointsBonus: pointsPremium,
    totalMatchdayPoints: tp,
    matchdayWins: mdw,
    estimatedWinBonus: winBonus,
    estimatedLoginBonus: dailyBonus,
    daysActive,
    estimatedAchievementBonus,
    tiersObserved,
    achievementParts,
    calibratedResidualBonus,
    realAchievementBonus,
    achievementBreakdown: inp.achievements?.items.map((a) => ({
      t: a.t,
      n: a.n ?? `t=${a.t}`,
      ac: a.ac ?? 0,
      er: a.er,
      total: a.total,
    })),
    cashEstimate,
    cashMethod,
    realCashFromApi: inp.realCashFromApi,
    cashEstimateError,
    transferBalance: transferNet,
    transferCount,
    teamValue,
    netTeamValue: teamValue + cashEstimate,
    dayGain,
    squadSize: squadPlayers.length,
    maxBidSingleSell: cashEstimate + topLiq,
    maxBidTotal: cashEstimate + liquidationValues.reduce((s, v) => s + v, 0),
    seasonPoints: tp,
    placement,
    cashUncertain: transferCount === 0,
  };
}

/**
 * Meister/Vize wird als Achievement ausgezahlt und ist im API-total des
 * eigenen Users bereits enthalten, sobald die Saison vorbei ist – dann NICHT
 * doppelt addieren. Nur wenn die API den Saisonende-Bonus noch nicht listet
 * (ac=0), wäre er zu ergänzen; das prüfen wir konservativ über die Items.
 */
function seasonEndNotInApi(inp: ComputeManagerInput, seasonEnd: number): number {
  if (!seasonEnd || !inp.achievements) return 0;
  const has = inp.achievements.items.some((i) => (i.t === 2001 || i.t === 2002) && (i.ac ?? 0) > 0);
  return has ? 0 : seasonEnd;
}

/** Bestimmt das Initial-Budget (Bundesliga-Standard 50M; ENV-Override möglich). */
export function detectInitialBudget(): number {
  const envOverride = Number(process.env.INITIAL_BUDGET_EUR);
  if (Number.isFinite(envOverride) && envOverride > 0) return envOverride;
  return INITIAL_BUDGET;
}

/** Rechnet einen Cash-Wert in Mio €/Tsd € als Display-String. */
export function formatCashCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")} Mio`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} Tsd`;
  return `${sign}${abs}`;
}
