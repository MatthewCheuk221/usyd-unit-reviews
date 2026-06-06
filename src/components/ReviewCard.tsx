"use client";

import { useState } from "react";
import { GradeBadge } from "./GradeBadge";
import { StarDisplay } from "./StarRating";
import type { PublicReview } from "@/lib/types";

export function ReviewCard({ review }: { review: PublicReview }) {
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function handleReport() {
    if (reported || reporting) return;

    setReporting(true);
    try {
      const res = await fetch("/api/reviews/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id }),
      });
      if (res.ok) {
        setReported(true);
      }
    } catch {
      // Silently ignore — user can try again or ignore
    } finally {
      setReporting(false);
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-900">{review.title}</h4>
          <p className="mt-1 text-sm text-slate-500">
            {review.year} · Coordinator: {review.coordinatorName} · Lecturer:{" "}
            {review.lecturerName}
            {review.tutorName ? ` · Tutor: ${review.tutorName}` : ""}
          </p>
        </div>
        <GradeBadge grade={review.grade} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <RatingRow label="Unit Content" value={review.ratingContent} />
        <RatingRow label="Overall Workload" value={review.ratingWorkload} />
        <RatingRow label="Exam Difficulty" value={review.ratingExamDifficulty} />
        <RatingRow label="Final Result" value={review.ratingFinalResult} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {review.content}
      </p>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleReport}
          disabled={reported || reporting}
          className="text-xs text-slate-400 transition-colors hover:text-red-500 disabled:cursor-default disabled:opacity-60"
        >
          {reported
            ? "Reported — thank you"
            : reporting
              ? "Reporting..."
              : "Report this review"}
        </button>
      </div>
    </article>
  );
}

function RatingRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <StarDisplay value={value} />
    </div>
  );
}
