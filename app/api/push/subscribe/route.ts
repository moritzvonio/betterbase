import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  addPushSubscription,
  getPushSubscriptions,
  removePushSubscription,
} from "@/lib/push";

export const runtime = "nodejs";

const Body = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
});

const DeleteBody = z.object({
  endpoint: z.string().url().max(2000),
});

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Serverstatus meint: Der User hat irgendein Gerät registriert. Ob dieses
  // konkrete Gerät aktiv ist, prüft der Client über pushManager.getSubscription().
  const subscriptions = await getPushSubscriptions(s.userId);
  return NextResponse.json({ subscribed: subscriptions.length > 0 });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  await addPushSubscription(s.userId, {
    endpoint: body.endpoint,
    keys: body.keys,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body;
  try {
    body = DeleteBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  await removePushSubscription(s.userId, body.endpoint);
  return NextResponse.json({ ok: true });
}
