let lastCall = 0;

/** Ask the server to send any queued Mine notices. Fire-and-forget, at most every 20 s. */
export function flushMineNotices(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastCall < 20_000) return;
  lastCall = now;
  void fetch("/api/mine/notice-flush", { method: "POST", keepalive: true }).catch(() => {});
}
