import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { receiptError } from "@/lib/requests/invoice-calc";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };
const BUCKET = "invoice-receipts";
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
/** At most this many files may sit in one response's folder (unsent ones count too). */
const FOLDER_LIMIT = 15;

function looksLike(type: string, head: Uint8Array): boolean {
  if (type === "application/pdf") return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (type === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (type === "image/png") return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  return false;
}

/**
 * POST /api/requests/receipts  (multipart: responseId, file)
 * The lecturer of that response attaches a 領収書 (PDF / JPG / PNG, 4 MB). The file goes to the private bucket
 * `invoice-receipts` under receipts/<responseId>/ and the caller gets {path, name, size, type} to send with the invoice.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401, headers: noStore });

  const form = await request.formData().catch(() => null);
  const responseId = String(form?.get("responseId") ?? "");
  const file = form?.get("file");
  if (!UUID.test(responseId) || !(file instanceof File)) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });

  const problem = receiptError({ name: file.name, size: file.size, type: file.type }, 0);
  if (problem) return NextResponse.json({ error: "bad_file", message: problem }, { status: 400, headers: noStore });

  // Only the lecturer of this response (RLS shows a lecturer their own responses).
  const { data: own } = await supabase.from("instructor_responses").select("response_id").eq("response_id", responseId).eq("instructor_id", auth.user.id).maybeSingle();
  if (!own) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLike(file.type, bytes.slice(0, 8))) return NextResponse.json({ error: "bad_file", message: "ファイルの中身が形式と合っていません。" }, { status: 400, headers: noStore });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  const folder = `receipts/${responseId}`;
  const { data: existing } = await admin.storage.from(BUCKET).list(folder, { limit: FOLDER_LIMIT + 1 });
  if ((existing?.length ?? 0) >= FOLDER_LIMIT) return NextResponse.json({ error: "too_many", message: "添付済みのファイルが多すぎます。" }, { status: 400, headers: noStore });

  const path = `${folder}/${randomUUID()}.${EXT[file.type]}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });

  return NextResponse.json({ path, name: file.name.slice(0, 100), size: file.size, type: file.type }, { headers: noStore });
}

/**
 * GET /api/requests/receipts?invoiceId=<uuid>&path=<path>
 * Either side of the invoice opens a receipt that is listed on that invoice (a 60-second link to the file).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "not_signed_in" }, { status: 401, headers: noStore });

  const invoiceId = request.nextUrl.searchParams.get("invoiceId") ?? "";
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!UUID.test(invoiceId) || !path) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });

  // RLS: only the two parties can read the invoice.
  const { data: inv } = await (supabase as unknown as SupabaseClient).from("request_invoices").select("receipts").eq("invoice_id", invoiceId).maybeSingle();
  const receipts = (inv as { receipts?: unknown } | null)?.receipts;
  const list = Array.isArray(receipts) ? (receipts as { path?: string }[]) : [];
  if (!list.some((r) => r && r.path === path)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: noStore });
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: noStore });
}
