import { createClient } from "@/lib/supabase/client";
import type { DetailOption } from "./detail-options";

let cache: Promise<DetailOption[]> | null = null;

/** Loads the catalogue once per page load. */
export function loadDetailOptions(): Promise<DetailOption[]> {
  if (!cache) {
    cache = (async () => {
      const { data, error } = await createClient().from("training_detail_options").select("id, group_key, name, sort_order").order("sort_order");
      if (error || !data) {
        cache = null;
        return [];
      }
      return data as unknown as DetailOption[];
    })();
  }
  return cache;
}

