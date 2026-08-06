import { kv } from "@vercel/kv";
import { z } from "zod";

const MAX_SLOTS = 30;
const MAX_SELLS = 50;
const KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export interface PlannerState {
  slots: Record<string, string | null>;
  sells: string[];
}

export interface StoredPlannerState extends PlannerState {
  updatedAt: number;
}

const g = globalThis as unknown as {
  __bbPlan?: Map<string, StoredPlannerState>;
};
const mem = g.__bbPlan ?? (g.__bbPlan = new Map<string, StoredPlannerState>());

export const PlannerBody = z.object({
  // Slot-IDs wie "gk1" und Spieler-IDs sind kurze Strings – die Längen-Caps
  // verhindern, dass ein eingeloggter User den KV-Value aufbläht.
  slots: z.record(z.string().max(50), z.string().max(50).nullable()),
  sells: z.array(z.string().max(50)),
});

const StoredPlannerBody = PlannerBody.extend({
  updatedAt: z.number(),
});

export type PlannerValidationResult =
  | { ok: true; data: PlannerState }
  | { ok: false; error: "INVALID_INPUT" | "TOO_LARGE" };

function planKey(userId: string, leagueId: string): string {
  return `user:${userId}:plan:${leagueId}`;
}

export function validatePlannerBody(input: unknown): PlannerValidationResult {
  const parsed = PlannerBody.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  if (
    Object.keys(parsed.data.slots).length > MAX_SLOTS ||
    parsed.data.sells.length > MAX_SELLS
  ) {
    return { ok: false, error: "TOO_LARGE" };
  }

  return { ok: true, data: parsed.data };
}

type LoadPlannerResult =
  | { ok: false }
  | { ok: true; plan: StoredPlannerState | null };

function normalizeStored(value: unknown): StoredPlannerState | null {
  const parsed = StoredPlannerBody.safeParse(value);
  if (!parsed.success) return null;

  const plan = validatePlannerBody({
    slots: parsed.data.slots,
    sells: parsed.data.sells,
  });
  if (!plan.ok) return null;

  return { ...plan.data, updatedAt: parsed.data.updatedAt };
}

export async function loadPlannerPlan(
  userId: string,
  leagueId: string
): Promise<LoadPlannerResult> {
  try {
    const key = planKey(userId, leagueId);
    if (KV) {
      return { ok: true, plan: normalizeStored(await kv.get<StoredPlannerState>(key)) };
    }

    if (!mem.has(key)) return { ok: true, plan: null };
    return { ok: true, plan: normalizeStored(mem.get(key)) };
  } catch {
    return { ok: false };
  }
}

export async function savePlannerPlan(
  userId: string,
  leagueId: string,
  plan: PlannerState
): Promise<boolean> {
  try {
    const key = planKey(userId, leagueId);
    const next = { ...plan, updatedAt: Date.now() };
    if (KV) {
      await kv.set(key, next);
    } else {
      mem.set(key, next);
    }
    return true;
  } catch {
    return false;
  }
}
