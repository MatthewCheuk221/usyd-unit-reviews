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
        <RatingGroup
          rows={[
            { label: "Unit Content", value: review.ratingContent },
            { label: "Exam Difficulty", value: review.ratingExamDifficulty },
          ]}
          align="left"
        />
        <RatingGroup
          rows={[
            { label: "Overall Workload", value: review.ratingWorkload },
            { label: "Final Result", value: review.ratingFinalResult },
          ]}
          align="right"
        />
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

function RatingGroup({
  rows,
  align,
}: {
  rows: { label: string; value: number }[];
  align: "left" | "right";
}) {
  return (
    <div className="inline-grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-2 text-sm">
      {rows.map((row) => (
        <RatingPair key={row.label} label={row.label} value={row.value} align={align} />
      ))}
    </div>
  );
}

function RatingPair({
  label,
  value,
  align,
}: {
  label: string;
  value: number;
  align: "left" | "right";
}) {
  return (
    <>
      <span
        className={`text-slate-500 ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {label}
      </span>
      <StarDisplay value={value} />
    </>
  );
}
