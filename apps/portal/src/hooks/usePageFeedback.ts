import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "../lib/utils";

/** Success + error banners with auto-dismiss and keyed loading state for async actions. */
export function usePageFeedback(dismissMs = 8000) {
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), dismissMs);
    return () => clearTimeout(t);
  }, [success, dismissMs]);

  const isLoading = useCallback((key: string) => loadingKey === key, [loadingKey]);

  const begin = useCallback((key: string) => {
    setLoadingKey(key);
    setError("");
  }, []);

  const end = useCallback(() => setLoadingKey(null), []);

  const fail = useCallback((err: unknown) => {
    setError(formatApiError(err));
    setLoadingKey(null);
  }, []);

  const succeed = useCallback((message: string) => {
    setSuccess(message);
    setLoadingKey(null);
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return {
    success,
    setSuccess,
    error,
    setError,
    clearError,
    isLoading,
    loadingKey,
    begin,
    end,
    fail,
    succeed,
  };
}
