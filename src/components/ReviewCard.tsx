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

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
        <div className="grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-2 text-sm">
          <RatingLabel align="left">Unit Content</RatingLabel>
          <StarDisplay value={review.ratingContent} />
          <RatingLabel align="left">Exam Difficulty</RatingLabel>
          <StarDisplay value={review.ratingExamDifficulty} />
        </div>
        <div className="grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-2 text-sm">
          <RatingLabel align="right">Overall Workload</RatingLabel>
          <StarDisplay value={review.ratingWorkload} />
          <RatingLabel align="right">Final Result</RatingLabel>
          <StarDisplay value={review.ratingFinalResult} />
        </div>
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

function RatingLabel({
  align,
  children,
}: {
  align: "left" | "right";
  children: string;
}) {
  return (
    <span
      className={`min-w-[7.75rem] text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </span>
  );
}
