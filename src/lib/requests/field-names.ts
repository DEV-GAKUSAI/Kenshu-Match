import { getTrainingSubcategoryOptions } from "@/lib/instructor/expertise";

let cache: Promise<Record<string, string>> | null = null;

/** 研修分野 id -> name, loaded once per page load. */
export function loadFieldNames(): Promise<Record<string, string>> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await getTrainingSubcategoryOptions();
      if (error || !data) {
        cache = null;
        return {};
      }
      return Object.fromEntries(((data as unknown as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name]));
    })();
  }
  return cache;
}
