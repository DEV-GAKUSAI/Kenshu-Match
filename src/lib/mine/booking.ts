import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Kenshu Link ⇄ Mine booking (Mine schedule redesign Phase 3c).
 * Uses the existing shared secret MINE_HANDOFF_SECRET (Mine:
 * KENSHU_LINK_HANDOFF_SECRET). Mirrors web/lib/booking/kenshulink.ts in Mine.
 *
 * 1. Booking ticket, Kenshu Link → Mine (in the URL fragment of
 *    <Mine>/book/kenshulink#t=<ticket>):
 *      base64url(JSON payload) "." base64url(HMAC-SHA256(secret, payload part))
 *    typ "mine_booking" keeps it apart from the sign-in ticket.
 * 2. Event message, Mine → Kenshu Link (POST /api/mine/booking-events):
 *      X-Mine-Timestamp: <unix seconds>
 *      X-Mine-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>
 */

export const BOOKING_TICKET_SECONDS = 30 * 60;
export const MESSAGE_MAX_SKEW_SECONDS = 5 * 60;

export type BookingTicket = {
  typ: "mine_booking";
  sub: string;
  org: string;
  name: string;
  ref: string;
  nonce: string;
  exp: number;
};

export function createBookingTicket(
  input: { mineUserId: string; org: string; name: string; responseId: string },
  secret: string,
  nowSeconds: number,
): string {
  const payload: BookingTicket = {
    typ: "mine_booking",
    sub: input.mineUserId,
    org: input.org.trim().slice(0, 100),
    name: input.name.trim().slice(0, 100),
    ref: input.responseId,
    nonce: randomUUID(),
    exp: nowSeconds + BOOKING_TICKET_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/** True when the message really comes from Mine and is recent. */
export function verifyMineMessage(
  body: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number,
): boolean {
  if (!secret || secret.length < 32 || !timestampHeader || !signatureHeader) return false;
  if (!/^\d{1,12}$/.test(timestampHeader)) return false;
  const timestamp = Number(timestampHeader);
  if (Math.abs(nowSeconds - timestamp) > MESSAGE_MAX_SKEW_SECONDS) return false;
  const match = /^v1=([0-9a-f]{64})$/.exec(signatureHeader);
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export type MeetingEvent = {
  booking_id: string;
  mine_user_id: string;
  response_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  meeting_type: "google_meet" | "in_person" | "none" | "zoom";
  meeting_url: string | null;
  meeting_status: "none" | "pending" | "ready" | "failed";
  place: string | null;
  status: "confirmed" | "change_requested" | "cancelled";
  proposed_starts_at: string | null;
  proposed_ends_at: string | null;
  proposed_by: "host" | "guest" | null;
  version: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isIso = (value: unknown) => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const isOptionalIso = (value: unknown) => value === null || value === undefined || isIso(value);
const oneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

/** Validates a message body from Mine; returns null when anything is off. */
export function parseMeetingEvent(raw: unknown): MeetingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.v !== 1) return null;
  if (typeof e.booking_id !== "string" || !UUID.test(e.booking_id)) return null;
  if (typeof e.mine_user_id !== "string" || !UUID.test(e.mine_user_id)) return null;
  if (typeof e.response_id !== "string" || !UUID.test(e.response_id)) return null;
  if (typeof e.title !== "string" || e.title.length < 1 || e.title.length > 200) return null;
  if (!isIso(e.starts_at) || !isIso(e.ends_at) || Date.parse(String(e.ends_at)) <= Date.parse(String(e.starts_at))) return null;
  if (typeof e.time_zone !== "string" || e.time_zone.length < 1 || e.time_zone.length > 64) return null;
  if (!oneOf(e.meeting_type, ["google_meet", "in_person", "none", "zoom"] as const)) return null;
  if (!oneOf(e.meeting_status, ["none", "pending", "ready", "failed"] as const)) return null;
  if (!oneOf(e.status, ["confirmed", "change_requested", "cancelled"] as const)) return null;
  if (e.meeting_url !== null && e.meeting_url !== undefined && (typeof e.meeting_url !== "string" || !/^https:\/\//i.test(e.meeting_url) || e.meeting_url.length > 2000)) return null;
  if (e.place !== null && e.place !== undefined && (typeof e.place !== "string" || e.place.length > 200)) return null;
  if (!isOptionalIso(e.proposed_starts_at) || !isOptionalIso(e.proposed_ends_at)) return null;
  if (e.proposed_by !== null && e.proposed_by !== undefined && !oneOf(e.proposed_by, ["host", "guest"] as const)) return null;
  if (typeof e.version !== "string" || !isIso(e.version)) return null;
  return {
    booking_id: e.booking_id,
    mine_user_id: e.mine_user_id,
    response_id: e.response_id,
    title: e.title,
    starts_at: String(e.starts_at),
    ends_at: String(e.ends_at),
    time_zone: e.time_zone,
    meeting_type: e.meeting_type,
    meeting_url: (e.meeting_url as string | null | undefined) ?? null,
    meeting_status: e.meeting_status,
    place: (e.place as string | null | undefined) ?? null,
    status: e.status,
    proposed_starts_at: (e.proposed_starts_at as string | null | undefined) ?? null,
    proposed_ends_at: (e.proposed_ends_at as string | null | undefined) ?? null,
    proposed_by: (e.proposed_by as "host" | "guest" | null | undefined) ?? null,
    version: e.version,
  };
}

/** 「10月12日(月) 10:00〜10:30」 in the meeting's time zone. */
export function formatMeetingTime(startIso: string, endIso: string, timeZone: string): string {
  const parts = (iso: string) => {
    const values = new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) => values.find((part) => part.type === type)?.value ?? "";
    return { day: `${get("month")}月${get("day")}日(${get("weekday")})`, time: `${get("hour")}:${get("minute")}` };
  };
  const start = parts(startIso);
  const end = parts(endIso);
  return `${start.day} ${start.time}〜${end.time}`;
}

export function mineAppOrigin(): string {
  return (process.env.MINE_APP_URL ?? "https://mine-omega-one.vercel.app").replace(/\/$/, "");
}
