"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TeamTag } from "@/components/ui/team-tag";
import { PositionBadge } from "@/components/ui/position-icon";
import { formatEUR, formatDelta, cn } from "@/lib/utils";
import { POSITION_LABELS, teamMeta } from "@/lib/kickbase/types";
import { PlayerAvatar } from "@/components/ui/player-avatar";
import {
  Wallet,
  TrendingUp,
  ArrowDown,
  RotateCcw,
  Tag,
  X,
  Calendar,
  AlertTriangle,
  Layers,
  Users,
} from "lucide-react";

export interface PlannerPlayer {
  id: string;
  name: string;
  pos: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
  mv: number;
  ap?: number;
  tp?: number;
  tid: string;
  pim?: string;
  /** Lineup order from Kickbase (0 bench, 1..11 field) */
  lo?: number;
  isCaptain?: boolean;
  st?: number;
  /** Next opponent home */
  next1?: string;
  /** Next opponent away */
  next2?: string;
  tfhmvt?: number;
  mvgl?: number;
}

type FormationKey = "4-4-2" | "4-3-3" | "3-5-2" | "3-4-3" | "5-3-2" | "5-4-1" | "4-5-1";

const FORMATIONS: Record<FormationKey, { def: number; mid: number; fwd: number }> = {
  "4-4-2": { def: 4, mid: 4, fwd: 2 },
  "4-3-3": { def: 4, mid: 3, fwd: 3 },
  "3-5-2": { def: 3, mid: 5, fwd: 2 },
  "3-4-3": { def: 3, mid: 4, fwd: 3 },
  "4-5-1": { def: 4, mid: 5, fwd: 1 },
  "5-3-2": { def: 5, mid: 3, fwd: 2 },
  "5-4-1": { def: 5, mid: 4, fwd: 1 },
};

const POS_FOR_SLOT: Record<string, number> = {};
function buildSlotIds(formation: FormationKey): string[] {
  const f = FORMATIONS[formation];
  const ids: string[] = ["GK"];
  POS_FOR_SLOT["GK"] = 1;
  for (let i = 1; i <= f.def; i++) {
    const id = `D${i}`;
    ids.push(id);
    POS_FOR_SLOT[id] = 2;
  }
  for (let i = 1; i <= f.mid; i++) {
    const id = `M${i}`;
    ids.push(id);
    POS_FOR_SLOT[id] = 3;
  }
  for (let i = 1; i <= f.fwd; i++) {
    const id = `F${i}`;
    ids.push(id);
    POS_FOR_SLOT[id] = 4;
  }
  return ids;
}

interface Counts {
  g: number;
  d: number;
  m: number;
  f: number;
}

function countByPos(
  slots: Record<string, string | null>,
  playerById: Map<string, PlannerPlayer>
): Counts {
  const c: Counts = { g: 0, d: 0, m: 0, f: 0 };
  for (const pid of Object.values(slots)) {
    if (!pid) continue;
    const p = playerById.get(pid);
    if (!p) continue;
    if (p.pos === 1) c.g++;
    else if (p.pos === 2) c.d++;
    else if (p.pos === 3) c.m++;
    else if (p.pos === 4) c.f++;
  }
  return c;
}

/**
 * Wähle die Formation, die alle aktuellen Counts aufnimmt mit minimalem
 * "Waste" (= Anzahl ungenutzter Slots). Liefert null wenn keine Formation
 * die Counts aufnehmen kann (z.B. > 5 DEF aufgestellt).
 */
function deriveFormation(d: number, m: number, f: number): FormationKey | null {
  let best: { key: FormationKey; waste: number } | null = null;
  for (const [key, F] of Object.entries(FORMATIONS) as [
    FormationKey,
    (typeof FORMATIONS)[FormationKey],
  ][]) {
    if (F.def >= d && F.mid >= m && F.fwd >= f) {
      const waste = F.def - d + (F.mid - m) + (F.fwd - f);
      if (!best || waste < best.waste) best = { key, waste };
    }
  }
  return best?.key ?? null;
}

/** Kann ein Spieler dieser Position zusätzlich auf den Pitch? */
function canPlacePos(pos: number, c: Counts): boolean {
  if (c.g + c.d + c.m + c.f >= 11) return false;
  let ng = c.g,
    nd = c.d,
    nm = c.m,
    nf = c.f;
  if (pos === 1) ng++;
  else if (pos === 2) nd++;
  else if (pos === 3) nm++;
  else if (pos === 4) nf++;
  if (ng > 1) return false;
  return deriveFormation(nd, nm, nf) !== null;
}

interface PlannerState {
  /** slotId → playerId (or null) */
  slots: Record<string, string | null>;
  /** player ids marked for sale */
  sells: string[];
}

function serializePlannerState(state: PlannerState): string {
  return JSON.stringify({ slots: state.slots, sells: state.sells });
}

function parsePlannerState(value: unknown): PlannerState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PlannerState>;
  if (!candidate.slots || typeof candidate.slots !== "object" || Array.isArray(candidate.slots)) {
    return null;
  }

  const slots: Record<string, string | null> = {};
  for (const [slotId, playerId] of Object.entries(candidate.slots)) {
    if (typeof playerId === "string" || playerId === null) {
      slots[slotId] = playerId;
    }
  }
  if (Object.keys(slots).length === 0) return null;

  const sells = Array.isArray(candidate.sells)
    ? candidate.sells.filter((id): id is string => typeof id === "string")
    : [];

  return { slots, sells };
}

function readLocalPlannerState(storageKey: string): PlannerState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? parsePlannerState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocalPlannerState(storageKey: string, serialized: string): void {
  try {
    localStorage.setItem(storageKey, serialized);
  } catch {
    // ignore
  }
}

async function uploadPlannerState(
  leagueId: string,
  serialized: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const res = await fetch(`/api/planner/${encodeURIComponent(leagueId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serialized,
      signal,
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    return data?.ok === true;
  } catch {
    return false;
  }
}

function buildInitialState(players: PlannerPlayer[]): PlannerState {
  const lineup = players.filter((p) => p.lo && p.lo >= 1 && p.lo <= 11);
  const d = lineup.filter((p) => p.pos === 2).length;
  const m = lineup.filter((p) => p.pos === 3).length;
  const f = lineup.filter((p) => p.pos === 4).length;
  const formation = deriveFormation(d, m, f) ?? "4-3-3";
  const slotIds = buildSlotIds(formation);
  const slots: Record<string, string | null> = {};
  for (const id of slotIds) slots[id] = null;

  const gk = lineup.find((p) => p.pos === 1);
  if (gk) slots["GK"] = gk.id;

  const fillRow = (pos: number, prefix: string) => {
    const row = lineup
      .filter((p) => p.pos === pos)
      .sort((a, b) => (a.lo ?? 99) - (b.lo ?? 99));
    let i = 1;
    for (const p of row) {
      const slotId = `${prefix}${i}`;
      if (slots[slotId] === null) {
        slots[slotId] = p.id;
        i++;
      }
    }
  };
  fillRow(2, "D");
  fillRow(3, "M");
  fillRow(4, "F");

  return { slots, sells: [] };
}

/**
 * Spieler-IDs aus den aktuellen Slots in eine NEUE Formation übertragen.
 * Spieler, deren Position keinen Slot mehr hat, fallen auf die Bank.
 */
function reassignSlots(
  oldSlots: Record<string, string | null>,
  newFormation: FormationKey,
  playerById: Map<string, PlannerPlayer>
): Record<string, string | null> {
  const newSlotIds = buildSlotIds(newFormation);
  const newSlots: Record<string, string | null> = {};
  for (const id of newSlotIds) newSlots[id] = null;

  const byPos = new Map<number, string[]>();
  for (const pid of Object.values(oldSlots)) {
    if (!pid) continue;
    const player = playerById.get(pid);
    if (!player) continue;
    const arr = byPos.get(player.pos) ?? [];
    arr.push(pid);
    byPos.set(player.pos, arr);
  }

  for (const id of newSlotIds) {
    const reqPos = POS_FOR_SLOT[id];
    const arr = byPos.get(reqPos);
    if (arr && arr.length > 0) {
      newSlots[id] = arr.shift()!;
    }
  }
  return newSlots;
}

export function Planner({
  leagueId,
  players,
  budget,
  deadline,
  matchday,
}: {
  leagueId: string;
  players: PlannerPlayer[];
  budget: number;
  deadline?: string;
  matchday?: string | number;
}) {
  // v2: state ohne `formation` (auto-derived)
  const storageKey = `bb_plan_${leagueId}_v2`;
  const initialState = useMemo(() => buildInitialState(players), [players]);
  const [state, setState] = useState<PlannerState>(initialState);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const remoteSnapshotRef = useRef<string | null>(null);
  const skipInitialPersistRef = useRef<string | null>(null);
  // Der Hydrate-Effect darf NICHT von `initialState` abhängen: die Seite ist
  // force-dynamic, ein neuer RSC-Payload gibt `players` eine neue Identität,
  // und ein zweiter Hydrate-Lauf würde den gerade bearbeiteten Plan mit dem
  // Server-Stand überschreiben (der Upload ist um 1,5 s verzögert).
  const initialStateRef = useRef(initialState);
  useEffect(() => {
    initialStateRef.current = initialState;
  }, [initialState]);

  // Hydrate erst vom Konto, dann als Fallback aus localStorage.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Ohne Deckel bliebe der Planner bei einer hängenden Antwort dauerhaft
    // unbedienbar, weil `hydrated` jede Interaktion sperrt. Nach dem Timeout
    // läuft er wie früher rein lokal weiter.
    const hydrateTimeout = window.setTimeout(() => controller.abort(), 4000);

    async function hydrate() {
      let didHydrateFromServer = false;
      let shouldMigrateLocal = false;

      try {
        const res = await fetch(`/api/planner/${encodeURIComponent(leagueId)}`, {
          signal: controller.signal,
        });
        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { plan?: unknown } | null;
          if (cancelled) return;
          const serverPlan = parsePlannerState(data?.plan);
          if (serverPlan) {
            const serialized = serializePlannerState(serverPlan);
            remoteSnapshotRef.current = serialized;
            setState(serverPlan);
            writeLocalPlannerState(storageKey, serialized);
            didHydrateFromServer = true;
          }
          shouldMigrateLocal = !serverPlan;
        }
      } catch {
        if (cancelled) return;
      }

      if (!didHydrateFromServer && !cancelled) {
        const localPlan = readLocalPlannerState(storageKey);
        const fallbackPlan = localPlan ?? initialStateRef.current;
        const serialized = serializePlannerState(fallbackPlan);
        skipInitialPersistRef.current = serialized;

        if (localPlan) {
          setState(localPlan);
          if (shouldMigrateLocal) {
            // Eigener Controller: der Hydrate-Controller kann durch das Timeout
            // schon abgebrochen sein, der Upload soll trotzdem durchgehen.
            const uploaded = await uploadPlannerState(leagueId, serialized);
            if (uploaded) remoteSnapshotRef.current = serialized;
          }
        }
      }

      window.clearTimeout(hydrateTimeout);
      if (!cancelled) setHydrated(true);
    }

    hydrate();
    return () => {
      cancelled = true;
      window.clearTimeout(hydrateTimeout);
      controller.abort();
    };
  }, [leagueId, storageKey]);

  // Persist lokal sofort und zum Konto gebündelt.
  useEffect(() => {
    if (!hydrated) return;
    const serialized = serializePlannerState(state);
    try {
      localStorage.setItem(storageKey, serialized);
    } catch {
      // ignore
    }

    if (serialized === remoteSnapshotRef.current) return;
    if (serialized === skipInitialPersistRef.current) {
      skipInitialPersistRef.current = null;
      return;
    }

    const timeout = window.setTimeout(() => {
      uploadPlannerState(leagueId, serialized)
        .then((uploaded) => {
          if (uploaded) remoteSnapshotRef.current = serialized;
        })
        .catch(() => undefined);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [state, storageKey, hydrated, leagueId]);

  const playerById = useMemo(() => {
    const m = new Map<string, PlannerPlayer>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  // Aktuelle Formation aus den Slot-Belegungen ableiten
  const counts = useMemo(
    () => countByPos(state.slots, playerById),
    [state.slots, playerById]
  );
  const derivedFormation = useMemo(
    () => deriveFormation(counts.d, counts.m, counts.f) ?? "4-3-3",
    [counts]
  );
  const slotIds = useMemo(() => buildSlotIds(derivedFormation), [derivedFormation]);

  // Sicherstellen dass state.slots zur derived Formation passt – falls nach
  // Hydrate eine inkonsistente Slot-Belegung kommt, sauber neu bauen.
  useEffect(() => {
    const expected = new Set(slotIds);
    const actual = Object.keys(state.slots);
    const matches =
      actual.length === slotIds.length && actual.every((id) => expected.has(id));
    if (!matches) {
      setState((prev) => ({
        ...prev,
        slots: reassignSlots(prev.slots, derivedFormation, playerById),
      }));
    }
  }, [slotIds, derivedFormation, playerById, state.slots]);

  const assignedIds = new Set(Object.values(state.slots).filter(Boolean) as string[]);
  const benchPlayers = players.filter((p) => !assignedIds.has(p.id));

  const filledCount = Object.values(state.slots).filter(Boolean).length;
  const sellSet = new Set(state.sells);
  const sellValue = players
    .filter((p) => sellSet.has(p.id))
    .reduce((s, p) => s + (p.mv ?? 0), 0);
  const projectedBudget = budget + sellValue;

  /** Free-slot count per position (1=GK, 2=DEF, 3=MID, 4=FWD) */
  const freeSlotByPos = useMemo(() => {
    const m: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const slotId of slotIds) {
      if (state.slots[slotId] === null) {
        const p = POS_FOR_SLOT[slotId];
        if (p) m[p] = (m[p] ?? 0) + 1;
      }
    }
    return m;
  }, [slotIds, state.slots]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = (e: DragStartEvent) => {
    if (!hydrated) return;
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!hydrated) return;
    if (!e.over) return;
    const playerId = String(e.active.id);
    const overId = String(e.over.id);
    const player = playerById.get(playerId);
    if (!player) return;

    setState((prev) => {
      let slots = { ...prev.slots };
      // Spieler aus aktuellen Slots entfernen
      for (const k of Object.keys(slots)) {
        if (slots[k] === playerId) slots[k] = null;
      }

      if (overId === "bench") {
        return { ...prev, slots };
      }

      // Drop on a slot
      const requiredPos = POS_FOR_SLOT[overId];
      if (requiredPos !== player.pos) return prev; // Position passt nicht

      // Wenn der Slot in der aktuellen Formation existiert: einfach platzieren
      if (overId in slots) {
        slots[overId] = playerId;
        return { ...prev, slots };
      }

      // Sonst: prüfe ob durch Hinzufügen eine valide Formation entsteht
      const newCounts = countByPos(slots, playerById);
      if (player.pos === 1) newCounts.g++;
      else if (player.pos === 2) newCounts.d++;
      else if (player.pos === 3) newCounts.m++;
      else if (player.pos === 4) newCounts.f++;
      const newForm = deriveFormation(newCounts.d, newCounts.m, newCounts.f);
      if (!newForm) return prev;

      slots = reassignSlots(slots, newForm, playerById);
      // Erste freie Slot-Position für diese pos finden
      for (const id of buildSlotIds(newForm)) {
        if (slots[id] === null && POS_FOR_SLOT[id] === player.pos) {
          slots[id] = playerId;
          break;
        }
      }
      return { ...prev, slots };
    });
  };

  const removeFromSlot = (slotId: string) => {
    if (!hydrated) return;
    setState((prev) => ({ ...prev, slots: { ...prev.slots, [slotId]: null } }));
  };

  /**
   * Bank-Spieler aufstellen. Wählt automatisch eine passende Formation und
   * setzt den Spieler auf den ersten freien Position-Slot. No-op wenn keine
   * valide Formation den Spieler aufnehmen kann.
   */
  const placeOnPitch = (playerId: string) => {
    if (!hydrated) return;
    setState((prev) => {
      const player = playerById.get(playerId);
      if (!player) return prev;
      let slots = { ...prev.slots };
      // Aus aktuellen Slots entfernen (falls da)
      for (const k of Object.keys(slots)) {
        if (slots[k] === playerId) slots[k] = null;
      }
      const c = countByPos(slots, playerById);
      if (!canPlacePos(player.pos, c)) return prev;

      const nd = c.d + (player.pos === 2 ? 1 : 0);
      const nm = c.m + (player.pos === 3 ? 1 : 0);
      const nf = c.f + (player.pos === 4 ? 1 : 0);
      const newForm = deriveFormation(nd, nm, nf);
      if (!newForm) return prev;

      slots = reassignSlots(slots, newForm, playerById);
      for (const id of buildSlotIds(newForm)) {
        if (slots[id] === null && POS_FOR_SLOT[id] === player.pos) {
          slots[id] = playerId;
          break;
        }
      }
      return { ...prev, slots };
    });
  };

  const toggleSell = (playerId: string) => {
    if (!hydrated) return;
    setState((prev) => {
      const has = prev.sells.includes(playerId);
      return {
        ...prev,
        sells: has ? prev.sells.filter((id) => id !== playerId) : [...prev.sells, playerId],
      };
    });
  };

  const reset = () => {
    if (!hydrated) return;
    setState(initialState);
  };

  const sellPlayers = players.filter((p) => sellSet.has(p.id));

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-5">
        {/* KPI bar – always full width */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 slide-up">
          <KpiTile
            icon={<Layers className="size-4" />}
            label="Aufstellung"
            value={`${filledCount} / 11`}
            accent={filledCount === 11 ? "success" : filledCount > 7 ? "warning" : "danger"}
            sub={
              filledCount === 11
                ? `Komplett · ${derivedFormation}`
                : `${11 - filledCount} fehlen · ${derivedFormation}`
            }
          />
          <KpiTile
            icon={<Wallet className="size-4" />}
            label="Budget jetzt"
            value={formatEUR(budget, { compact: true })}
          />
          <KpiTile
            icon={<Tag className="size-4" />}
            label="+ Verkaufserlös"
            value={formatEUR(sellValue, { compact: true })}
            sub={state.sells.length > 0 ? `${state.sells.length} markiert` : undefined}
            accent={sellValue > 0 ? "success" : undefined}
          />
          <KpiTile
            icon={<TrendingUp className="size-4" />}
            label="= Geplantes Budget"
            value={formatEUR(projectedBudget, { compact: true })}
            accent="primary"
          />
          <DeadlineTile deadline={deadline} matchday={matchday} />
        </section>

        {/* Reset-Button (mobile) */}
        <div className="lg:hidden flex justify-end slide-up slide-up-1">
          <Button onClick={reset} variant="outline" size="sm" className="gap-1.5">
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>

        {/* Main grid: Pitch left, Right sidebar (incl. Bench) right (desktop) */}
        <section className="grid gap-4 lg:grid-cols-12 slide-up slide-up-2">
          <div className="lg:col-span-7">
            <Pitch
              slotIds={slotIds}
              formation={derivedFormation}
              slots={state.slots}
              playerById={playerById}
              sells={sellSet}
              onRemoveFromSlot={removeFromSlot}
              onToggleSell={toggleSell}
            />
          </div>

          <aside className="lg:col-span-5 space-y-3">
            {/* Geplantes Budget – prominent oben */}
            <Card className="bg-primary/[0.04] border-primary/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                      <TrendingUp className="size-5" />
                    </span>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Verfügbar nach Verkäufen
                      </div>
                      <div className="text-xl font-bold tabular">
                        {formatEUR(projectedBudget, { compact: true })}
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={reset}
                    variant="ghost"
                    size="sm"
                    className="hidden lg:inline-flex h-7 px-2 text-[11px] gap-1"
                  >
                    <RotateCcw className="size-3" /> Reset
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] tabular">
                  <div className="rounded bg-white/60 px-2 py-1.5 ring-1 ring-border">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Aktuell
                    </div>
                    <div className="font-mono font-semibold">
                      {formatEUR(budget, { compact: true })}
                    </div>
                  </div>
                  <div className="rounded bg-emerald-50 px-2 py-1.5 ring-1 ring-emerald-200">
                    <div className="text-[9px] uppercase tracking-wider text-emerald-700">
                      + Verkäufe ({state.sells.length})
                    </div>
                    <div className="font-mono font-semibold text-emerald-700">
                      + {formatEUR(sellValue, { compact: true })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sells summary (when present) */}
            {sellPlayers.length > 0 && (
              <SellsSummary
                players={sellPlayers}
                totalValue={sellValue}
                onUntag={toggleSell}
              />
            )}

            {/* Free slots compact strip */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="size-3.5 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Freie Plätze
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground tabular">
                    {derivedFormation}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((pos) => {
                    const free = freeSlotByPos[pos] ?? 0;
                    return (
                      <div
                        key={pos}
                        className={cn(
                          "rounded border px-1.5 py-1.5 text-center",
                          free > 0
                            ? "border-primary/30 bg-primary/[0.04]"
                            : "border-border bg-muted/40"
                        )}
                      >
                        <div className="flex justify-center mb-0.5">
                          <PositionBadge pos={pos} />
                        </div>
                        <div
                          className={cn(
                            "text-base font-bold tabular leading-none",
                            free > 0 ? "text-primary" : "text-muted-foreground"
                          )}
                        >
                          {free}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Bench (right column on desktop) */}
            <BenchZone
              players={benchPlayers}
              sells={sellSet}
              counts={counts}
              onToggleSell={toggleSell}
              onPlace={placeOnPitch}
            />
          </aside>
        </section>
      </div>

      <DragOverlay>
        {activeId ? <PlayerCard player={playerById.get(activeId)!} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ─── KPI tiles ─────────────────────────────────────────── */

function KpiTile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "success" | "warning" | "danger";
}) {
  const accentBar: Record<string, string> = {
    primary: "bg-gradient-to-r from-primary to-emerald-300",
    success: "bg-gradient-to-r from-emerald-500 to-emerald-300",
    warning: "bg-gradient-to-r from-amber-500 to-amber-300",
    danger: "bg-gradient-to-r from-rose-500 to-rose-300",
  };
  return (
    <Card className="card-hover relative overflow-hidden">
      {accent && (
        <div className={cn("absolute top-0 left-0 right-0 h-0.5", accentBar[accent])} />
      )}
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
          {icon}
          {label}
        </div>
        <div className="text-lg font-bold tabular truncate">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DeadlineTile({ deadline, matchday }: { deadline?: string; matchday?: string | number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!deadline) {
    return (
      <KpiTile
        icon={<Calendar className="size-4" />}
        label="Spieltag"
        value={matchday !== undefined ? `MD ${matchday}` : "–"}
      />
    );
  }
  const target = new Date(deadline).getTime();
  if (isNaN(target) || now === null) {
    return (
      <KpiTile
        icon={<Calendar className="size-4" />}
        label="Spieltag"
        value={matchday !== undefined ? `MD ${matchday}` : "–"}
      />
    );
  }
  const diff = target - now;
  const expired = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs / 3_600_000) % 24);
  const mins = Math.floor((abs / 60_000) % 60);

  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${mins}m`;
  else label = `${mins}m`;

  return (
    <KpiTile
      icon={<Calendar className="size-4" />}
      label={expired ? "Deadline vorbei" : "Deadline in"}
      value={label}
      sub={matchday !== undefined ? `Spieltag ${matchday}` : undefined}
      accent={expired ? "danger" : days < 1 ? "warning" : undefined}
    />
  );
}

/* ─── Pitch ────────────────────────────────────────────── */

function Pitch({
  slotIds,
  formation,
  slots,
  playerById,
  sells,
  onRemoveFromSlot,
  onToggleSell,
}: {
  slotIds: string[];
  formation: FormationKey;
  slots: Record<string, string | null>;
  playerById: Map<string, PlannerPlayer>;
  sells: Set<string>;
  onRemoveFromSlot: (slotId: string) => void;
  onToggleSell: (id: string) => void;
}) {
  const f = FORMATIONS[formation];
  const groups: Array<{ key: string; ids: string[] }> = [
    { key: "fwd", ids: slotIds.filter((id) => id.startsWith("F")) },
    { key: "mid", ids: slotIds.filter((id) => id.startsWith("M")) },
    { key: "def", ids: slotIds.filter((id) => id.startsWith("D")) },
    { key: "gk", ids: ["GK"] },
  ];
  const filled = slotIds.filter((id) => slots[id]).length;

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-emerald-700/50 shadow-card bg-emerald-700">
      {/* Pitch background lines */}
      <svg
        viewBox="0 0 200 280"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-25 pointer-events-none"
        aria-hidden
      >
        <rect x="6" y="6" width="188" height="268" fill="none" stroke="white" strokeWidth="1" />
        <line x1="6" y1="140" x2="194" y2="140" stroke="white" strokeWidth="0.5" />
        <circle cx="100" cy="140" r="22" fill="none" stroke="white" strokeWidth="0.5" />
        <circle cx="100" cy="140" r="1.5" fill="white" />
        <rect x="55" y="6" width="90" height="32" fill="none" stroke="white" strokeWidth="0.5" />
        <rect x="78" y="6" width="44" height="14" fill="none" stroke="white" strokeWidth="0.5" />
        <rect x="55" y="242" width="90" height="32" fill="none" stroke="white" strokeWidth="0.5" />
        <rect x="78" y="260" width="44" height="14" fill="none" stroke="white" strokeWidth="0.5" />
      </svg>
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "repeating-linear-gradient(180deg, transparent 0px, transparent 24px, rgba(255,255,255,0.04) 24px, rgba(255,255,255,0.04) 48px)",
        }}
      />

      <div className="relative grid grid-rows-4 gap-2 sm:gap-3 p-3 sm:p-5 min-h-[400px] sm:min-h-[440px] lg:min-h-[460px]">
        {groups.map((g) => (
          <div
            key={g.key}
            className={cn(
              "flex items-center gap-2 sm:gap-3 justify-around",
              g.ids.length > 4 ? "px-1" : "px-3 sm:px-8"
            )}
          >
            {g.ids.map((slotId) => {
              const playerId = slots[slotId];
              const player = playerId ? playerById.get(playerId) : undefined;
              return (
                <SlotTarget
                  key={slotId}
                  slotId={slotId}
                  player={player ?? null}
                  onRemove={() => onRemoveFromSlot(slotId)}
                  onToggleSell={() => player && onToggleSell(player.id)}
                  isSellMarked={!!player && sells.has(player.id)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Formation label */}
      <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/30 backdrop-blur text-white text-[10px] font-mono tabular">
        {formation} · {filled}/{f.def + f.mid + f.fwd + 1}
      </div>
    </div>
  );
}

function SlotTarget({
  slotId,
  player,
  onRemove,
  onToggleSell,
  isSellMarked,
}: {
  slotId: string;
  player: PlannerPlayer | null;
  onRemove: () => void;
  onToggleSell: () => void;
  isSellMarked: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId });
  const requiredPos = POS_FOR_SLOT[slotId];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-xl transition-all w-[60px] sm:w-[72px] lg:w-[78px]",
        isOver && "ring-2 ring-white scale-105"
      )}
    >
      {player ? (
        <PitchPlayer
          player={player}
          onRemove={onRemove}
          onToggleSell={onToggleSell}
          isSellMarked={isSellMarked}
        />
      ) : (
        <EmptySlot pos={requiredPos} />
      )}
    </div>
  );
}

function EmptySlot({ pos }: { pos: number }) {
  const label = POSITION_LABELS[pos] ?? "?";
  return (
    <div className="aspect-[3/4] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/35 bg-black/10 text-white/65 text-[10px] font-bold tracking-wider gap-1">
      <div className="size-7 rounded-full bg-white/10 flex items-center justify-center text-[9px]">+</div>
      {label}
    </div>
  );
}

function PitchPlayer({
  player,
  onRemove,
  onToggleSell,
  isSellMarked,
}: {
  player: PlannerPlayer;
  onRemove: () => void;
  onToggleSell: () => void;
  isSellMarked: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: { pos: player.pos },
  });
  const team = teamMeta(player.tid);
  const teamLogo = team.logo
    ? team.logo.startsWith("http")
      ? team.logo
      : `https://kickbase.b-cdn.net/${team.logo.replace(/^\//, "")}`
    : undefined;

  return (
    <div className={cn("relative", isDragging && "opacity-30")}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          // Drag fires nicht bei Tap (PointerSensor distance=4); Tap = "auf Bank"
          e.stopPropagation();
          if (!isDragging) onRemove();
        }}
        className="touch-none cursor-pointer active:cursor-grabbing"
        title="Klick: Auf Bank · Halten + Ziehen: Position tauschen"
      >
        <div className="rounded-xl bg-white shadow-md ring-1 ring-emerald-900/20 overflow-hidden hover:scale-[1.03] transition-transform">
          <div
            className="aspect-[1/1] flex items-center justify-center text-xs font-bold relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${team.color}26, ${team.color}0a)` }}
          >
            <PlayerAvatar
              pim={player.pim}
              tid={player.tid}
              size={88}
              rounded="md"
              className="ring-0 bg-transparent w-full h-full"
            />
            {teamLogo && (
              <span
                className="absolute top-1 left-1 size-6 rounded-full bg-white shadow-md ring-1 ring-black/10 flex items-center justify-center overflow-hidden"
                title={team.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={teamLogo}
                  alt={team.name}
                  width={20}
                  height={20}
                  className="object-contain"
                />
              </span>
            )}
            {isSellMarked && (
              <span className="absolute inset-0 bg-rose-500/35 flex items-center justify-center">
                <Tag className="size-5 text-white drop-shadow" />
              </span>
            )}
            {player.st !== undefined && player.st !== 0 && (
              <span
                className="absolute bottom-1 right-1 size-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] ring-1 ring-white"
                title="Verletzt/Gesperrt"
              >
                <AlertTriangle className="size-3" />
              </span>
            )}
          </div>
          <div className="px-1.5 py-1 text-center">
            <div className="text-[10px] sm:text-[11px] font-semibold truncate">{player.name}</div>
            <div className="text-[9px] font-mono text-muted-foreground tabular">
              {formatEUR(player.mv, { compact: true })}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -top-1 -right-1 flex gap-0.5 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSell();
          }}
          className={cn(
            "size-5 rounded-full text-[9px] ring-1 ring-white transition-colors flex items-center justify-center",
            isSellMarked ? "bg-rose-500 text-white" : "bg-black/60 text-white hover:bg-rose-500"
          )}
          title="Verkaufen"
        >
          €
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="size-5 rounded-full bg-black/60 text-white text-[9px] ring-1 ring-white hover:bg-black/80 flex items-center justify-center"
          title="Auf Bank"
        >
          <ArrowDown className="size-3" />
        </button>
      </div>
    </div>
  );
}

/* ─── Bench ────────────────────────────────────────────── */

function BenchZone({
  players,
  sells,
  counts,
  onToggleSell,
  onPlace,
}: {
  players: PlannerPlayer[];
  sells: Set<string>;
  counts: Counts;
  onToggleSell: (id: string) => void;
  onPlace: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "bench" });
  const grouped = [
    { pos: 1, label: "Tor" },
    { pos: 2, label: "Abwehr" },
    { pos: 3, label: "Mittelfeld" },
    { pos: 4, label: "Sturm" },
  ];

  return (
    <Card
      ref={setNodeRef as unknown as React.Ref<HTMLDivElement>}
      className={cn("transition-all", isOver && "ring-2 ring-primary card-glow")}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users className="size-4" />
            </span>
            <span className="font-semibold text-sm">Bank</span>
            <Badge variant="muted" className="text-[10px]">
              {players.length}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            <span className="text-foreground font-medium">+</span> = Aufstellen
          </span>
        </div>
        {players.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            Alle Spieler sind in der Aufstellung.
          </p>
        ) : (
          <div className="space-y-2.5">
            {grouped.map((g) => {
              const list = players.filter((p) => p.pos === g.pos);
              if (list.length === 0) return null;
              const canAdd = canPlacePos(g.pos, counts);
              return (
                <div key={g.pos}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <PositionBadge pos={g.pos} />
                    <span className="text-[10px] text-muted-foreground tabular">
                      {list.length}
                    </span>
                    <span
                      className={cn(
                        "ml-auto text-[10px] tabular",
                        canAdd
                          ? "text-primary font-semibold"
                          : "text-muted-foreground"
                      )}
                    >
                      {canAdd ? "Platz frei" : "voll"}
                    </span>
                  </div>
                  <div className="grid gap-1.5">
                    {list.map((p) => (
                      <PlayerCard
                        key={p.id}
                        player={p}
                        isSellMarked={sells.has(p.id)}
                        canPlace={canAdd}
                        onToggleSell={() => onToggleSell(p.id)}
                        onPlace={() => onPlace(p.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlayerCard({
  player,
  isSellMarked,
  canPlace,
  onToggleSell,
  onPlace,
  dragging,
}: {
  player: PlannerPlayer;
  isSellMarked?: boolean;
  canPlace?: boolean;
  onToggleSell?: () => void;
  onPlace?: () => void;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: { pos: player.pos },
  });
  const trend = player.tfhmvt ?? 0;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging && canPlace && onPlace) onPlace();
      }}
      className={cn(
        "relative rounded-lg border bg-card p-2 touch-none card-hover",
        canPlace ? "cursor-pointer active:cursor-grabbing" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30",
        isSellMarked && "border-rose-300 bg-rose-50/40",
        dragging && "shadow-2xl ring-2 ring-primary"
      )}
      title={canPlace ? "Klick: Aufstellen · Halten + Ziehen: Slot" : undefined}
    >
      <div className="flex items-center gap-2">
        <PlayerAvatar pim={player.pim} tid={player.tid} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{player.name}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <TeamTag tid={player.tid} size="xs" />
            <span className="font-mono tabular">{formatEUR(player.mv, { compact: true })}</span>
            {trend !== 0 && (
              <span
                className={cn(
                  "font-mono tabular",
                  trend > 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {formatDelta(trend)}
              </span>
            )}
          </div>
        </div>
        {!dragging && (
          <div className="flex items-center gap-1 shrink-0">
            {onPlace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (canPlace) onPlace();
                }}
                disabled={!canPlace}
                className={cn(
                  "size-6 rounded text-sm font-bold transition-colors flex items-center justify-center",
                  canPlace
                    ? "bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground ring-1 ring-primary/30"
                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                )}
                title={
                  canPlace
                    ? "Aufstellen"
                    : "Position voll – keine valide Formation mehr möglich"
                }
                aria-label="Aufstellen"
              >
                +
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSell?.();
              }}
              className={cn(
                "size-6 rounded text-[10px] transition-colors flex items-center justify-center",
                isSellMarked
                  ? "bg-rose-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-rose-100 hover:text-rose-600"
              )}
              title="Zum Verkauf markieren"
              aria-label="Verkaufen"
            >
              €
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sells summary ────────────────────────────────────── */

function SellsSummary({
  players,
  totalValue,
  onUntag,
}: {
  players: PlannerPlayer[];
  totalValue: number;
  onUntag: (id: string) => void;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50/40 slide-up">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded bg-rose-500/15 text-rose-600 flex items-center justify-center">
              <Tag className="size-3.5" />
            </span>
            <span className="font-semibold text-sm text-rose-900">Verkaufs-Plan</span>
            <Badge variant="danger" className="text-[10px]">
              {players.length}
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
              Erlös
            </div>
            <div className="font-mono font-bold tabular text-emerald-700 text-sm">
              + {formatEUR(totalValue, { compact: true })}
            </div>
          </div>
        </div>
        <div className="grid gap-1">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 py-1 px-2 rounded bg-white/60 ring-1 ring-rose-100"
            >
              <TeamTag tid={p.tid} size="xs" />
              <span className="text-xs font-medium truncate flex-1">{p.name}</span>
              <span className="text-xs font-mono text-emerald-700 tabular">
                + {formatEUR(p.mv, { compact: true })}
              </span>
              <button
                onClick={() => onUntag(p.id)}
                className="size-5 rounded hover:bg-rose-100 text-muted-foreground hover:text-rose-700 flex items-center justify-center transition-colors"
                aria-label="Verkaufs-Markierung entfernen"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
