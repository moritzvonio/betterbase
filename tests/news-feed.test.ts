import { describe, expect, it, vi } from "vitest";

const { getRecentNewsMock } = vi.hoisted(() => ({
  getRecentNewsMock: vi.fn(),
}));

vi.mock("@/lib/news/store", () => ({
  getRecentNews: getRecentNewsMock,
}));

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://ligabase.test" },
}));

import { GET } from "../app/news/feed.xml/route";

describe("GET /news/feed.xml", () => {
  it("returns a valid empty feed when the optional news store is unavailable", async () => {
    getRecentNewsMock.mockRejectedValueOnce(
      new Error("Upstash max requests limit exceeded")
    );

    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8"
    );
    expect(xml).toContain("<rss version=\"2.0\">");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("https://ligabase.test/news/feed.xml");
    expect(xml).not.toContain("<item>");
    expect(xml).toContain("</rss>");
  });
});
