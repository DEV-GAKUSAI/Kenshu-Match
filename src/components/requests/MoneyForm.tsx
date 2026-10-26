"use client";

import { MAX_AMOUNT, UNIT_OPTIONS, budgetInputError, budgetMode, budgetText, costAmountError, costLines, type BudgetMode, type BudgetUnit, type CostShare, type MoneyFields, type PrepCost, type TaxMode } from "@/lib/requests/money";
import { Select } from "@/components/ui/Select";

export type MoneyFormValue = {
  mode: BudgetMode;
  budget: string;
  /** upper end of a range */
  budgetMax: string;
  unit: BudgetUnit;
  tax: TaxMode;
  transport: CostShare;
  lodging: CostShare;
  prep: PrepCost;
  /** yen for 準備・事前打合せ (only when prep is 別途) */
  prepAmount: string;
  /** yen for 事前研修費 */
  pretraining: string;
  paymentTerms: string;
};

export const EMPTY_MONEY: MoneyFormValue = {
  mode: "fixed",
  budget: "",
  budgetMax: "",
  unit: "hour",
  tax: "unspecified",
  transport: "unspecified",
  lodging: "unspecified",
  prep: "unspecified",
  prepAmount: "",
  pretraining: "",
  paymentTerms: "",
};

/** The form values of a saved request (copy / edit). */
export function moneyFromRow(r: MoneyFields & { budget_unit?: string | null }): MoneyFormValue {
  const unit: BudgetUnit = r.budget_unit === "day" || r.budget_unit === "total" ? r.budget_unit : "hour";
  return {
    mode: budgetMode(r),
    budget: r.budget ? String(r.budget) : "",
    budgetMax: r.budget_max ? String(r.budget_max) : "",
    unit,
    tax: (r.tax_mode as TaxMode) ?? "unspecified",
    transport: (r.transport_cost as CostShare) ?? "unspecified",
    lodging: (r.lodging_cost as CostShare) ?? "unspecified",
    prep: (r.prep_cost as PrepCost) ?? "unspecified",
    prepAmount: r.prep_amount ? String(r.prep_amount) : "",
    pretraining: r.pretraining_amount ? String(r.pretraining_amount) : "",
    paymentTerms: r.payment_terms ?? "",
  };
}

/** Message for a wrong entry in the money area; null when fine. */
export function moneyError(v: MoneyFormValue): string | null {
  return budgetInputError({ mode: v.mode, budget: v.budget, budgetMax: v.budgetMax }) ?? costAmountError({ prep: v.prep === "extra" ? v.prepAmount : "", pretraining: v.pretraining });
}

/**
 * The fields to save with a request. The new columns (migration 185) are only sent when they are not the default,
 * so saving a normal request keeps working before the SQL is run. `always` sends them every time (editing a request that has them).
 */
export function moneyPayload(v: MoneyFormValue, always = false) {
  const base = {
    budget: v.mode === "negotiable" ? null : Number(v.budget) || null,
    budget_unit: v.unit,
    tax_mode: v.tax,
    transport_cost: v.transport,
    lodging_cost: v.lodging,
    prep_cost: v.prep,
    payment_terms: v.paymentTerms.trim() || null,
  };
  const prepAmount = v.prep === "extra" && v.prepAmount.trim() ? Number(v.prepAmount) : null;
  const pretraining = v.pretraining.trim() ? Number(v.pretraining) : null;
  const extra = {
    budget_mode: v.mode,
    budget_max: v.mode === "range" ? Number(v.budgetMax) || null : null,
    prep_amount: prepAmount,
    pretraining_amount: pretraining,
  };
  const isDefault = v.mode === "fixed" && prepAmount === null && pretraining === null;
  return always || !isDefault ? { ...base, ...extra } : base;
}

const MODE_HELP: Record<BudgetMode, string> = {
  fixed: "金額が決まっているときに選びます。",
  range: "「下限〜上限」で幅を伝えます。講師はその幅を目安に見積りを送ります。",
  negotiable: "金額は決めずに、講師の見積りを見て相談します。決定後に、注文書で金額を入力します。",
};

/** 想定予算（決め方・種類・金額・税）と費用・支払条件. Used by the open request form, the direct request form and the edit form. */
export function MoneyForm({ value, onChange, idPrefix = "req" }: { value: MoneyFormValue; onChange: (v: MoneyFormValue) => void; idPrefix?: string }) {
  const set = (patch: Partial<MoneyFormValue>) => onChange({ ...value, ...patch });
  const per = value.unit === "total" ? "例：300000" : value.unit === "day" ? "例：80000" : "例：15000";
  const preview = moneyError(value) ? null : [budgetText({ ...moneyPayload(value, true) }), ...costLines(moneyPayload(value, true))].filter(Boolean).join("　／　");
  return (
    <>
      <div className="form-field">
        <label htmlFor={`${idPrefix}BudgetMode`}>想定予算</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Select id={`${idPrefix}BudgetMode`} aria-label="予算の決め方" value={value.mode} onChange={(e) => set({ mode: e.target.value as BudgetMode })} style={{ flex: "0 1 170px" }}>
            <option value="fixed">金額を決める</option>
            <option value="range">範囲を指定</option>
            <option value="negotiable">応相談</option>
          </Select>
          <Select aria-label="金額の種類" value={value.unit} onChange={(e) => set({ unit: e.target.value as BudgetUnit })} style={{ flex: "0 1 190px" }}>
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {value.mode !== "negotiable" && (
            <input
              type="number"
              id={`${idPrefix}Budget`}
              aria-label={value.mode === "range" ? "予算の下限（円）" : "予算（円）"}
              placeholder={value.mode === "range" ? `下限（円）${per}` : `金額（円）${per}`}
              min={0}
              max={MAX_AMOUNT}
              step={1000}
              value={value.budget}
              onChange={(e) => set({ budget: e.target.value })}
              style={{ flex: "1 1 140px", minWidth: 0 }}
            />
          )}
          {value.mode === "range" && (
            <>
              <span style={{ alignSelf: "center" }}>〜</span>
              <input
                type="number"
                aria-label="予算の上限（円）"
                placeholder="上限（円）"
                min={0}
                max={MAX_AMOUNT}
                step={1000}
                value={value.budgetMax}
                onChange={(e) => set({ budgetMax: e.target.value })}
                style={{ flex: "1 1 140px", minWidth: 0 }}
              />
            </>
          )}
          <Select aria-label="税" value={value.tax} onChange={(e) => set({ tax: e.target.value as TaxMode })} style={{ flex: "0 1 130px" }}>
            <option value="unspecified">税の指定なし</option>
            <option value="included">税込</option>
            <option value="excluded">税別</option>
          </Select>
        </div>
        <small style={{ color: "var(--color-ink-soft)" }}>{MODE_HELP[value.mode]}</small>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`${idPrefix}Transport`}>交通費</label>
          <Select id={`${idPrefix}Transport`} value={value.transport} onChange={(e) => set({ transport: e.target.value as CostShare })}>
            <option value="unspecified">未指定</option>
            <option value="company">企業が負担</option>
            <option value="included">料金に含む</option>
            <option value="none">なし</option>
          </Select>
        </div>
        <div className="form-field">
          <label htmlFor={`${idPrefix}Lodging`}>宿泊費</label>
          <Select id={`${idPrefix}Lodging`} value={value.lodging} onChange={(e) => set({ lodging: e.target.value as CostShare })}>
            <option value="unspecified">未指定</option>
            <option value="company">企業が負担</option>
            <option value="included">料金に含む</option>
            <option value="none">なし</option>
          </Select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`${idPrefix}Prep`}>準備・事前打合せの費用</label>
          <Select id={`${idPrefix}Prep`} value={value.prep} onChange={(e) => set({ prep: e.target.value as PrepCost, prepAmount: e.target.value === "extra" ? value.prepAmount : "" })}>
            <option value="unspecified">未指定</option>
            <option value="included">料金に含む</option>
            <option value="extra">別途</option>
          </Select>
          {value.prep === "extra" && (
            <>
              <input type="number" aria-label="準備・事前打合せ費（円）" placeholder="金額（円・任意）例：5000" min={0} max={MAX_AMOUNT} step={1000} value={value.prepAmount} onChange={(e) => set({ prepAmount: e.target.value })} style={{ marginTop: 6 }} />
              <small style={{ color: "var(--color-ink-soft)" }}>資料作成や打合せなど、本番の登壇料とは別にかかる費用です。</small>
            </>
          )}
        </div>
        <div className="form-field">
          <label htmlFor={`${idPrefix}Pretraining`}>事前研修費（円・任意）</label>
          <input type="number" id={`${idPrefix}Pretraining`} placeholder="例：30000" min={0} max={MAX_AMOUNT} step={1000} value={value.pretraining} onChange={(e) => set({ pretraining: e.target.value })} />
          <small style={{ color: "var(--color-ink-soft)" }}>本番とは別に、事前に行う研修（講師向けの研修など）の費用です。</small>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor={`${idPrefix}PayTerms`}>支払条件（任意）</label>
        <input type="text" id={`${idPrefix}PayTerms`} maxLength={300} placeholder="例：月末締め翌月末払い" value={value.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />
      </div>

      {preview && (
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "0 0 12px" }}>講師には次のように表示されます：{preview}</p>
      )}
    </>
  );
}
