import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredPushSubscription } from "../lib/push";

type PushModule = typeof import("../lib/push");

let push: PushModule;

function pushMem() {
  return (globalThis as unknown as {
    __bbPush?: Map<string, StoredPushSubscription[]>;
  }).__bbPush;
}

function sub(endpoint: string) {
  return {
    endpoint,
    keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  push = await import("../lib/push");
  pushMem()?.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  pushMem()?.clear();
});

describe("push subscriptions", () => {
  it("speichert zwei verschiedene Endpoints desselben Users als zwei Einträge", async () => {
    await push.addPushSubscription("user-a", sub("https://push.example/a"));
    await push.addPushSubscription("user-a", sub("https://push.example/b"));

    const list = await push.getPushSubscriptions("user-a");

    expect(list).toHaveLength(2);
    expect(list.map((item) => item.endpoint).sort()).toEqual([
      "https://push.example/a",
      "https://push.example/b",
    ]);
  });

  it("ersetzt denselben Endpoint statt ihn zu duplizieren", async () => {
    const endpoint = "https://push.example/dedupe";

    await push.addPushSubscription("user-a", {
      endpoint,
      keys: { p256dh: "old-p256dh", auth: "old-auth" },
    });
    await push.addPushSubscription("user-a", {
      endpoint,
      keys: { p256dh: "new-p256dh", auth: "new-auth" },
    });

    const list = await push.getPushSubscriptions("user-a");

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      endpoint,
      keys: { p256dh: "new-p256dh", auth: "new-auth" },
    });
  });

  it("kappt auf die fünf jüngsten Geräte", async () => {
    vi.useFakeTimers();
    const start = Date.parse("2026-01-01T12:00:00Z");

    for (let i = 1; i <= 6; i++) {
      vi.setSystemTime(new Date(start + i * 1000));
      await push.addPushSubscription("cap-user", sub(`https://push.example/device-${i}`));
    }

    const list = await push.getPushSubscriptions("cap-user");

    expect(list).toHaveLength(5);
    expect(list.map((item) => item.endpoint)).toEqual([
      "https://push.example/device-6",
      "https://push.example/device-5",
      "https://push.example/device-4",
      "https://push.example/device-3",
      "https://push.example/device-2",
    ]);
    expect(list.map((item) => item.endpoint)).not.toContain("https://push.example/device-1");
  });

  it("entfernt genau ein Gerät und ignoriert unbekannte Endpoints", async () => {
    await push.addPushSubscription("user-a", sub("https://push.example/a"));
    await push.addPushSubscription("user-a", sub("https://push.example/b"));
    await push.addPushSubscription("user-a", sub("https://push.example/c"));

    await push.removePushSubscription("user-a", "https://push.example/b");
    expect((await push.getPushSubscriptions("user-a")).map((item) => item.endpoint).sort()).toEqual([
      "https://push.example/a",
      "https://push.example/c",
    ]);

    await expect(
      push.removePushSubscription("user-a", "https://push.example/unknown")
    ).resolves.toBeUndefined();
    expect((await push.getPushSubscriptions("user-a")).map((item) => item.endpoint).sort()).toEqual([
      "https://push.example/a",
      "https://push.example/c",
    ]);
  });

  it("trennt verschiedene User-IDs voneinander", async () => {
    await push.addPushSubscription("user-a", sub("https://push.example/a"));
    await push.addPushSubscription("user-b", sub("https://push.example/b"));
    await push.addPushSubscription("user-a", sub("https://push.example/c"));

    expect((await push.getPushSubscriptions("user-a")).map((item) => item.endpoint).sort()).toEqual([
      "https://push.example/a",
      "https://push.example/c",
    ]);
    expect(await push.getPushSubscriptions("user-b")).toMatchObject([
      { endpoint: "https://push.example/b", userId: "user-b" },
    ]);
  });
});
