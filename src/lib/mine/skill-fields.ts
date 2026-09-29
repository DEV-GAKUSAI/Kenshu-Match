/**
 * Pure helpers that turn the training-field names sent by Mine into real
 * Kenshu Link subcategory IDs, and plan which expertise rows to add/remove.
 *
 * Mine sends NAMES only. A name is used only if a real row in
 * training_subcategories has the same normalised name; nothing is ever
 * created and unknown names are ignored.
 */

export type Subcategory = { id: string; name: string };

export function normalizeFieldName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･/\-_.,、。]/g, "");
}

export function resolveSubcategoryIds(
  fieldNames: readonly string[],
  subcategories: readonly Subcategory[],
): string[] {
  const wanted = new Set(fieldNames.map(normalizeFieldName).filter(Boolean));
  const ids = new Set<string>();
  for (const subcategory of subcategories) {
    if (wanted.has(normalizeFieldName(subcategory.name))) ids.add(subcategory.id);
  }
  return [...ids].sort();
}

export type ExpertiseSyncPlan = {
  toAdd: string[];
  toRemove: string[];
  /** Rows that should be recorded as "added from Mine" after the sync. */
  syncedAfter: string[];
};

/**
 * desired          = subcategories that Mine's skills map to right now
 * existing         = every subcategory the instructor currently has
 * previouslySynced = subset of existing that an earlier sync added
 */
export function planExpertiseSync(input: {
  desired: readonly string[];
  existing: readonly string[];
  previouslySynced: readonly string[];
}): ExpertiseSyncPlan {
  const desired = new Set(input.desired);
  const existing = new Set(input.existing);
  const previouslySynced = new Set(input.previouslySynced);

  const toAdd = [...desired].filter((id) => !existing.has(id)).sort();
  const toRemove = [...previouslySynced]
    .filter((id) => !desired.has(id) && existing.has(id))
    .sort();
  const kept = [...previouslySynced].filter((id) => desired.has(id) && existing.has(id));
  const syncedAfter = [...new Set([...kept, ...toAdd])].sort();
  return { toAdd, toRemove, syncedAfter };
}
