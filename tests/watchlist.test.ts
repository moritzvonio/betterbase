import { afterEach, describe, expect, it, vi } from "vitest";
import { getWatched, unwatchPlayer, watchPlayer } from "../lib/watchlist";

/**
 * Simuliert den Server-Component-Fall: das Cookie ist LESBAR, aber
 * `cookies().delete()` wirft (Next erlaubt Cookie-Mutation nur in Server
 * Actions und Route Handlern). Genau in dieser Konstellation überlebt das
 * alte `bb_watch` die Migration.
 */
const cookieJar: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar[name] !== undefined ? { value: cookieJar[name] } : undefined,
    delete: () => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    },
  }),
}));

function watchMem() {
  return (globalThis as unknown as {
    __bbWatch?: Map<string, string[]>;
  }).__bbWatch;
}

afterEach(() => {
  watchMem()?.clear();
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
});

describe("watchlist", () => {
  it("schreibt und entfernt pro User-Key getrennt", async () => {
    await watchPlayer("user-a", "player-1");
    await watchPlayer("user-b", "player-2");
    await watchPlayer("user-a", "player-3");

    expect(watchMem()?.get("user:user-a:watchlist")).toEqual(["player-3", "player-1"]);
    expect(watchMem()?.get("user:user-b:watchlist")).toEqual(["player-2"]);

    await unwatchPlayer("user-a", "player-1");

    expect(await getWatched("user-a")).toEqual(["player-3"]);
    expect(await getWatched("user-b")).toEqual(["player-2"]);
  });

  it("kappt auf 50 Spieler", async () => {
    for (let i = 1; i <= 55; i++) {
      await watchPlayer("cap-user", `player-${i}`);
    }

    const list = await getWatched("cap-user");

    expect(list).toHaveLength(50);
    expect(list[0]).toBe("player-55");
    expect(list[49]).toBe("player-6");
    expect(list).not.toContain("player-5");
  });

  it("liefert für leere User eine leere Liste", async () => {
    await expect(getWatched("empty-user")).resolves.toEqual([]);
  });
});

describe("watchlist: Cookie-Migration", () => {
  it("übernimmt den Cookie-Bestand beim ersten Zugriff", async () => {
    cookieJar["bb_watch"] = "p1,p2, p3 ,,p2";
    const list = await getWatched("mig-user");

    // dedupliziert und getrimmt
    expect(list).toEqual(["p1", "p2", "p3"]);
    expect(watchMem()?.get("user:mig-user:watchlist")).toEqual(["p1", "p2", "p3"]);
  });

  it("holt einen entfernten Spieler NICHT aus dem alten Cookie zurück", async () => {
    // Cookie bleibt liegen, weil delete() in Server Components wirft.
    cookieJar["bb_watch"] = "p1,p2";

    expect(await getWatched("res-user")).toEqual(["p1", "p2"]);
    expect(cookieJar["bb_watch"]).toBe("p1,p2"); // Cookie hat überlebt

    await unwatchPlayer("res-user", "p1");
    expect(await getWatched("res-user")).toEqual(["p2"]);

    // Und jetzt der eigentliche Punkt: alles entfernen, Liste bleibt leer.
    await unwatchPlayer("res-user", "p2");
    expect(await getWatched("res-user")).toEqual([]);
    expect(await getWatched("res-user")).toEqual([]);
  });

  it("migriert den Altbestand auch, wenn der erste Zugriff ein watchPlayer ist", async () => {
    cookieJar["bb_watch"] = "alt1,alt2";
    await watchPlayer("neu-user", "neu1");

    // watchPlayer liest zuerst über getWatched, also greift die Migration -
    // der neue Spieler landet obenauf, der Altbestand bleibt erhalten.
    expect(await getWatched("neu-user")).toEqual(["neu1", "alt1", "alt2"]);
  });

  it("ignoriert das Cookie, sobald der User einen eigenen Bestand hat", async () => {
    await watchPlayer("hat-schon", "eigen1");
    // Cookie taucht erst NACH dem ersten eigenen Eintrag auf.
    cookieJar["bb_watch"] = "alt1,alt2";

    expect(await getWatched("hat-schon")).toEqual(["eigen1"]);
  });
});
