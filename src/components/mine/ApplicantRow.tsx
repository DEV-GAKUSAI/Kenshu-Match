"use client";

import { useState, type ReactNode } from "react";

import { MineMeetingLine } from "@/components/mine/MineMeeting";
import { formatMeetingTimeClient } from "@/lib/mine/meeting-format";
import type { InstructorResponseRow, KenshuMineMeetingRow } from "@/types/database";

const isActive = (meeting: KenshuMineMeetingRow) => meeting.status !== "cancelled" && Date.parse(meeting.ends_at) > Date.now();

/** Sort order for the company's list: needs an answer first, then NEW, then the rest. */
export function applicantPriority(response: InstructorResponseRow, meeting: KenshuMineMeetingRow | undefined): number {
  if (meeting && isActive(meeting) && meeting.status === "change_requested" && meeting.proposed_by === "host") return 0;
  return response.requester_seen_at === null ? 1 : 2;
}

const pill = (background: string, color: string) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "var(--radius-pill)",
  background,
  color,
  fontSize: 11,
  fontWeight: 700,
});

/**
 * One instructor who applied (公募依頼), as a closed row: name, 承諾 / 見積り,
 * NEW, the meeting in one line and the Google Meet button on the right.
 * Clicking the row opens the message, the meeting details and the buttons.
 */
export function ApplicantRow({
  name,
  response,
  meeting,
  meetingButton,
  busy,
  onDecide,
  onRequestInterview,
  onCancelRequest,
}: {
  name: string;
  response: InstructorResponseRow;
  meeting: KenshuMineMeetingRow | undefined;
  /** 「日程変更・キャンセル」 or 「面談を予約」, built by the page (null when neither applies). */
  meetingButton: ReactNode;
  busy: boolean;
  onDecide: () => void;
  /** Ask this applicant for an interview (the first step before choosing). */
  onRequestInterview: () => void;
  /** Cancelling the whole request (only while no instructor is chosen yet). */
  onCancelRequest?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The meeting while it is still upcoming (not cancelled, not finished).
  const live = meeting && isActive(meeting) ? meeting : undefined;
  const needsAnswer = live?.status === "change_requested" && live.proposed_by === "host";
  const meetUrl = live?.meeting_type === "google_meet" ? live.meeting_url : null;
  const isNew = response.requester_seen_at === null;
  const offer = response.action === "accept" ? "承諾" : `見積り ¥${Number(response.quote_price || 0).toLocaleString()}`;
  const message = (response.message ?? "").trim();
  const interview = response.interview_status;
  const declined = interview === "declined";
  // Until the instructor agrees to the interview only the initials are known.
  const shownName = response.released_name?.trim() || name;

  let summary: ReactNode = <span style={{ color: "var(--color-ink-soft)" }}>面談：未予約</span>;
  if (meeting && meeting.status === "cancelled") {
    summary = <span style={{ color: "var(--color-ink-soft)" }}>面談：キャンセル済み</span>;
  } else if (meeting && !live) {
    summary = <span style={{ color: "var(--color-ink-soft)" }}>面談：終了</span>;
  } else if (live) {
    const when = formatMeetingTimeClient(live.starts_at, live.ends_at, live.time_zone);
    const state =
      live.status === "change_requested" ? (
        needsAnswer ? (
          <span style={pill("#FFF1DB", "#9A5B0C")}>変更の提案あり</span>
        ) : (
          <span style={pill("var(--color-accent-soft)", "var(--color-accent-text)")}>変更を依頼中</span>
        )
      ) : (
        <span style={pill("#E3F7F0", "#0E7A5F")}>確定</span>
      );
    summary = (
      <>
        <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>面談：{when}</span> {state}
      </>
    );
  }

  const bar = needsAnswer ? "#E8A33A" : live ? "var(--color-primary)" : "var(--color-border)";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `4px solid ${bar}`,
        borderRadius: "var(--radius-s)",
        fontSize: 12.5,
        opacity: declined ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        {/* A div (not a button) so the name can be a real link inside it. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              setOpen((value) => !value);
            }
          }}
          style={{ flex: 1, minWidth: 0, textAlign: "left", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
        >
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ fontSize: 13.5, color: "var(--color-ink)" }}>
              <a
                href={`/instructor-detail?id=${response.instructor_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                style={{ color: "var(--color-primary)", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                {shownName} 先生
              </a>
            </strong>
            <span style={pill("var(--color-accent-soft)", "var(--color-accent-text)")}>{offer}</span>
            {interview === "requested" && <span style={pill("#FFF1DB", "#9A5B0C")}>面談依頼中</span>}
            {interview === "released" && <span style={pill("#E3F7F0", "#0E7A5F")}>情報公開済み</span>}
            {declined && <span style={pill("#EEE", "#666")}>辞退</span>}
            {isNew && (
              <span className="status-badge status-badge--rejected" style={{ fontSize: 10 }}>
                NEW
              </span>
            )}
          </div>
          <div style={{ marginTop: 4 }}>{summary}</div>
        </div>
        {meetUrl && (
          <a href={meetUrl} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
            Google Meet に参加
          </a>
        )}
        <button
          type="button"
          aria-label={open ? "閉じる" : "開く"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          style={{ background: "none", border: 0, padding: 4, cursor: "pointer", color: "var(--color-ink-soft)", lineHeight: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--color-border)", padding: "12px 14px" }}>
          {message && <p style={{ margin: "0 0 10px", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{message}</p>}
          {meeting && <MineMeetingLine meeting={meeting} viewer="requester" compact />}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: message || meeting ? 12 : 0 }}>
            {!declined && meetingButton}
            {!interview && (
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onRequestInterview}>
                面談に進む
              </button>
            )}
            {interview === "requested" && (
              <span style={{ alignSelf: "center", color: "var(--color-ink-soft)" }}>講師の返事待ちです。公開されると決定できます。</span>
            )}
            {interview === "released" && (
              <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onDecide}>
                この講師に決定する
              </button>
            )}
            {onCancelRequest && (
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={onCancelRequest}>
                依頼をキャンセルする
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
