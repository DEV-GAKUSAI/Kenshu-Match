// Things that wait for a person inside an opened request (order / invoice / released name).
// Pure rules live here so they can be tested; the data load is in docs-status.ts.

export type DocState = {
  order?: { status: string; revision: number } | null;
  invoice?: { status: string; revision: number } | null;
};

export type Wait = { key: string; label: string };

/** What a doc is waiting for from this person. `key` changes when a new version / event appears. */
export function docWaits(role: "instructor" | "requester", doc: DocState | undefined | null): Wait[] {
  const out: Wait[] = [];
  if (!doc) return out;
  const o = doc.order;
  const i = doc.invoice;
  if (role === "instructor") {
    if (o && o.status === "issued") out.push({ key: `order:issued:${o.revision}`, label: "注文書の確認" });
    if (i && i.status === "returned") out.push({ key: `invoice:returned:${i.revision}`, label: "請求書の修正" });
  } else {
    if (o && o.status === "declined") out.push({ key: `order:declined:${o.revision}`, label: "注文書が辞退されました" });
    if (i && i.status === "submitted") out.push({ key: `invoice:submitted:${i.revision}`, label: "請求書の確認" });
  }
  return out;
}

export function waitSeenKey(requestId: string, waitKey: string): string {
  return `kl-seen:${requestId}:${waitKey}`;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): Store | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isWaitSeen(requestId: string, waitKey: string, store: Store | null = defaultStore()): boolean {
  if (!store) return false; // storage not available: the dot just shows
  try {
    return store.getItem(waitSeenKey(requestId, waitKey)) === "1";
  } catch {
    return false;
  }
}

export function markWaitsSeen(requestId: string, waitKeys: string[], store: Store | null = defaultStore()): void {
  if (!store) return;
  for (const k of waitKeys) {
    try {
      store.setItem(waitSeenKey(requestId, k), "1");
    } catch {
      /* ignore */
    }
  }
}

/** true when at least one wait has not been looked at yet */
export function hasUnseenWait(requestId: string, waits: Wait[], store: Store | null = defaultStore()): boolean {
  return waits.some((w) => !isWaitSeen(requestId, w.key, store));
}

/** Which step of 注文書→確認→請求書 is current: 0 issue, 1 lecturer checks, 2 invoice after the training, 3 all done. */
export function docFlowIndex(doc: DocState | undefined | null): number {
  const o = doc?.order;
  const i = doc?.invoice;
  if (i && (i.status === "submitted" || i.status === "confirmed" || i.status === "paid")) return 3;
  if (!o) return 0;
  if (o.status === "issued" || o.status === "declined") return 1;
  return 2; // confirmed (an invoice that was sent back is also still step 3 work)
}
