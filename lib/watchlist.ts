/**
 * Usergebundene Watchlist.
 *
 * Speichert Spieler-IDs pro Kickbase-User in KV. Lokal läuft derselbe Code über
 * einen globalThis-Singleton, damit Route Handler und RSC im Dev denselben
 * Zustand sehen.
 */

import { kv } from "@vercel/kv";
import { cookies } from "next/headers";

const COOKIE = "bb_watch";
const MAX = 50;
const KV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

const g = globalThis as unknown as {
  __bbWatch?: Map<string, string[]>;
};
const mem = g.__bbWatch ?? (g.__bbWatch = new Map<string, string[]>());

function watchKey(userId: string): string {
  return `user:${userId}:watchlist`;
}

function normalize(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean))).slice(0, MAX);
}

function parseCookie(value: string | undefined): string[] {
  if (!value) return [];
  return normalize(value.split(","));
}

/**
 * `{ ok: false }` = Speicher nicht erreichbar.
 * `list: null` = für diesen User wurde noch NIE etwas geschrieben.
 * `list: []`   = es wurde geschrieben und ist bewusst leer.
 *
 * Die Unterscheidung ist nicht kosmetisch: sie entscheidet, ob das alte Cookie
 * noch einmal migriert werden darf. Wer beide Fälle zu `[]` zusammenwirft, holt
 * beim nächsten Laden gelöschte Spieler aus dem Cookie zurück.
 */
type LoadResult = { ok: false } | { ok: true; list: string[] | null };

async function loadWatched(userId: string): Promise<LoadResult> {
  try {
    const key = watchKey(userId);
    if (KV) {
      const list = await kv.get<string[]>(key);
      return { ok: true, list: Array.isArray(list) ? normalize(list) : null };
    }
    const stored = mem.get(key);
    return { ok: true, list: stored ? normalize(stored) : null };
  } catch {
    return { ok: false };
  }
}

async function readLegacyCookie(): Promise<string[]> {
  try {
    const jar = await cookies();
    return parseCookie(jar.get(COOKIE)?.value);
  } catch {
    return [];
  }
}

async function deleteLegacyCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(COOKIE);
  } catch {
    // In Server Components darf cookies().delete() werfen. Der KV-Write zählt;
    // ein liegengebliebenes Cookie ist harmlos, weil KV danach nicht mehr leer
    // ist und das Cookie nicht erneut migriert wird.
  }
}

async function setWatched(userId: string, list: string[]): Promise<boolean> {
  try {
    const key = watchKey(userId);
    const next = normalize(list);
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

export async function getWatched(userId: string): Promise<string[]> {
  const res = await loadWatched(userId);
  if (!res.ok) return [];
  // Sobald für den User einmal geschrieben wurde, ist KV die Wahrheit - auch
  // wenn die Liste leer ist. Sonst würde ein bewusst entfernter Spieler beim
  // nächsten Laden aus dem alten Cookie zurückkehren (das Cookie überlebt
  // die Migration, weil cookies().delete() in Server Components nicht geht).
  if (res.list !== null) return res.list;

  // Kein Altbestand: nichts schreiben. Ein neues `bb_watch` kann nicht mehr
  // entstehen (wir setzen das Cookie nirgends mehr), also gibt es hier auch
  // nichts, was später zurückkehren könnte.
  const legacy = await readLegacyCookie();
  if (legacy.length === 0) return [];

  // Akzeptierter Randfall: Hat derselbe User auf zwei Geräten unterschiedliche
  // Cookie-Bestände, migriert nur das erste Gerät. Beim zweiten ist KV nicht
  // mehr leer, sein Cookie-Bestand wird verworfen.
  const migrated = normalize(legacy);
  const saved = await setWatched(userId, migrated);
  if (!saved) return [];

  await deleteLegacyCookie();
  return migrated;
}

export async function isWatched(userId: string, playerId: string): Promise<boolean> {
  const list = await getWatched(userId);
  return list.includes(playerId);
}

export async function watchPlayer(userId: string, playerId: string): Promise<string[]> {
  const list = await getWatched(userId);
  if (list.includes(playerId)) return list;
  const next = normalize([playerId, ...list]);
  return (await setWatched(userId, next)) ? next : list;
}

export async function unwatchPlayer(userId: string, playerId: string): Promise<string[]> {
  const list = await getWatched(userId);
  const next = normalize(list.filter((id) => id !== playerId));
  return (await setWatched(userId, next)) ? next : list;
}
