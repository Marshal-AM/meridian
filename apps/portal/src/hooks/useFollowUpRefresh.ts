import { useCallback } from "react";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Re-fetch immediately, then poll a few more times while indexers catch up. */
export function useFollowUpRefresh(
  refresh: () => Promise<void>,
  options?: { attempts?: number; intervalMs?: number }
) {
  const attempts = options?.attempts ?? 5;
  const intervalMs = options?.intervalMs ?? 2000;

  return useCallback(async () => {
    for (let i = 0; i < attempts; i++) {
      await refresh();
      if (i < attempts - 1) {
        await sleep(intervalMs);
      }
    }
  }, [refresh, attempts, intervalMs]);
}
