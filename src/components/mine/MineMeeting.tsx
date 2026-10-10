"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/common/Toast";
import { formatMeetingTimeClient } from "@/lib/mine/meeting-format";
import { createClient } from "@/lib/supabase/client";
import type { KenshuMineMeetingRow } from "@/types/database";

/**
 * Meetings booked on instructors' Mine pages (Mine schedule redesign Phase 3c),
 * for the signed-in user (row-level security: only the company and the
 * instructor of each meeting can read it). Newest meeting per reply.
 */
export function useMineMeetings(userId: string | null) {
  const [byResponse, setByResponse] = useState<Record<string, KenshuMineMeetingRow>>({});
  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await createClient()
      .from("kenshu_mine_meetings")
      .select("*")
      .order("starts_at", { ascending: true })
      .limit(200);
    const map: Record<string, KenshuMineMeetingRow> = {};
    for (const row of (data ?? []) as KenshuMineMeetingRow[]) {
      const current = map[row.response_id];
      // Prefer an active meeting over a cancelled one; otherwise the later one.
      if (!current || (current.status === "cancelled" && row.status !== "cancelled") || row.starts_at > current.starts_at) {
        map[row.response_id] = row;
      }
    }
    setByResponse(map);
  }, [userId]);

  useEffect(() => {
    void load();
    // Coming back from the Mine booking tab shows the new meeting.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return { byResponse, reload: load };
}

/** Which instructors came from Mine (only they can be booked through Mine). */
export function useMineLinkedInstructors(instructorIds: string[]) {
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const key = [...new Set(instructorIds)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let active = true;
    void fetch("/api/mine/booking-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorIds: key.split(",") }),
    })
      .then((response) => (response.ok ? response.json() : { linked: [] }))
      .then((body: { linked?: string[] }) => {
        if (active) setLinked(new Set(body.linked ?? []));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key]);
  return linked;
}

const TYPE_LABEL: Record<string, string> = { google_meet: "Google Meet", in_person: "対面", none: "", zoom: "Zoom" };

/** 「面談：10月12日(月) 10:00〜10:30 ［Google Meet に参加］」 */
export function MineMeetingLine({ meeting }: { meeting: KenshuMineMeetingRow }) {
  const when = formatMeetingTimeClient(meeting.starts_at, meeting.ends_at, meeting.time_zone);
  if (meeting.status === "cancelled") {
    return (
      <div className="request-card__response" style={{ marginTop: 8 }}>
        <strong>面談：キャンセルされました</strong>
        <span style={{ textDecoration: "line-through", marginLeft: 6 }}>{when}</span>
      </div>
    );
  }
  return (
    <div className="request-card__response" style={{ marginTop: 8 }}>
      <strong>面談：{when}</strong>
      {meeting.meeting_type !== "none" && <span style={{ marginLeft: 6 }}>{TYPE_LABEL[meeting.meeting_type]}</span>}
      {meeting.meeting_type === "in_person" && meeting.place && <div style={{ marginTop: 4 }}>場所：{meeting.place}</div>}
      {meeting.meeting_type === "google_meet" &&
        (meeting.meeting_url ? (
          <div style={{ marginTop: 6 }}>
            <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
              Google Meet に参加
            </a>
          </div>
        ) : (
          <div style={{ marginTop: 4, fontSize: 12 }}>会議URLは準備中です。準備ができるとここに表示されます。</div>
        ))}
      {meeting.status === "change_requested" && (
        <div style={{ marginTop: 4, fontSize: 12 }}>日程の変更を相談中です。</div>
      )}
    </div>
  );
}

/** 「面談を予約」: asks Kenshu Link's server for a signed Mine booking link and opens it in a new tab. */
export function BookMineMeetingButton({ responseId, disabled }: { responseId: string; disabled?: boolean }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function open() {
    // Open the tab right away (browsers block pop-ups opened after waiting).
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const response = await fetch("/api/mine/booking-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId }),
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!response.ok || !body.url) {
        tab?.close();
        showToast(body.message ?? "面談の予約ページを開けませんでした。");
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = body.url;
      } else {
        window.location.href = body.url;
      }
    } catch {
      tab?.close();
      showToast("通信できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn--ghost btn--sm" disabled={disabled || busy} onClick={() => void open()}>
      {busy ? "準備中…" : "面談を予約"}
    </button>
  );
}
