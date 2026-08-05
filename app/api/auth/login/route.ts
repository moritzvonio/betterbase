import { NextResponse } from "next/server";
import { z } from "zod";
import { kb } from "@/lib/kickbase/api";
import { KickbaseError } from "@/lib/kickbase/client";
import { decodeKickbaseToken, setSessionCookie } from "@/lib/session";
import { recordLogin } from "@/lib/admin/analytics";
import { FREE_BETA, recordFirstLoginTrial } from "@/lib/entitlement";
import { creditReferral } from "@/lib/referral";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort fehlt"),
  ref: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: e instanceof z.ZodError ? e.issues[0]?.message : "Ungültige Anfrage" },
      { status: 400 }
    );
  }

  let resp;
  try {
    resp = await kb.login({ em: parsed.email, pass: parsed.password });
  } catch (e) {
    if (e instanceof KickbaseError && e.status === 401) {
      return NextResponse.json(
        { error: "AUTH_FAILED", message: "E-Mail oder Passwort falsch." },
        { status: 401 }
      );
    }
    if (e instanceof KickbaseError && e.status >= 500) {
      return NextResponse.json(
        { error: "KICKBASE_DOWN", message: "Kickbase-API antwortet gerade nicht. Bitte gleich nochmal." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "UNKNOWN", message: e instanceof Error ? e.message : "Unbekannter Fehler" },
      { status: 500 }
    );
  }

  const token = resp.token ?? resp.tkn;
  if (!token) {
    return NextResponse.json(
      { error: "NO_TOKEN", message: "Login OK, aber Kickbase hat keinen Token zurückgegeben." },
      { status: 502 }
    );
  }

  const decoded = decodeKickbaseToken(token);
  const user = resp.user ?? resp.u ?? {};
  const userId = decoded.uid ?? user.i ?? user.id;
  if (!userId) {
    return NextResponse.json(
      { error: "NO_USER_ID", message: "Login OK, aber keine User-ID vom Kickbase-Token lesbar." },
      { status: 502 }
    );
  }

  const displayName = decoded.name ?? user.n ?? user.name;
  await setSessionCookie({
    token,
    userId,
    name: displayName,
    email: parsed.email,
    exp: decoded.exp ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 6,
  });

  // First-Party-Analytics: Login protokollieren (best-effort, blockiert nie)
  await recordLogin(userId, displayName).catch(() => {});
  // Testphasen-Start festhalten (nur beim allerersten Login, best-effort);
  // Rückgabe = ob dies der Erstlogin war (für die Referral-Gutschrift).
  const isFirstLogin = await recordFirstLoginTrial(userId).catch(() => false);

  // Referral: nur beim Erstlogin, kein Selbst-Referral. In der offenen Beta
  // ausgesetzt – sonst entstehen stille 14-Tage-Boni, die beim späteren
  // Pricing-Start unerklärt aufpoppen würden.
  if (!FREE_BETA && isFirstLogin && parsed.ref && parsed.ref !== userId) {
    await creditReferral(parsed.ref).catch(() => {});
  }

  // Onboarding: bei genau EINER Liga direkt ins Dashboard leiten (best-effort,
  // 2s-Timeout – der Login darf hieran NIE scheitern).
  let leagueCount: number | undefined;
  let firstLeagueId: string | undefined;
  try {
    const list = await Promise.race([
      kb.leagues(token),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("leagues-timeout")), 2000)
      ),
    ]);
    const items = (list as { it?: Array<{ i: string }> }).it ?? [];
    leagueCount = items.length;
    firstLeagueId = items[0]?.i;
  } catch {
    // ignorieren – Fallback ist /leagues
  }

  return NextResponse.json({
    ok: true,
    user: { id: userId, name: decoded.name ?? user.n ?? user.name ?? null },
    leagueCount,
    firstLeagueId,
  });
}
