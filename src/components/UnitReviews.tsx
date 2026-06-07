"use client";

import { useCallback, useEffect, useState } from "react";
import { ReviewCard } from "./ReviewCard";
import { ReviewForm } from "./ReviewForm";
import { AISummary } from "./AISummary";
import { parseJsonResponse } from "@/lib/api";
import type { PublicReview } from "@/lib/types";

export function UnitReviews({ unitCode }: { unitCode: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [summaryKey, setSummaryKey] = useState(0);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?unitCode=${encodeURIComponent(unitCode)}`);
      const data = await parseJsonResponse<PublicReview[] | { error?: string }>(res);
      setReviews(Array.isArray(data) ? data : []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [unitCode]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Close the modal on Escape and lock background scroll while open. We use a
  // regular overlay (not <dialog>.showModal()) so that the reCAPTCHA challenge
  // popup — which is appended to <body> — can layer above the form. A native
  // modal dialog renders in the browser top layer and would cover it.
  useEffect(() => {
    if (!showForm) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowForm(false);
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showForm]);

  function openForm() {
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
  }

  function handleSubmitted() {
    closeForm();
    setSummaryKey((k) => k + 1);
    fetchReviews();
  }

  return (
    <div className="space-y-8">
      <AISummary key={summaryKey} unitCode={unitCode} />

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          Reviews ({reviews.length})
        </h3>
        <button
          type="button"
          onClick={openForm}
          className="relative z-10 cursor-pointer rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
        >
          Write a review
        </button>
      </div>

      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            className="flex min-h-full items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeForm();
            }}
          >
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close review form"
                className="absolute right-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
              <ReviewForm unitCode={unitCode} onSubmitted={handleSubmitted} />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-slate-500">No reviews yet. Be the first to share your experience!</p>
          <button
            type="button"
            onClick={openForm}
            className="mt-4 cursor-pointer rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Write the first review
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
