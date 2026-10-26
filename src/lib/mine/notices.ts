import { createHmac, randomUUID } from "node:crypto";

/** Fixed event codes Mine understands (see Mine docs/admin/notification-hub-contract.md). */
export const NOTICE_CODES = [
  "new_match",
  "direct_request",
  "applicant_replied",
  "interview_requested",
  "name_released",
  "interview_declined",
  "chosen",
  "not_chosen",
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

export const MAX_ATTEMPTS = 6;

export interface NoticeRow {
  event_id: string;
  mine_user_id: string;
  event_code: string;
  /** The 案件 the notice is about (an opaque id). Mine uses it to open that 案件. */
  request_id?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The exact JSON body for Mine's hub. Only ids and a fixed code -- no names or text. */
export function buildNoticeBody(row: NoticeRow, now: Date): string | null {
  if (!(NOTICE_CODES as readonly string[]).includes(row.event_code)) return null;
  return JSON.stringify({
    schema_version: 1,
    event_id: row.event_id,
    service: "kenshulink",
    type: "service_event",
    mine_user_id: row.mine_user_id,
    event_code: row.event_code,
    ...(row.request_id && UUID.test(row.request_id) ? { ref: row.request_id.toLowerCase() } : {}),
    occurred_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
}

/** Mine hub signature: v1= + hex HMAC-SHA256 of "<timestamp>.<raw body>". */
export function signNotice(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

/** Minutes to wait after a failed attempt (attempt is 1-based). */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(60, 2 ** Math.max(1, attempt)) ;
}

/** What to do with a Mine answer: done, drop (will never work) or retry. */
export function classifyStatus(status: number): "sent" | "drop" | "retry" {
  if (status >= 200 && status < 300) return "sent";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "drop";
}

export function newEventId(): string {
  return randomUUID();
}
