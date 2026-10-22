"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";
import { useRoleTheme } from "@/hooks/useRoleTheme";
import { createClient } from "@/lib/supabase/client";
import { DetailsForm, detailsPayload, type DetailsFormValue } from "@/components/requests/DetailsForm";
import { RolesForm, rolesPayload, rolesToForm, type RolesFormValue } from "@/components/requests/RolesForm";
import { normalizeSlots } from "@/lib/requests/roles";
import { MoneyForm, moneyPayload, type MoneyFormValue } from "@/components/requests/MoneyForm";
import { normalUnit } from "@/lib/requests/money";
import { normalizeDays } from "@/lib/requests/schedule";
import type { RequestFormat, TrainingRequestRow } from "@/types/database";
import { Select } from "@/components/ui/Select";

/** 依頼内容の編集 (#45): only the owner, only while the request is open and nobody is decided yet. */
function EditRequestInner() {
  const { authReady, user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const id = useSearchParams().get("id");
  useRoleTheme("business");

  const [state, setState] = useState<"loading" | "ok" | "locked" | "missing">("loading");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<RequestFormat>("online");
  const [location, setLocation] = useState("");
  const [schedule, setSchedule] = useState("");
  const [participants, setParticipants] = useState("");
  const [deadline, setDeadline] = useState("");
  const [hadDeadline, setHadDeadline] = useState(false);
  const [money, setMoney] = useState<MoneyFormValue | null>(null);
  const [details, setDetails] = useState<DetailsFormValue | null>(null);
  const [roles, setRoles] = useState<RolesFormValue>([]);
  const [hadRoles, setHadRoles] = useState(false);
  const [decidedBySlot, setDecidedBySlot] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authReady || !user || !id) return;
    let alive = true;
    (async () => {
      const db = createClient() as unknown as SupabaseClient;
      const { data } = await db.from("training_requests").select("*, instructor_responses(is_selected, role_slot_id)").eq("request_id", id).maybeSingle();
      if (!alive) return;
      const r = data as (TrainingRequestRow & { instructor_responses: { is_selected: boolean; role_slot_id: string | null }[] }) | null;
      if (!r || r.requester_id !== user.id) return setState("missing");
      const slots = normalizeSlots(r.role_slots);
      // A request with role slots can be edited while it is still recruiting; others lock at the first decision.
      if (r.status !== "pending" || (slots.length === 0 && (r.instructor_responses || []).some((x) => x.is_selected))) return setState("locked");
      setRoles(rolesToForm(slots));
      setHadRoles(slots.length > 0);
      const taken: Record<string, number> = {};
      for (const x of r.instructor_responses || []) if (x.is_selected && x.role_slot_id) taken[x.role_slot_id] = (taken[x.role_slot_id] ?? 0) + 1;
      setDecidedBySlot(taken);
      setTitle(r.title);
      setDescription(r.description);
      setFormat(r.preferred_format);
      setLocation(r.location ?? "");
      setSchedule(r.preferred_schedule ?? "");
      setParticipants(r.participant_count ? String(r.participant_count) : "");
      setDeadline(r.apply_deadline ?? "");
      setHadDeadline(!!r.apply_deadline);
      setMoney({
        budget: r.budget ? String(r.budget) : "",
        unit: normalUnit(r.budget_unit),
        tax: r.tax_mode ?? "unspecified",
        transport: r.transport_cost ?? "unspecified",
        lodging: r.lodging_cost ?? "unspecified",
        prep: r.prep_cost ?? "unspecified",
        paymentTerms: r.payment_terms ?? "",
      });
      setDetails({ days: normalizeDays(r.schedule_days), allDaysRequired: !!r.all_days_required, skills: r.req_skills ?? "", prep: r.req_prep ?? "", optionIds: r.detail_option_ids ?? [], otherTools: r.detail_other_tools ?? "" });
      setState("ok");
    })();
    return () => {
      alive = false;
    };
  }, [authReady, user, id]);

  if (!authReady) return null;
  if (!user || (user.role !== "COMPANY" && user.role !== "INDIVIDUAL") || !id || state === "missing") {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">この依頼は編集できません</p>
          <Link href="/mypage" className="btn btn--primary" style={{ marginTop: 16 }}>
            マイページに戻る
          </Link>
        </div>
      </main>
    );
  }
  if (state === "loading") return <main className="detail-page"><p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>読み込み中…</p></main>;
  if (state === "locked" || !money || !details) {
    return (
      <main className="detail-page">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p className="empty-state__title">この依頼はすでに確定・終了しているため、編集できません</p>
          <Link href="/mypage" className="btn btn--primary" style={{ marginTop: 16 }}>
            マイページに戻る
          </Link>
        </div>
      </main>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(participants);
    if (!title.trim() || !description.trim()) return setError("タイトルと依頼内容を入力してください。");
    if (format !== "online" && !location.trim()) return setError("対面の場合は実施場所の入力が必要です。");
    if (!Number.isInteger(n) || n < 1) return setError("対象人数を入力してください。");
    const slotsNow = rolesPayload(roles).role_slots;
    const tooLow = slotsNow.find((sl) => (decidedBySlot[sl.id] ?? 0) > sl.headcount);
    if (tooLow) return setError(`「${tooLow.name}」はすでに${decidedBySlot[tooLow.id]}名決定済みのため、それより少なくできません。`);
    if (Object.keys(decidedBySlot).some((sid) => !slotsNow.some((sl) => sl.id === sid))) return setError("決定済みの講師がいる職種は削除できません。");
    setError("");
    setSaving(true);
    const db = createClient() as unknown as SupabaseClient;
    const { error: err } = await db
      .from("training_requests")
      .update({
        title: title.trim(),
        description: description.trim(),
        preferred_format: format,
        location: format === "online" ? null : location.trim(),
        preferred_schedule: schedule.trim() || null,
        participant_count: n,
        // Only when used (or was), so editing keeps working before migration 173 is run.
        ...(hadDeadline || deadline ? { apply_deadline: deadline || null } : {}),
        ...moneyPayload(money!),
        ...detailsPayload(details!, true),
        // Only when roles are used (or were), so editing keeps working before migration 168 is run.
        ...(hadRoles || rolesPayload(roles).role_slots.length > 0 ? rolesPayload(roles) : {}),
      })
      .eq("request_id", id)
      .eq("status", "pending");
    setSaving(false);
    if (err) return setError(`保存できませんでした：${err.message}`);
    showToast("依頼内容を更新しました。");
    router.push("/mypage");
  }

  return (
    <main className="detail-page">
      <p className="breadcrumb">
        <Link href="/mypage">マイページ</Link>
        <span className="sep">/</span>
        依頼内容の編集
      </p>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 className="detail-header__name" style={{ marginBottom: 8 }}>
          依頼内容を編集する
        </h1>
        <p className="modal-desc" style={{ marginBottom: 24 }}>
          すでに応募している講師にも、変更後の内容が表示されます。講師が決まった後は編集できません。
        </p>
        <div className="form-card">
          {error && <div className="notice-banner is-visible">{error}</div>}
          <form noValidate onSubmit={save}>
            <div className="form-field">
              <label htmlFor="edTitle">依頼タイトル</label>
              <input type="text" id="edTitle" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="edFormat">希望形態</label>
                <Select id="edFormat" value={format} onChange={(e) => setFormat(e.target.value as RequestFormat)}>
                  <option value="online">オンライン</option>
                  <option value="offline">対面</option>
                  <option value="both">オンライン・対面 両方</option>
                </Select>
              </div>
              <div className="form-field">
                <label htmlFor="edParticipants">対象人数</label>
                <input type="number" id="edParticipants" min={1} step={1} value={participants} onChange={(e) => setParticipants(e.target.value)} />
              </div>
            </div>
            <MoneyForm value={money} onChange={setMoney} idPrefix="ed" />
            {format !== "online" && (
              <div className="form-field">
                <label htmlFor="edLocation">実施場所（対面の場合は必須）</label>
                <input type="text" id="edLocation" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            )}
            <div className="form-field">
              <label htmlFor="edSchedule">希望日程（おおまかに）</label>
              <input type="text" id="edSchedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="edDeadline">応募締切<span className="field-optional">任意</span></label>
              <input type="date" id="edDeadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <p className="form-field__hint">この日を過ぎると、新しい応募はできなくなります（応募済みの講師は変わりません）。</p>
            </div>
            <RolesForm value={roles} onChange={setRoles} decided={decidedBySlot} />
            <DetailsForm value={details} onChange={setDetails} idPrefix="ed" />
            <div className="form-field">
              <label htmlFor="edDescription">依頼内容の詳細</label>
              <textarea id="edDescription" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                保存する
              </button>
              <Link href="/mypage" className="btn btn--ghost">
                やめる
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function EditRequestPage() {
  return (
    <Suspense fallback={null}>
      <EditRequestInner />
    </Suspense>
  );
}
