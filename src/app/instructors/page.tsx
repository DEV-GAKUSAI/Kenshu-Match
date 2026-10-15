"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getInstructorDirectory } from "@/lib/instructor/profile";
import { getTrainingCategoriesWithSubcategories } from "@/lib/instructor/expertise";
import { withMineDisplay } from "@/lib/mine/display";
import { withSurveySummary } from "@/lib/survey/summary-client";
import { InstructorCard } from "@/components/instructors/InstructorCard";
import type { InstructorPublicDirectoryRow } from "@/types/database";
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

  // Only one filter panel open at a time (mirrors the legacy <details> group behavior).
  const [openPanel, setOpenPanel] = useState<"area" | "format" | "expertise" | null>(null);
  const areaOpen = openPanel === "area";
  const formatOpen = openPanel === "format";
  const expertiseOpen = openPanel === "expertise";
  const setAreaOpen = (open: boolean) => setOpenPanel(open ? "area" : (p) => (p === "area" ? null : p));
  const setFormatOpen = (open: boolean) => setOpenPanel(open ? "format" : (p) => (p === "format" ? null : p));
  const setExpertiseOpen = (open: boolean) => setOpenPanel(open ? "expertise" : (p) => (p === "expertise" ? null : p));

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await getInstructorDirectory();
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      // Initials plus only what each instructor allowed in Mine (no full names, old rates or photos).
      setAllInstructors(await withSurveySummary(await withMineDisplay(data || [])));
      setLoading(false);
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
  }

  const filtered = useMemo(() => {
    const min = rateMin ? Number(rateMin) : null;
    const max = rateMax ? Number(rateMax) : null;

    return allInstructors.filter((ins) => {
      if (selectedAreas.length) {
        const online = ins.work_style === "ONLINE" || ins.work_style === "HYBRID";
        const areaOk = selectedAreas.some((a) => (a === ONLINE_AREA ? online : (ins.prefectures || []).includes(a)));
        if (!areaOk) return false;
      }
      if (selectedFormats.length) {
        const matches = (ins.work_style && selectedFormats.includes(ins.work_style)) || (ins.work_style === "HYBRID" && selectedFormats.length);
        if (!matches) return false;
      }
      if (min != null && (ins.desired_rate_max == null || ins.desired_rate_max < min)) return false;
      if (max != null && (ins.desired_rate_min == null || ins.desired_rate_min > max)) return false;
      if (selectedFields.length && !selectedFields.some((f) => (ins.expertise_fields || []).includes(f))) return false;
      if (categorySubcategoryNames && !(ins.expertise_fields || []).some((f) => categorySubcategoryNames.includes(f))) return false;
      return true;
    });
  }, [allInstructors, selectedAreas, selectedFormats, selectedFields, rateMin, rateMax, categorySubcategoryNames]);

  return (
    <main className="list-page">
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

      <div className="filter-bar">
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

        <div className="filter-field">
          <label htmlFor="filterRateMin">希望単価（円／時間）</label>
          <input type="number" id="filterRateMin" min={0} step={1000} placeholder="例：10000" value={rateMin} onChange={(e) => setRateMin(e.target.value)} />
        </div>

        <div className="filter-field">
          <label htmlFor="filterRateMax">最低単価（円／時間）</label>
          <input type="number" id="filterRateMax" min={0} step={1000} placeholder="例：20000" value={rateMax} onChange={(e) => setRateMax(e.target.value)} />
        </div>

        <button type="button" className="filter-reset" onClick={resetFilters}>
          条件をリセット
        </button>
      </div>

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
        {!loading && !loadError && filtered.map((ins) => <InstructorCard key={ins.id} instructor={ins} />)}
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
