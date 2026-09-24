import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type MineHandoffPayload = {
  sub: string;
  email: string;
  name: string;
  returnPath: "/open-requests";
  nonce: string;
  exp: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSecret() {
  const secret = process.env.MINE_HANDOFF_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MINE_HANDOFF_SECRET must contain at least 32 characters.");
  }
  return secret;
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
    payload.returnPath !== "/open-requests" ||
    typeof payload.nonce !== "string" ||
    !UUID_PATTERN.test(payload.nonce) ||
    typeof payload.exp !== "number" ||
    payload.exp <= now ||
    payload.exp > now + 180
  ) {
    throw new Error("invalid_payload");
  }
  return payload as MineHandoffPayload;
}
