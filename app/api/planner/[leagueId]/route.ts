import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  loadPlannerPlan,
  savePlannerPlan,
  validatePlannerBody,
} from "@/lib/planner-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { leagueId } = await params;
  const stored = await loadPlannerPlan(s.userId, leagueId);

  // "Speicher gerade nicht erreichbar" ist NICHT "der Nutzer hat noch keinen
  // Plan". Wer beides als `plan: null` ausliefert, sagt dem Client "hier ist
  // nichts, lad deinen lokalen Stand hoch" - und ein transienter KV-Fehler
  // würde einen echten Server-Plan mit einem älteren lokalen überschreiben.
  if (!stored.ok) {
    return NextResponse.json({ error: "STORE_UNAVAILABLE" }, { status: 503 });
  }
  if (stored.plan === null) {
    return NextResponse.json({ plan: null });
  }

  const { updatedAt, ...plan } = stored.plan;
  return NextResponse.json({ plan, updatedAt });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const body = validatePlannerBody(input);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 });
  }

  const { leagueId } = await params;
  const saved = await savePlannerPlan(s.userId, leagueId, body.data);
  return NextResponse.json({ ok: saved });
}
