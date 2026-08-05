/**
 * Pro entitlement – cookie-based MVP.
 *
 * After a successful Stripe checkout we set a JWE-encrypted cookie containing
 * the user id, plan, and an expiry timestamp. That's the source of truth until
 * we wire up a DB.
 *
 * Zugang = Pro (bezahlt, Cookie) ODER Testphase (erster Login + Fristen aus
 * lib/season.ts). Der Erst-Login-Zeitpunkt liegt in KV (`trial:{userId}`) mit
 * In-Memory-Fallback fürs lokale Dev (Muster wie lib/admin/analytics.ts).
 */

import { cookies } from "next/headers";
import { jwtDecrypt, EncryptJWT } from "jose";
import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { env, isProd } from "@/lib/env";
import { trialEndFor } from "@/lib/season";
import { getReferralBonusUntil } from "@/lib/referral";

const COOKIE = "bb_entitlement";
const ALGO = "dir";
const ENC = "A256GCM";

/**
 * Offene Beta: ALLE Gate-Flächen (Wettbewerb, Bid-Advisor, Chart, Snapshots)
 * sind für jeden eingeloggten User frei. Stripe/Trial/Referral-Code bleibt
 * schlafend erhalten. Zum Scharfschalten des Pricings auf `false` drehen und
 * die Beta-Copy auf Landing, /upgrade und /account zurückbauen.
 */
export const FREE_BETA = true;

// Neue Halbserien-Pläne + Legacy-Werte (monthly/season) für Abwärtskompatibilität.
export type Plan = "hinrunde-2627" | "rueckrunde-2627" | "monthly" | "season";

export interface Entitlement {
  userId: string;
  plan: Plan;
  exp: number; // unix seconds
}

function getKey(): Uint8Array {
  // SHA-256 für robuste 32-byte-Schlüssel-Ableitung aus dem SESSION_SECRET.
  return new Uint8Array(createHash("sha256").update(env.SESSION_SECRET).digest());
}

export async function setEntitlement(e: Entitlement) {
  const jwe = await new EncryptJWT({ ...e })
    .setProtectedHeader({ alg: ALGO, enc: ENC })
    .setIssuedAt()
    .setExpirationTime(e.exp)
    .encrypt(getKey());
  const jar = await cookies();
  jar.set(COOKIE, jwe, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: new Date(e.exp * 1000),
  });
}

export async function getEntitlement(): Promise<Entitlement | null> {
  const jar = await cookies();
  const c = jar.get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtDecrypt(c, getKey());
    const e = payload as unknown as Entitlement;
    if (!e.userId || !e.plan || !e.exp) return null;
    if (e.exp * 1000 < Date.now()) return null;
    return e;
  } catch {
    return null;
  }
}

export async function clearEntitlement() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function hasPro(forUserId?: string): Promise<boolean> {
  if (FREE_BETA) return true;
  const e = await getEntitlement();
  if (!e) return false;
  if (forUserId && e.userId !== forUserId) return false;
  return true;
}

/* ─── Testphase (Trial) ────────────────────────────────────────────────── */

const KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const memTrial = new Map<string, string>();

/**
 * Hält den Zeitpunkt des ersten Logins fest (nur wenn noch nicht vorhanden).
 * Best-effort – der Login darf hieran NIE scheitern. Gibt zurück, ob dies der
 * ALLERERSTE Login war (für die Referral-Gutschrift).
 */
export async function recordFirstLoginTrial(userId: string): Promise<boolean> {
  const iso = new Date().toISOString();
  try {
    if (KV) {
      const res = await kv.set(`trial:${userId}`, iso, { nx: true });
      return res !== null; // "OK" = neu gesetzt = Erstlogin
    }
    if (memTrial.has(userId)) return false;
    memTrial.set(userId, iso);
    return true;
  } catch {
    return false;
  }
}

/** ISO-Zeitpunkt des ersten Logins (Basis der Testphasen-Frist) oder null. */
export async function getTrialStart(userId: string): Promise<string | null> {
  try {
    if (KV) return (await kv.get<string>(`trial:${userId}`)) ?? null;
    return memTrial.get(userId) ?? null;
  } catch {
    return null;
  }
}

export interface Access {
  /** Bezahlter Pro-Zugang (Cookie) aktiv. */
  pro: boolean;
  /** Kostenlose Testphase aktiv. */
  trial: boolean;
  /** Ende der Testphase (falls ein Erst-Login bekannt ist). */
  trialEnd?: Date;
  /** Pro gültig bis (falls bezahlt). */
  proUntil?: Date;
}

/**
 * Kombinierter Zugriffs-Status: bezahltes Pro ODER laufende Testphase.
 * Gate-Flächen (Wettbewerb, Bid-Advisor) sind frei, solange `pro || trial`.
 */
export async function getAccess(userId: string): Promise<Access> {
  if (FREE_BETA) return { pro: true, trial: false };

  const ent = await getEntitlement();
  const paidPro = !!ent && ent.userId === userId;

  // Referral-Bonus zählt wie Pro, solange das Bonus-Ende in der Zukunft liegt.
  const bonusUntil = await getReferralBonusUntil(userId);
  const bonusActive = !!bonusUntil && Date.now() < bonusUntil.getTime();

  const pro = paidPro || bonusActive;
  const proUntil = paidPro
    ? new Date(ent!.exp * 1000)
    : bonusActive
    ? bonusUntil!
    : undefined;

  const trialStartIso = await getTrialStart(userId);
  let trial = false;
  let trialEnd: Date | undefined;
  if (trialStartIso) {
    trialEnd = trialEndFor(trialStartIso);
    trial = Date.now() < trialEnd.getTime();
  }

  return { pro, trial, trialEnd, proUntil };
}
