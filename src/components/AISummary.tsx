"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "@/lib/api";

interface SummaryData {
  summary: string | null;
  reviewCount: number;
  message?: string;
  error?: string;
}

export function AISummary({ unitCode }: { unitCode: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [refreshToken] = useState(() => Date.now().toString());

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchSummary() {
      try {
        setRetryMessage(null);
        const res = await fetch(
          `/api/reviews/summarize?unitCode=${encodeURIComponent(unitCode)}&refresh=1&r=${refreshToken}`
        );
        const json = await parseJsonResponse<SummaryData | { error?: string; message?: string }>(res);

        if (!res.ok) {
          const maybeError = (json as { error?: string }).error;
          const error = typeof maybeError === "string" ? maybeError : "Failed to load AI summary";

          // The summarize endpoint intentionally enforces short warmups for
          // anti-abuse. In this case, retry automatically so the summary appears
          // without requiring a manual page refresh.
          if (res.status === 429 && !cancelled) {
            setRetryMessage(error);
            retryTimer = setTimeout(fetchSummary, 3000);
            return;
          }

          if (!cancelled) {
            setData({ summary: null, reviewCount: 0, error });
          }
          return;
        }

        if (!cancelled) {
          setData(json as SummaryData);
        }
      } catch {
        if (!cancelled) {
          setData({ summary: null, reviewCount: 0, error: "Failed to load AI summary" });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [unitCode, refreshToken]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5 animate-pulse">
        <div className="h-4 w-48 rounded bg-slate-200" />
        <div className="mt-3 h-20 rounded bg-slate-200" />
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        {retryMessage ||
          data?.error ||
          data?.message ||
          "AI summary will appear once more than one review is posted for this unit."}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <h3 className="font-semibold text-violet-900">
          AI Summary ({data.reviewCount} reviews)
        </h3>
      </div>

      <div className="mt-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {data.summary}
      </div>
    </div>
  );
}
