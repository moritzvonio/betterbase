"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const norm = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(norm);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const controller = new AbortController();

    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (active) setSupported(ok);
    if (!ok) return;

    async function loadState() {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        if (!reg) throw new Error("NO_REGISTRATION");
        const sub = await reg.pushManager.getSubscription();
        if (active) setEnabled(!!sub);
      } catch {
        try {
          const r = await fetch("/api/push/subscribe", { signal: controller.signal });
          if (!r.ok) return;
          const d = await r.json();
          if (active) setEnabled(!!d.subscribed);
        } catch {
          // Best-effort Fallback: Wenn weder Browser noch Server antworten,
          // bleibt der Toggle im sicheren Standardzustand.
        }
      }
    }

    void loadState();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function enable() {
    setError(null);
    if (!VAPID_PUBLIC_KEY) {
      setError("VAPID_PUBLIC_KEY fehlt – bitte Admin kontaktieren.");
      return;
    }
    if (Notification.permission === "denied") {
      setError("Benachrichtigungen sind im Browser blockiert. In den Browser-Einstellungen freigeben.");
      return;
    }
    const perm =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (perm !== "granted") {
      setError("Benachrichtigungen wurden nicht erlaubt.");
      return;
    }

    let reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    }
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
      }));

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys) {
      setError("Subscription konnte nicht erstellt werden.");
      return;
    }
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });
    if (!r.ok) {
      setError("Server konnte Subscription nicht speichern.");
      return;
    }
    setEnabled(true);
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const existing = await reg?.pushManager.getSubscription();
    const endpoint = existing?.endpoint;
    if (!existing || !endpoint) {
      setEnabled(false);
      return;
    }

    await existing.unsubscribe();
    // Abgemeldet ist abgemeldet: der Browser hat die Subscription schon
    // verworfen. Scheitert das Aufräumen auf dem Server, darf der Schalter
    // trotzdem nicht auf "aktiv" stehen bleiben.
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
    setEnabled(false);
  }

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Push-Notifications werden in diesem Browser nicht unterstützt.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant={enabled ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={() => start(enabled ? disable : enable)}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : enabled ? (
          <BellOff className="size-4" />
        ) : (
          <Bell className="size-4" />
        )}
        {enabled ? "Push deaktivieren" : "Push aktivieren"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
