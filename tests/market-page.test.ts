import { describe, expect, it, vi } from "vitest";

const { getRecentNewsForPlayersMock } = vi.hoisted(() => ({
  getRecentNewsForPlayersMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSessionOrRedirect: vi.fn(async () => ({
    token: "test-token",
    userId: "test-user",
  })),
  withKbAuth: vi.fn(async (_path: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@/lib/kickbase/api", () => ({
  kb: {
    market: vi.fn(async () => ({
      it: [
        {
          pi: "player-1",
          n: "Testspieler",
          pos: 1,
          mv: 1_000_000,
          prc: 1_000_000,
          tid: "team-1",
        },
      ],
    })),
    player: vi.fn(async () => ({ tp: 100, ap: 50, g: 1, a: 2 })),
    marketValue: vi.fn(async () => ({ it: [] })),
    competitionPlayers: vi.fn(async () => ({ it: [] })),
  },
}));

vi.mock("@/lib/news/store", () => ({
  getRecentNewsForPlayers: getRecentNewsForPlayersMock,
}));

import MarketPage from "../app/league/[id]/markt/page";

describe("MarketPage", () => {
  it("renders without news when the optional news store is unavailable", async () => {
    getRecentNewsForPlayersMock.mockRejectedValueOnce(
      new Error("News store unavailable")
    );

    await expect(
      MarketPage({
        params: Promise.resolve({ id: "league-1" }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeTruthy();
  });

  it("does not pass event handlers from the server page to the news badge", async () => {
    getRecentNewsForPlayersMock.mockResolvedValueOnce([
      {
        publishedAt: new Date(),
        playerIds: ["player-1"],
      },
    ]);

    const page = await MarketPage({
      params: Promise.resolve({ id: "league-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(hasFunctionProp(page, "onClick")).toBe(false);
  });
});

function hasFunctionProp(value: unknown, propName: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasFunctionProp(item, propName));
  }
  if (!value || typeof value !== "object") return false;

  const props = (value as { props?: Record<string, unknown> }).props;
  if (!props) return false;
  if (typeof props[propName] === "function") return true;
  return hasFunctionProp(props.children, propName);
}
