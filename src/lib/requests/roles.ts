// 募集職種・募集人数 (#42): role slots on a request, e.g. メイン講師 ×1 + サブ講師 ×2.
// Stored as a JSON list on training_requests.role_slots; an applicant is decided into one slot
// (instructor_responses.role_slot_id). No slots = the old single-instructor request.

export type RoleSlot = { id: string; name: string; headcount: number };

export const ROLE_PRESETS = ["メイン講師", "サブ講師", "アシスタント"] as const;
export const MAX_SLOTS = 10;
export const MAX_HEADCOUNT = 50;

/** Reads whatever the database returned into clean slots (bad rows are skipped). */
export function normalizeSlots(raw: unknown): RoleSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: RoleSlot[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const headcount = Number(o.headcount);
    if (!id || !name || !Number.isInteger(headcount) || headcount < 1) continue;
    out.push({ id, name, headcount });
  }
  return out.slice(0, MAX_SLOTS);
}

/** Form rows → what is saved: empty names are dropped, headcount is kept between 1 and 50. */
export function cleanSlots(rows: { id: string; name: string; headcount: number | string }[]): RoleSlot[] {
  const out: RoleSlot[] = [];
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const n = Math.floor(Number(r.headcount));
    const headcount = Number.isFinite(n) ? Math.min(MAX_HEADCOUNT, Math.max(1, n)) : 1;
    out.push({ id: r.id, name: name.slice(0, 30), headcount });
  }
  return out.slice(0, MAX_SLOTS);
}

export type SlotCount = { slot: RoleSlot; decided: number; remaining: number };

/** 必要人数・決定人数・残人数 per slot. */
export function slotCounts(slots: RoleSlot[], responses: { is_selected?: boolean | null; role_slot_id?: string | null }[]): SlotCount[] {
  return slots.map((slot) => {
    const decided = responses.filter((r) => r.is_selected && r.role_slot_id === slot.id).length;
    return { slot, decided, remaining: Math.max(0, slot.headcount - decided) };
  });
}

export function totalRemaining(counts: SlotCount[]): number {
  return counts.reduce((sum, c) => sum + c.remaining, 0);
}

export function totalNeeded(slots: RoleSlot[]): number {
  return slots.reduce((sum, s) => sum + s.headcount, 0);
}

/** "メイン講師 1名・サブ講師 2名" (what the request asks for). */
export function slotsSummary(slots: RoleSlot[]): string {
  return slots.map((s) => `${s.name} ${s.headcount}名`).join("・");
}

/** "メイン講師 1/1・サブ講師 0/2" (decided / needed). */
export function progressSummary(counts: SlotCount[]): string {
  return counts.map((c) => `${c.slot.name} ${c.decided}/${c.slot.headcount}`).join("・");
}

/** Slots that can still take someone. */
export function openSlots(counts: SlotCount[]): RoleSlot[] {
  return counts.filter((c) => c.remaining > 0).map((c) => c.slot);
}

export function newSlotId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
