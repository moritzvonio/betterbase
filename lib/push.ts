/**
 * Usergebundene Push-Subscriptions.
 *
 * Speichert bis zu fünf Geräte pro Kickbase-User in KV. Lokal läuft derselbe
 * Code über einen globalThis-Singleton, damit Route Handler und RSC im Dev
 * denselben Zustand sehen.
 *
 * Keine Migration vom alten Push-Cookie: Mangels Sende-Pfad wurde Push
 * nie produktiv genutzt, bestehende Cookies laufen einfach aus.
 */

import { kv } from "@vercel/kv";

const MAX = 5;
const KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const g = globalThis as unknown as {
  __bbPush?: Map<string, StoredPushSubscription[]>;
};
const mem = g.__bbPush ?? (g.__bbPush = new Map<string, StoredPushSubscription[]>());

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  createdAt: number;
}

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt?: number;
};

function pushKey(userId: string): string {
  return `user:${userId}:push`;
}

function normalize(userId: string, list: StoredPushSubscription[]): StoredPushSubscription[] {
  const byEndpoint = new Map<string, StoredPushSubscription>();
  for (const sub of list) {
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue;
    byEndpoint.set(sub.endpoint, { ...sub, userId });
  }

  return Array.from(byEndpoint.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX);
}

/**
 * `{ ok: false }` = Speicher nicht erreichbar.
 * `list: null` = für diesen User wurde noch NIE etwas geschrieben.
 * `list: []`   = es wurde geschrieben und ist bewusst leer.
 */
type LoadResult = { ok: false } | { ok: true; list: StoredPushSubscription[] | null };

async function loadPushSubscriptions(userId: string): Promise<LoadResult> {
  try {
    const key = pushKey(userId);
    if (KV) {
      const list = await kv.get<StoredPushSubscription[]>(key);
      return { ok: true, list: Array.isArray(list) ? normalize(userId, list) : null };
    }
    const stored = mem.get(key);
    return { ok: true, list: stored ? normalize(userId, stored) : null };
  } catch {
    return { ok: false };
  }
}

async function savePushList(
  userId: string,
  list: StoredPushSubscription[]
): Promise<boolean> {
  try {
    const key = pushKey(userId);
    const next = normalize(userId, list);
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

export async function addPushSubscription(
  userId: string,
  sub: PushSubscriptionInput
): Promise<void> {
  const res = await loadPushSubscriptions(userId);
  if (!res.ok) return;

  const createdAt = sub.createdAt ?? Math.floor(Date.now() / 1000);
  const current = res.list ?? [];
  const next = [
    ...current.filter((item) => item.endpoint !== sub.endpoint),
    { ...sub, userId, createdAt },
  ];

  // Cap 5 Geräte: Beim sechsten Gerät fällt der älteste Eintrag nach
  // `createdAt` raus. Derselbe Endpoint wird vorher ersetzt, nicht dupliziert.
  await savePushList(userId, next);
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const res = await loadPushSubscriptions(userId);
  if (!res.ok || res.list === null) return;

  await savePushList(
    userId,
    res.list.filter((sub) => sub.endpoint !== endpoint)
  );
}

export async function getPushSubscriptions(
  userId: string
): Promise<StoredPushSubscription[]> {
  const res = await loadPushSubscriptions(userId);
  if (!res.ok || res.list === null) return [];
  return res.list;
}
