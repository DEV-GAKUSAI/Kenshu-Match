import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type MineHandoffPayload = {
  sub: string;
  email: string;
  name: string;
  /** The open-requests list, or one 案件 opened from Mine 予約一覧 (Mine meeting 10/13 #4). */
  returnPath: "/open-requests" | `/request-detail?id=${string}`;
  nonce: string;
  exp: number;
  /** Kenshu training-field names mapped from the person's Mine skills (may be empty). */
  fields?: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSecret() {
  const secret = process.env.MINE_HANDOFF_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MINE_HANDOFF_SECRET must contain at least 32 characters.");
  }
  return secret;
}

/** Only these landing pages are allowed, so a ticket can never redirect elsewhere. */
export function isAllowedReturnPath(value: unknown): boolean {
  if (value === "/open-requests") return true;
  if (typeof value !== "string" || !value.startsWith("/request-detail?id=")) return false;
  return UUID_PATTERN.test(value.slice("/request-detail?id=".length));
}

function isValidFields(fields: unknown): boolean {
  if (fields === undefined) return true; // older Mine: skill sync is skipped
  return (
    Array.isArray(fields) &&
    fields.length <= 60 &&
    fields.every((field) => typeof field === "string" && field.length > 0 && field.length <= 100)
  );
}

export function verifyMineHandoffToken(token: string): MineHandoffPayload {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) throw new Error("invalid_token");

  const expected = createHmac("sha256", getSecret()).update(encodedPayload).digest();
  const received = Buffer.from(encodedSignature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("invalid_signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as Partial<MineHandoffPayload>;
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.sub !== "string" ||
    !UUID_PATTERN.test(payload.sub) ||
    typeof payload.email !== "string" ||
    !payload.email.includes("@") ||
    typeof payload.name !== "string" ||
    payload.name.trim().length === 0 ||
    !isAllowedReturnPath(payload.returnPath) ||
    typeof payload.nonce !== "string" ||
    !UUID_PATTERN.test(payload.nonce) ||
    typeof payload.exp !== "number" ||
    payload.exp <= now ||
    payload.exp > now + 180 ||
    !isValidFields(payload.fields)
  ) {
    throw new Error("invalid_payload");
  }
  return payload as MineHandoffPayload;
}
