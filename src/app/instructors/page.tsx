"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getInstructorDirectory } from "@/lib/instructor/profile";
import { getTrainingCategoriesWithSubcategories } from "@/lib/instructor/expertise";
import { withMineDisplay } from "@/lib/mine/display";
import { withSurveySummary } from "@/lib/survey/summary-client";
import { sortBySurveyAvg } from "@/lib/survey/summary";
import { InstructorCard } from "@/components/instructors/InstructorCard";
import { getTeachingCounts } from "@/lib/requester/partners";
import type { InstructorPublicDirectoryRow } from "@/types/database";
import { EMPTY_AVAILABILITY_FILTER, ROLE_LABEL, isAvailabilityFilterActive, matchesAvailability, periodLabel, rolesLabel, type AvailabilityFilter } from "@/lib/mine/availability";
import "./instructors.css";

const ONLINE_AREA = "オンライン対応（全国）";

const JP_PREFECTURES = [
  "オンライン対応（全国）",
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

interface CategoryTaxonomy {
  name: string;
  subcategoryNames: string[];
}

function MultiSelect({
  options,
  selected,
  onToggle,
  open,
  onOpenChange,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const summary = selected.length ? `${selected.length}件選択中` : "すべて";
  return (
    <details
      className="multi-select"
      open={open}
      onToggle={(e) => onOpenChange((e.target as HTMLDetailsElement).open)}
    >
      <summary>{summary}</summary>
      <div className="multi-select__panel">
        {options.map((opt) => (
          <label key={opt} className="multi-select__option">
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    </details>
  );
}

const AVAIL_LANGUAGES = ["日本語", "英語", "ベトナム語", "中国語", "その他"];

const RATE_PRESETS = [3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000, 20000];

/** Rate dropdown, same look as the other filters: first "no limit", then "type your own", then presets. */
function RateSelect({
  value,
  onChange,
  noneLabel,
  minAllowed,
  open,
  onOpenChange,
}: {
  value: string;
  onChange: (v: string) => void;
  noneLabel: string;
  minAllowed?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const summary = value === "" ? noneLabel : `¥${Number(value).toLocaleString()}`;
  const isPreset = value !== "" && RATE_PRESETS.includes(Number(value));
  return (
    <details className="multi-select" open={open} onToggle={(e) => onOpenChange((e.target as HTMLDetailsElement).open)}>
      <summary>{summary}</summary>
      <div className="multi-select__panel rate-panel">
        <button
          type="button"
          className={`rate-option${value === "" ? " is-selected" : ""}`}
          onClick={() => {
            onChange("");
            onOpenChange(false);
          }}
        >
          {noneLabel}
        </button>
        <div className="rate-option rate-option--input">
          <input
            type="number"
            min={0}
            step={500}
            placeholder="金額を入力…"
            value={value !== "" && !isPreset ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpenChange(false);
            }}
            aria-label="金額（円）を入力"
          />
        </div>
        {RATE_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={`rate-option${value === String(n) ? " is-selected" : ""}`}
            disabled={minAllowed != null && n < minAllowed}
            onClick={() => {
              onChange(String(n));
              onOpenChange(false);
            }}
          >
            ¥{n.toLocaleString()}
          </button>
        ))}
      </div>
    </details>
  );
}

function InstructorsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const categoryParam = searchParams.get("category");

  const [allInstructors, setAllInstructors] = useState<InstructorPublicDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryTaxonomy[]>([]);
  const [expertiseOptions, setExpertiseOptions] = useState<{ category: string; name: string }[]>([]);

  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [rateMin, setRateMin] = useState("");
  const [rateMax, setRateMax] = useState("");
  const [keyword, setKeyword] = useState("");
  const [includeNoRate, setIncludeNoRate] = useState(false);
  const [includeNoArea, setIncludeNoArea] = useState(false);
  const [avail, setAvail] = useState<AvailabilityFilter>(EMPTY_AVAILABILITY_FILTER);

  // Only one filter panel open at a time (mirrors the legacy <details> group behavior).
  const [openPanel, setOpenPanel] = useState<"area" | "format" | "expertise" | "rateMin" | "rateMax" | "lang" | "role" | null>(null);
  const areaOpen = openPanel === "area";
  const formatOpen = openPanel === "format";
  const expertiseOpen = openPanel === "expertise";
  const setAreaOpen = (open: boolean) => setOpenPanel(open ? "area" : (p) => (p === "area" ? null : p));
  const setFormatOpen = (open: boolean) => setOpenPanel(open ? "format" : (p) => (p === "format" ? null : p));
  // Close an open filter panel when the user clicks outside it or presses Escape.
  useEffect(() => {
    if (!openPanel) return;
    function onPointerDown(event: MouseEvent) {
      if (!(event.target as HTMLElement | null)?.closest?.(".multi-select")) setOpenPanel(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPanel(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openPanel]);
  const setRateMinOpen = (open: boolean) => setOpenPanel(open ? "rateMin" : (p) => (p === "rateMin" ? null : p));
  const setRateMaxOpen = (open: boolean) => setOpenPanel(open ? "rateMax" : (p) => (p === "rateMax" ? null : p));
  const setExpertiseOpen = (open: boolean) => setOpenPanel(open ? "expertise" : (p) => (p === "expertise" ? null : p));

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [taught, setTaught] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data, error } = await getInstructorDirectory();
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      // Initials plus only what each instructor allowed in Mine (no full names, old rates or photos).
      const rows = sortBySurveyAvg(await withSurveySummary(await withMineDisplay(data || [])));
      setAllInstructors(rows);
      setLoading(false);
      // 登壇 count per lecturer (public); the cards simply show nothing if it cannot be loaded.
      setTaught(await getTeachingCounts(rows.map((r) => r.id)));
    })();

    (async () => {
      const { data, error } = await getTrainingCategoriesWithSubcategories();
      if (error || !data) return;
      const cats = data as unknown as { name: string; training_subcategories: { name: string }[] }[];
      setCategories(cats.map((c) => ({ name: c.name, subcategoryNames: (c.training_subcategories || []).map((s) => s.name) })));
      const options: { category: string; name: string }[] = [];
      cats.forEach((c) => (c.training_subcategories || []).forEach((s) => options.push({ category: c.name, name: s.name })));
      setExpertiseOptions(options);

      if (categoryParam) {
        const matched = cats.find((c) => c.name === categoryParam);
        if (matched) setActiveCategoryFilter(matched.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categorySubcategoryNames = useMemo(() => {
    if (!activeCategoryFilter) return null;
    return categories.find((c) => c.name === activeCategoryFilter)?.subcategoryNames || [];
  }, [activeCategoryFilter, categories]);

  function toggleArea(v: string) {
    setSelectedAreas((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  function toggleFormat(v: string) {
    setSelectedFormats((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  function toggleField(v: string) {
    setSelectedFields((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  function clearCategoryFilter() {
    setActiveCategoryFilter(null);
    router.replace("/instructors");
  }

  function resetFilters() {
    setSelectedAreas([]);
    setSelectedFormats([]);
    setSelectedFields([]);
    setRateMin("");
    setRateMax("");
    setKeyword("");
    setIncludeNoRate(false);
    setIncludeNoArea(false);
    setAvail(EMPTY_AVAILABILITY_FILTER);
  }

  const filtered = useMemo(() => {
    const min = rateMin ? Number(rateMin) : null;
    const max = rateMax ? Number(rateMax) : null;
    const kw = keyword.trim().toLowerCase();

    return allInstructors.filter((ins) => {
      if (kw) {
        const hay = [ins.name, ins.self_pr, ...(ins.expertise_fields || []), ...(ins.occupation_names || []), ...(ins.certifications || []), ...(ins.prefectures || []), ...(ins.skill_names || []), ...(ins.experience_names || []), ...(ins.training_languages || []), rolesLabel(ins.roles), ins.available_from || ins.available_until ? periodLabel(ins) : ""]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      const noRate = ins.desired_rate_min == null && ins.desired_rate_max == null;
      if (selectedAreas.length) {
        const online = ins.work_style === "ONLINE" || ins.work_style === "HYBRID";
        const areaOk = selectedAreas.some((a) => (a === ONLINE_AREA ? online : (ins.prefectures || []).includes(a)));
        const noArea = !(ins.prefectures || []).length && !ins.work_style;
        if (!areaOk && !(includeNoArea && noArea)) return false;
      }
      if (selectedFormats.length) {
        const matches = (ins.work_style && selectedFormats.includes(ins.work_style)) || (ins.work_style === "HYBRID" && selectedFormats.length);
        if (!matches) return false;
      }
      if (!(includeNoRate && noRate)) {
        if (min != null && (ins.desired_rate_max == null || ins.desired_rate_max < min)) return false;
        if (max != null && (ins.desired_rate_min == null || ins.desired_rate_min > max)) return false;
      }
      if (!matchesAvailability(ins, avail)) return false;
      if (selectedFields.length && !selectedFields.some((f) => (ins.expertise_fields || []).includes(f))) return false;
      if (categorySubcategoryNames && !(ins.expertise_fields || []).some((f) => categorySubcategoryNames.includes(f))) return false;
      return true;
    });
  }, [allInstructors, selectedAreas, selectedFormats, selectedFields, rateMin, rateMax, categorySubcategoryNames, keyword, includeNoRate, includeNoArea, avail]);

  return (
    <main className="list-page" style={{ maxWidth: 1240 }}>
      <div className="list-page__head">
        <h1 className="list-page__title">講師を探す</h1>
        <p className="list-page__count">
          <strong>{loading ? "-" : filtered.length}</strong> 件の講師が見つかりました
        </p>
      </div>

      {activeCategoryFilter && (
        <div
          className="notice-banner is-visible"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}
        >
          <span>「{activeCategoryFilter}」の分野で絞り込み中です</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={clearCategoryFilter}>
            絞り込みを解除
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "0 0 12px" }}>
        <input
          type="search"
          placeholder="名前・スキル・実績・言語などで探す"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ flex: "1 1 280px", minWidth: 0 }}
        />
        <div style={{ display: "flex", gap: "8px 20px", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
          <input type="checkbox" checked={includeNoArea} onChange={(e) => setIncludeNoArea(e.target.checked)} />
          <span>
            エリアが未登録の講師も含める
            <small style={{ display: "block", color: "var(--color-ink-soft)", fontSize: 11.5, marginTop: 2 }}>エリアで絞り込むときに使います</small>
          </span>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
          <input type="checkbox" checked={includeNoRate} onChange={(e) => setIncludeNoRate(e.target.checked)} />
          <span>
            単価が未登録の講師も含める
            <small style={{ display: "block", color: "var(--color-ink-soft)", fontSize: 11.5, marginTop: 2 }}>単価で絞り込むときに使います</small>
          </span>
        </label>
        </div>
      </div>

      <div className="filter-bar filter-bar--main">
        <div className="filter-field">
          <label>分野（複数選択可）</label>
          <MultiSelect
            options={expertiseOptions.map((o) => o.name)}
            selected={selectedFields}
            onToggle={toggleField}
            open={expertiseOpen}
            onOpenChange={setExpertiseOpen}
          />
        </div>

        <div className="filter-field">
          <label>対応エリア（複数選択可）</label>
          <MultiSelect
            options={JP_PREFECTURES}
            selected={selectedAreas}
            onToggle={toggleArea}
            open={areaOpen}
            onOpenChange={setAreaOpen}
          />
        </div>

        <div className="filter-field">
          <label>形態（複数選択可）</label>
          <details className="multi-select" open={formatOpen} onToggle={(e) => setFormatOpen((e.target as HTMLDetailsElement).open)}>
            <summary>{selectedFormats.length ? `${selectedFormats.length}件選択中` : "すべて"}</summary>
            <div className="multi-select__panel">
              <label className="multi-select__option">
                <input type="checkbox" checked={selectedFormats.includes("ONLINE")} onChange={() => toggleFormat("ONLINE")} /> オンライン
              </label>
              <label className="multi-select__option">
                <input type="checkbox" checked={selectedFormats.includes("ONSITE")} onChange={() => toggleFormat("ONSITE")} /> 対面
              </label>
              <label className="multi-select__option">
                <input type="checkbox" checked={selectedFormats.includes("HYBRID")} onChange={() => toggleFormat("HYBRID")} /> オンライン・対面 両方
              </label>
            </div>
          </details>
        </div>

        <div className="filter-field filter-field--rate">
          <label>単価（円／時間）</label>
          <span style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <RateSelect value={rateMin} onChange={setRateMin} noneLabel="下限なし" open={openPanel === "rateMin"} onOpenChange={setRateMinOpen} />
            <span>〜</span>
            <RateSelect value={rateMax} onChange={setRateMax} noneLabel="上限なし" minAllowed={rateMin ? Number(rateMin) : null} open={openPanel === "rateMax"} onOpenChange={setRateMaxOpen} />
          </span>
        </div>

        <button type="button" className="filter-reset" onClick={resetFilters}>
          条件をリセット
        </button>
      </div>

      <div className="filter-bar filter-bar--avail">
        <div className="filter-field">
          <label>稼働できる期間（この期間すべて）</label>
          <span style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <input type="date" aria-label="期間の始まり" value={avail.from} onChange={(e) => setAvail((a) => ({ ...a, from: e.target.value }))} />
            <span>〜</span>
            <input type="date" aria-label="期間の終わり" value={avail.until} min={avail.from || undefined} onChange={(e) => setAvail((a) => ({ ...a, until: e.target.value }))} />
          </span>
        </div>
        <div className="filter-field">
          <label>対応できる言語（複数選択可）</label>
          <MultiSelect
            options={AVAIL_LANGUAGES}
            selected={avail.languages}
            onToggle={(v) => setAvail((a) => ({ ...a, languages: a.languages.includes(v) ? a.languages.filter((x) => x !== v) : [...a.languages, v] }))}
            open={openPanel === "lang"}
            onOpenChange={(o) => setOpenPanel(o ? "lang" : (p) => (p === "lang" ? null : p))}
          />
        </div>
        <div className="filter-field">
          <label>講師の経験（複数選択可）</label>
          <MultiSelect
            options={["メイン講師", "サブ講師"]}
            selected={avail.roles.map((r) => ROLE_LABEL[r])}
            onToggle={(v) => {
              const key = v === "メイン講師" ? "MAIN" : "SUB";
              setAvail((a) => ({ ...a, roles: a.roles.includes(key) ? a.roles.filter((x) => x !== key) : [...a.roles, key] }));
            }}
            open={openPanel === "role"}
            onOpenChange={(o) => setOpenPanel(o ? "role" : (p) => (p === "role" ? null : p))}
          />
        </div>
      </div>
      {isAvailabilityFilterActive(avail) && (
        <p style={{ fontSize: 12, color: "var(--color-ink-soft)", margin: "6px 0 0" }}>
          言語・経験を選ぶと、Mineで未入力の講師は表示されません。期間が未入力の講師は「いつでも稼働可」として表示されます。
        </p>
      )}

      <div className="instructor-grid">
        {loading && <div className="empty-state"><p className="empty-state__desc">読み込み中…</p></div>}
        {loadError && (
          <div className="empty-state">
            <p className="empty-state__title">読み込みに失敗しました</p>
            <p className="empty-state__desc">{loadError}</p>
          </div>
        )}
        {!loading && !loadError && filtered.length === 0 && (
          <div className="empty-state">
            <span className="hanko hanko--role" style={{ width: 44, height: 44, fontSize: 20 }}>
              無
            </span>
            <p className="empty-state__title">条件に合う講師が見つかりませんでした</p>
            <p className="empty-state__desc">条件を変更するか、リセットして再度お試しください。</p>
          </div>
        )}
        {!loading && !loadError && filtered.map((ins) => <InstructorCard key={ins.id} instructor={ins} taught={taught[ins.id] ?? 0} />)}
      </div>
    </main>
  );
}

export default function InstructorsPage() {
  return (
    <Suspense fallback={<main className="list-page" />}>
      <InstructorsPageInner />
    </Suspense>
  );
}
