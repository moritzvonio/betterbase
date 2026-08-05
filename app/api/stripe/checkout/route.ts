import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { FREE_BETA } from "@/lib/entitlement";
import { getStripe, STRIPE_PRICES, planFromString } from "@/lib/stripe";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const Body = z.object({
  plan: z.enum(["hinrunde-2627", "rueckrunde-2627"]),
});

export async function POST(req: Request) {
  // Offene Beta: es darf niemand für etwas zahlen, das gerade gratis ist –
  // Kill-Switch VOR jeder Stripe-Interaktion.
  if (FREE_BETA) {
    return NextResponse.json(
      {
        error: "BETA_FREE",
        message: "Ligabase ist in der offenen Beta kostenlos – es gibt nichts zu kaufen.",
      },
      { status: 503 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error: "STRIPE_NOT_CONFIGURED",
        message: "Der Kauf ist gerade nicht verfügbar. Schau später vorbei.",
      },
      { status: 503 }
    );
  }

  let body;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const plan = planFromString(body.plan);
  if (!plan) return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });

  const priceId = STRIPE_PRICES[plan];
  if (!priceId) {
    return NextResponse.json(
      {
        error: "PRICE_NOT_CONFIGURED",
        message: "Der Kauf ist gerade nicht verfügbar. Schau später vorbei.",
      },
      { status: 503 }
    );
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/upgrade?canceled=1`,
    client_reference_id: session.userId,
    customer_email: session.email ?? undefined,
    metadata: {
      kb_user_id: session.userId,
      plan,
    },
    locale: "de",
    allow_promotion_codes: true,
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "NO_CHECKOUT_URL" }, { status: 500 });
  }
  return NextResponse.json({ url: checkout.url });
}
