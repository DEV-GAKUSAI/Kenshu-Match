/**
 * Hand-written Supabase types, kept in sync with the live schema captured in
 * supabase/migrations/083_kenshu_match_baseline.sql. Synced 2026-09-02 to
 * add columns that exist live but were missing here (see that migration's
 * header comment for the discrepancies this fixes: rating_avg, is_featured,
 * training_subcategories.description, instructor_responses.reveal_contact/
 * created_at, training_requests.expertise_field nullability, plus several
 * other missing created_at/updated_at columns found during the same pass).
 *
 * NOTE: every row shape below is a `type` alias, not an `interface`.
 * @supabase/postgrest-js structurally checks each Row/Insert/Update against
 * `Record<string, unknown>`, and TypeScript's `interface` declarations don't
 * satisfy that check the way object-literal `type` aliases do (a well-known
 * quirk — see supabase/postgrest-js#544) — using `interface` here silently
 * collapses every query result to `never`.
 */

import type { ScheduleDay } from "@/lib/requests/schedule";
import type { BudgetUnit, CostShare, PrepCost, TaxMode } from "@/lib/requests/money";

export type UserRole = "INSTRUCTOR" | "COMPANY" | "INDIVIDUAL" | "ADMIN";

export type WorkStyle = "ONLINE" | "ONSITE" | "HYBRID";

export type RequestFormat = "online" | "offline" | "both";

export type RequesterType = "company" | "individual";

export type RequestStatus = "pending" | "accepted" | "completed" | "cancelled";

export type ResponseAction = "accept" | "quote" | "reject" | "withdrawn";

export type UserRow = {
  id: string;
  role: UserRole;
  name: string;
  status: string | null;
  email: string;
};

export type RequesterProfileRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  department: string | null;
  position: string | null;
  created_at: string;
  updated_at: string;
};

export type InstructorProfileRow = {
  id: string;
  is_public: boolean;
  is_featured: boolean;
  prefectures: string[] | null;
  years_of_experience: number | null;
  self_pr: string | null;
  work_style: WorkStyle | null;
  desired_rate_min: number | null;
  desired_rate_max: number | null;
  certifications: string[] | null;
  portfolio_url: string | null;
  avatar_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  rating_avg: number;
  created_at: string;
  updated_at: string;
};

export type InstructorExpertiseRow = {
  instructor_id: string;
  subcategory_id: string;
  created_at: string;
};

export type TrainingCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type TrainingSubcategoryRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  created_by: string | null;
};

export type TrainingRequestRow = {
  request_id: string;
  requester_id: string;
  requester_type: RequesterType;
  title: string;
  description: string;
  expertise_field: string;
  budget: number | null;
  participant_count: number | null;
  budget_unit: BudgetUnit;
  tax_mode: TaxMode;
  transport_cost: CostShare;
  lodging_cost: CostShare;
  prep_cost: PrepCost;
  payment_terms: string | null;
  schedule_days: ScheduleDay[];
  all_days_required: boolean;
  req_skills: string | null;
  req_prep: string | null;
  preferred_format: RequestFormat;
  location: string | null;
  preferred_schedule: string | null;
  target_instructor_id: string | null;
  status: RequestStatus;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type InstructorResponseRow = {
  response_id: string;
  request_id: string;
  instructor_id: string;
  action: ResponseAction;
  quote_price: number | null;
  /** per hour / day / total: copied from the request when the quote is sent (migration 152). */
  quote_unit: BudgetUnit | null;
  quote_tax_mode: "included" | "excluded" | null;
  apply_all_days: "all" | "partial" | "none" | null;
  apply_role: string | null;
  apply_experience: string | null;
  apply_materials: "existing" | "create" | "either" | null;
  message: string | null;
  reveal_contact: boolean;
  is_selected: boolean;
  created_at: string;
  result_seen_at: string | null;
  requester_seen_at: string | null;
  /** 公募 interview step: null → requested → released | declined (migration 141). */
  interview_status: InterviewStatus | null;
  interview_requested_at: string | null;
  /** Full name the instructor handed over (or that a direct request releases on accept). */
  released_name: string | null;
  name_released_at: string | null;
};

export type InterviewStatus = "requested" | "released" | "declined";

export type ContactUnlockRow = {
  unlock_id: string;
  request_id: string;
  response_id: string;
  requester_id: string;
  instructor_id: string;
  unlocked_at: string;
};

/** VIEW: public directory of instructor profiles (no contact_email/contact_phone). */
export type InstructorPublicDirectoryRow = {
  id: string;
  name: string | null;
  expertise_fields: string[] | null;
  work_style: WorkStyle | null;
  prefectures: string[] | null;
  desired_rate_min: number | null;
  desired_rate_max: number | null;
  self_pr: string | null;
  certifications: string[] | null;
  portfolio_url: string | null;
  avatar_url: string | null;
  years_of_experience: number | null;
  is_featured: boolean | null;
  created_at: string;
  /** Added on the page from the 研修アンケート summary (not a column of the view). */
  /** 職種 from Mine (not a column of the view). */
  occupation_names?: string[] | null;
  survey_avg?: number | null;
  survey_count?: number | null;
};

/** VIEW: public preview of broadcast (target_instructor_id IS NULL) requests. */
export type OpenRequestPublicPreviewRow = {
  request_id: string;
  title: string;
  description: string;
  requester_type: RequesterType;
  expertise_field: string;
  created_at: string;
  preferred_format: RequestFormat;
  budget: number | null;
  location: string | null;
  preferred_schedule: string | null;
  participant_count: number | null;
  budget_unit: BudgetUnit;
  tax_mode: TaxMode;
  transport_cost: CostShare;
  lodging_cost: CostShare;
  prep_cost: PrepCost;
  payment_terms: string | null;
  schedule_days: ScheduleDay[];
  all_days_required: boolean;
  req_skills: string | null;
  req_prep: string | null;
};

/** A meeting booked on the instructor's Mine page (sent by Mine; see 124_kenshu_mine_meetings.sql). */
export type KenshuMineMeetingRow = {
  booking_id: string;
  response_id: string;
  request_id: string;
  requester_id: string;
  instructor_id: string;
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
  change_reason: string | null;
  version: string;
  received_at: string;
};

// @supabase/postgrest-js's GenericTable/GenericView require a Relationships
// field structurally (even when empty) or the generic client's type
// inference silently collapses every query result to `never`.
type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type ViewDef<Row> = {
  Row: Row;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      users: TableDef<UserRow>;
      requester_profiles: TableDef<RequesterProfileRow>;
      instructor_profiles: TableDef<InstructorProfileRow>;
      instructor_expertise: TableDef<InstructorExpertiseRow>;
      training_categories: TableDef<TrainingCategoryRow>;
      training_subcategories: TableDef<TrainingSubcategoryRow>;
      training_requests: TableDef<TrainingRequestRow>;
      instructor_responses: TableDef<InstructorResponseRow>;
      contact_unlocks: TableDef<ContactUnlockRow>;
      kenshu_mine_meetings: TableDef<KenshuMineMeetingRow>;
    };
    Views: {
      instructor_public_directory: ViewDef<InstructorPublicDirectoryRow>;
      open_requests_public_preview: ViewDef<OpenRequestPublicPreviewRow>;
    };
    Functions: {
      request_interview: { Args: { p_response_id: string }; Returns: void };
      release_instructor_name: { Args: { p_response_id: string }; Returns: void };
      decline_interview: { Args: { p_response_id: string }; Returns: void };
      complete_oauth_profile: {
        Args: { p_role: UserRole; p_name: string };
        Returns: void;
      };
      /**
       * Shared with engineer-match-platform (same DB function, not defined
       * in this repo's migrations) — the only writer for admin_audit_logs.
       */
      admin_write_audit_log: {
        Args: {
          p_action_type: string;
          p_target_type: string;
          p_target_id: string;
          p_before_data?: unknown | null;
          p_after_data?: unknown | null;
          p_reason?: string | null;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
