"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ApplyItemsBox, QuoteHistoryBox } from "@/components/requests/ApplicationDetails";
import { quoteText, quoteVsRange, type MoneyFields } from "@/lib/requests/money";
import { getResponseChanges, type ResponseChange } from "@/lib/requests/instructor-responses";
import { MineMeetingLine } from "@/components/mine/MineMeeting";
import { formatMeetingTimeClient } from "@/lib/mine/meeting-format";
import { Select } from "@/components/ui/Select";
import { MANUAL_STAGE_OPTIONS, STAGE_LABEL, type StageKey } from "@/lib/requests/stage";
import { INTERVIEW_STEPS, interviewGuide } from "@/lib/requests/interview-guide";
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
  onCancelRequest,
  decidedLabel,
  decideExtra,
  stage,
  onStageChange,
  onRequestInterview,
  budget,
}: {
  name: string;
  response: InstructorResponseRow;
  meeting: KenshuMineMeetingRow | undefined;
  /** 「日程変更・キャンセル」 or 「面談を予約」, built by the page (null when neither applies). */
  meetingButton: ReactNode;
  busy: boolean;
  onDecide: () => void;
  /** Cancelling the whole request (only while no instructor is chosen yet). */
  onCancelRequest?: () => void;
  /** Set when this instructor is already decided into a role slot (e.g. 「決定：サブ講師」). */
  decidedLabel?: string | null;
  /** Shown before the decide button (the role chooser when the request has role slots). */
  decideExtra?: ReactNode;
  /** The selection stage to show (応募 is not shown as a chip). */
  stage?: StageKey;
  /** Set while the company can still change the stage by hand (nobody decided for this applicant). */
  onStageChange?: (value: "" | "screening" | "negotiation" | "passed") => void;
  /** Ask for an interview without booking a meeting (only while the request is open). */
  onRequestInterview?: () => void;
  /** The request's budget, to say whether a quote is inside a range budget. */
  budget?: MoneyFields;
}) {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<ResponseChange[]>([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getResponseChanges(response.response_id).then((rows) => alive && setChanges(rows));
    return () => {
      alive = false;
    };
  }, [open, response.response_id, response.quote_price, response.action]);
  // The meeting while it is still upcoming (not cancelled, not finished).
  const live = meeting && isActive(meeting) ? meeting : undefined;
  const needsAnswer = live?.status === "change_requested" && live.proposed_by === "host";
  const meetUrl = live?.meeting_type === "google_meet" || live?.meeting_type === "zoom" ? live.meeting_url : null;
  const isNew = response.requester_seen_at === null;
  // For a range budget, say whether the quote is inside it (a label only).
  const range = response.action === "accept" || !budget ? null : quoteVsRange(budget, response);
  const offer = response.action === "accept" ? "承諾" : `${quoteText(response)}${range === "in" ? "（予算の範囲内）" : range === "out" ? "（予算の範囲外）" : ""}`;
  const message = (response.message ?? "").trim();
  const interview = response.interview_status;
  const declined = interview === "declined";
  // Until the instructor agrees to the interview only the initials are known.
  const shownName = response.released_name?.trim() || name;
  const guide = interviewGuide({ interview, decided: !!decidedLabel, passed: stage === "passed", canBook: !!meetingButton });

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
            {decidedLabel && <span style={pill("#17B08A", "#fff")}>{decidedLabel}</span>}
            {!decidedLabel && (stage === "screening" || stage === "negotiation") && <span style={pill("#EEF1FF", "#3B4BB8")}>{STAGE_LABEL[stage]}</span>}
            {!decidedLabel && stage === "passed" && <span style={pill("#EEE", "#666")}>見送り</span>}
            {!decidedLabel && interview === "requested" && <span style={pill("#FFF1DB", "#9A5B0C")}>面談依頼中</span>}
            {!decidedLabel && interview === "released" && <span style={pill("#E3F7F0", "#0E7A5F")}>情報公開済み</span>}
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
          <a
            href={meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary btn--sm"
            style={live?.meeting_type === "zoom" ? { background: "#2d8cff", borderColor: "#2d8cff", color: "#fff" } : undefined}
          >
            {live?.meeting_type === "zoom" ? "Zoom に参加" : "Google Meet に参加"}
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
          <ApplyItemsBox response={response} />
          <QuoteHistoryBox changes={changes} response={response} />
          {meeting && <MineMeetingLine meeting={meeting} viewer="requester" compact />}
          {!declined && stage !== "passed" && (
            <ol aria-label="決定までの流れ" style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", margin: "0 0 10px", padding: 0, fontSize: 11.5 }}>
              {INTERVIEW_STEPS.map((label, i) => (
                <li
                  key={label}
                  aria-current={i === guide.done ? "step" : undefined}
                  style={{
                    ...pill(i < guide.done ? "#E3F7F0" : i === guide.done ? "#FFF1DB" : "var(--color-bg-soft, #f3f4f6)", i < guide.done ? "#0E7A5F" : i === guide.done ? "#9A5B0C" : "var(--color-ink-soft)"),
                    fontWeight: i === guide.done ? 800 : 600,
                  }}
                >
                  {i < guide.done ? "✓ " : `${i + 1}. `}
                  {label}
                </li>
              ))}
            </ol>
          )}
          {guide.hint && <p style={{ margin: "0 0 10px", color: "var(--color-ink-soft)" }}>{guide.hint}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: message || meeting ? 12 : 0 }}>
            {!declined && meetingButton}
            {guide.canRequest && onRequestInterview && (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onRequestInterview}>
                {busy ? "処理中…" : "面談を依頼する"}
              </button>
            )}
            {!decidedLabel && interview === "requested" && (
              <span style={{ alignSelf: "center", color: "var(--color-ink-soft)" }}>講師の返事待ちです。公開されると決定できます。</span>
            )}
            {!decidedLabel && interview === "released" && stage === "passed" && (
              <span style={{ alignSelf: "center", color: "var(--color-ink-soft)" }}>見送りにしているため決定できません。決定するには、選考段階を変えてください。</span>
            )}
            {!decidedLabel && interview === "released" && stage !== "passed" && (
              <>
                {decideExtra}
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onDecide}>
                  {busy ? "処理中…" : "この講師に決定する"}
                </button>
              </>
            )}
            {onStageChange && !decidedLabel && !declined && (
              <Select
                aria-label="選考段階"
                value={response.stage ?? ""}
                disabled={busy}
                onChange={(e) => onStageChange(e.target.value as "" | "screening" | "negotiation" | "passed")}
                style={{ minWidth: 130 }}
              >
                {MANUAL_STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    選考段階：{o.label}
                  </option>
                ))}
              </Select>
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
