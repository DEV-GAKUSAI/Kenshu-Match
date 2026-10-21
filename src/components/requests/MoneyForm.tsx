"use client";

import { UNIT_OPTIONS, type BudgetUnit, type CostShare, type PrepCost, type TaxMode } from "@/lib/requests/money";

export type MoneyFormValue = {
  budget: string;
  unit: BudgetUnit;
  tax: TaxMode;
  transport: CostShare;
  lodging: CostShare;
  prep: PrepCost;
  paymentTerms: string;
};

export const EMPTY_MONEY: MoneyFormValue = { budget: "", unit: "hour", tax: "unspecified", transport: "unspecified", lodging: "unspecified", prep: "unspecified", paymentTerms: "" };

/** The fields to send with a new request. */
export function moneyPayload(v: MoneyFormValue) {
  return {
    budget: Number(v.budget) || null,
    budget_unit: v.unit,
    tax_mode: v.tax,
    transport_cost: v.transport,
    lodging_cost: v.lodging,
    prep_cost: v.prep,
    payment_terms: v.paymentTerms.trim() || null,
  };
}

/** 想定予算（種類・金額・税）と費用・支払条件. Used by the open request form and the direct request form. */
export function MoneyForm({ value, onChange, idPrefix = "req" }: { value: MoneyFormValue; onChange: (v: MoneyFormValue) => void; idPrefix?: string }) {
  const set = (patch: Partial<MoneyFormValue>) => onChange({ ...value, ...patch });
  const share = (v: string) => set({ transport: v as CostShare });
  return (
    <>
      <div className="form-field">
        <label htmlFor={`${idPrefix}Budget`}>想定予算（円）</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select aria-label="金額の種類" value={value.unit} onChange={(e) => set({ unit: e.target.value as BudgetUnit })} style={{ flex: "0 1 190px" }}>
            {UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            id={`${idPrefix}Budget`}
            placeholder={value.unit === "total" ? "例：300000" : value.unit === "day" ? "例：80000" : "例：15000"}
            min={0}
            step={1000}
            value={value.budget}
            onChange={(e) => set({ budget: e.target.value })}
            style={{ flex: "1 1 140px", minWidth: 0 }}
          />
          <select aria-label="税" value={value.tax} onChange={(e) => set({ tax: e.target.value as TaxMode })} style={{ flex: "0 1 130px" }}>
            <option value="unspecified">税の指定なし</option>
            <option value="included">税込</option>
            <option value="excluded">税別</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`${idPrefix}Transport`}>交通費</label>
          <select id={`${idPrefix}Transport`} value={value.transport} onChange={(e) => share(e.target.value)}>
            <option value="unspecified">未指定</option>
            <option value="company">企業が負担</option>
            <option value="included">料金に含む</option>
            <option value="none">なし</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`${idPrefix}Lodging`}>宿泊費</label>
          <select id={`${idPrefix}Lodging`} value={value.lodging} onChange={(e) => set({ lodging: e.target.value as CostShare })}>
            <option value="unspecified">未指定</option>
            <option value="company">企業が負担</option>
            <option value="included">料金に含む</option>
            <option value="none">なし</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor={`${idPrefix}Prep`}>準備・事前打合せの費用</label>
          <select id={`${idPrefix}Prep`} value={value.prep} onChange={(e) => set({ prep: e.target.value as PrepCost })}>
            <option value="unspecified">未指定</option>
            <option value="included">料金に含む</option>
            <option value="extra">別途</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor={`${idPrefix}PayTerms`}>支払条件（任意）</label>
          <input type="text" id={`${idPrefix}PayTerms`} maxLength={300} placeholder="例：月末締め翌月末払い" value={value.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} />
        </div>
      </div>
    </>
  );
}
