import { beforeEach, describe, expect, it, vi } from "vitest";

// "@/lib/session" (Routen) und "../lib/session" (Test) sind dieselbe Datei –
// vitest dedupliziert über die aufgelöste Modul-ID, der Mock greift für beide.
vi.mock("../lib/session", () => ({
  getSession: vi.fn(async () => null),
}));

// lib/watchlist.ts liest Cookies; delete() wirft in Server Components – der
// Mock bildet genau dieses Laufzeitverhalten nach.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => {
      throw new Error("cookies can only be modified in a Server Action");
    },
  }),
}));

import { getSession } from "../lib/session";
import * as watchlistRoute from "../app/api/watchlist/route";
import * as pushRoute from "../app/api/push/subscribe/route";
import * as plannerRoute from "../app/api/planner/[leagueId]/route";

const sessionMock = vi.mocked(getSession);

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const plannerParams = { params: Promise.resolve({ leagueId: "L1" }) };

describe("Route-Gates: ohne Session immer 401", () => {
  beforeEach(() => {
    sessionMock.mockResolvedValue(null);
  });

  it("watchlist GET/POST", async () => {
    expect((await watchlistRoute.GET()).status).toBe(401);
    expect(
      (await watchlistRoute.POST(jsonReq({ playerId: "1", action: "add" }))).status
    ).toBe(401);
  });

  it("planner GET/PUT", async () => {
    expect((await plannerRoute.GET(jsonReq({}), plannerParams)).status).toBe(401);
    expect(
      (await plannerRoute.PUT(jsonReq({ slots: {}, sells: [] }), plannerParams)).status
    ).toBe(401);
  });

  it("push GET/POST/DELETE", async () => {
    expect((await pushRoute.GET()).status).toBe(401);
    expect((await pushRoute.POST(jsonReq({}))).status).toBe(401);
    expect((await pushRoute.DELETE(jsonReq({}))).status).toBe(401);
  });
});

describe("Route-Validierung: mit Session, kaputter oder aufgeblähter Body -> 400", () => {
  beforeEach(() => {
    sessionMock.mockResolvedValue({
      token: "t",
      userId: "u-route-test",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("watchlist POST", async () => {
    expect((await watchlistRoute.POST(jsonReq({ playerId: "" }))).status).toBe(400);
    expect(
      (await watchlistRoute.POST(jsonReq({ playerId: "x".repeat(51), action: "add" })))
        .status
    ).toBe(400);
  });

  it("planner PUT", async () => {
    expect(
      (await plannerRoute.PUT(jsonReq({ slots: "quatsch" }), plannerParams)).status
    ).toBe(400);
    expect(
      (
        await plannerRoute.PUT(
          jsonReq({ slots: { a: "x".repeat(51) }, sells: [] }),
          plannerParams
        )
      ).status
    ).toBe(400);
  });

  it("push POST/DELETE", async () => {
    expect((await pushRoute.POST(jsonReq({ endpoint: "kein-url" }))).status).toBe(400);
    expect(
      (
        await pushRoute.DELETE(
          jsonReq({ endpoint: "https://x.de/" + "a".repeat(2000) })
        )
      ).status
    ).toBe(400);
  });
});
