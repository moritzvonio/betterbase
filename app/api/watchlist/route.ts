import { NextResponse } from "next/server";
import { z } from "zod";
import { getWatched, watchPlayer, unwatchPlayer } from "@/lib/watchlist";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const list = await getWatched(s.userId);
  return NextResponse.json({ players: list });
}

const Body = z.object({
  playerId: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const next =
    body.action === "add"
      ? await watchPlayer(s.userId, body.playerId)
      : await unwatchPlayer(s.userId, body.playerId);
  return NextResponse.json({ ok: true, players: next });
}
