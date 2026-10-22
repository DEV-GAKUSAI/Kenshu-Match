import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/requests/decided-contact  { "requestIds": ["<uuid>", ...] }
 *
 * For the signed-in company: the email and phone (from Mine, Mine migration
 * 147) of the instructor they DECIDED on, per request. Only requests that
 * belong to them and have a contact_unlocks row (made when they press 決定)
 * are answered, so nothing is readable before the decision. An instructor who
 * is not linked to Mine is left out (the page then keeps the old profile data).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401, headers: noStore });

  const body = (await request.json().catch(() => null)) as { requestIds?: unknown } | null;
  const ids = Array.isArray(body?.requestIds) ? body.requestIds.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
  if (!ids.length || ids.length > 100) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const { data: unlocks, error } = await admin
    .from("contact_unlocks")
    .select("request_id, instructor_id")
    .eq("requester_id", auth.user.id)
    .in("request_id", ids);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const items: Record<string, { email: string | null; phone: string | null }> = {};
  // Several instructors can be decided on one request (role slots): also answer per instructor.
  const byInstructor: Record<string, { email: string | null; phone: string | null }> = {};
  for (const row of unlocks ?? []) {
    const { data } = await admin.rpc("mine_contact_for_kenshu", { p_kenshu_user_id: row.instructor_id as string });
    const contact = data as { email?: string | null; phone?: string | null } | null;
    if (contact) {
      const one = { email: contact.email ?? null, phone: contact.phone ?? null };
      items[row.request_id as string] = one;
      byInstructor[row.instructor_id as string] = one;
    }
  }
  return NextResponse.json({ items, byInstructor }, { headers: noStore });
}
