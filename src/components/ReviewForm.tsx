"use client";

import { useCallback, useState } from "react";
import { StarRating } from "./StarRating";
import { ReCaptcha } from "./ReCaptcha";
import { parseJsonResponse } from "@/lib/api";
import type { Grade } from "@/lib/types";
import { GRADES, YEARS } from "@/lib/types";

interface ReviewFormProps {
  unitCode: string;
  onSubmitted: () => void;
}

function getDefaultYear(): number {
  const currentYear = new Date().getFullYear();
  const minYear = YEARS[0];
  const maxYear = YEARS[YEARS.length - 1];
  return Math.min(Math.max(currentYear, minYear), maxYear);
}

export function ReviewForm({ unitCode, onSubmitted }: ReviewFormProps) {
  const [title, setTitle] = useState("");
  const [coordinatorName, setCoordinatorName] = useState("");
  const [lecturerName, setLecturerName] = useState("");
  const [tutorName, setTutorName] = useState("");
  const [year, setYear] = useState(getDefaultYear);
  const [content, setContent] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [ratingContent, setRatingContent] = useState(0);
  const [ratingWorkload, setRatingWorkload] = useState(0);
  const [ratingExamDifficulty, setRatingExamDifficulty] = useState(0);
  const [ratingFinalResult, setRatingFinalResult] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
  const captchaEnabled = Boolean(recaptchaSiteKey);

  const handleReCaptchaTokenChange = useCallback((token: string) => {
    setRecaptchaToken(token);
  }, []);

  function resetForm() {
    setTitle("");
    setCoordinatorName("");
    setLecturerName("");
    setTutorName("");
    setYear(getDefaultYear());
    setContent("");
    setGrade(null);
    setRatingContent(0);
    setRatingWorkload(0);
    setRatingExamDifficulty(0);
    setRatingFinalResult(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedTitle = title.trim();
    const trimmedCoordinator = coordinatorName.trim();
    const trimmedLecturer = lecturerName.trim();
    const trimmedContent = content.trim();
    const trimmedTutor = tutorName.trim();

    if (trimmedTitle.length < 3) {
      setError("Review title must be at least 3 characters.");
      return;
    }
    if (trimmedCoordinator.length < 1) {
      setError("Coordinator name is required.");
      return;
    }
    if (trimmedLecturer.length < 1) {
      setError("Lecturer name is required.");
      return;
    }
    if (!grade) {
      setError("Please select your grade.");
      return;
    }

    if (
      !ratingContent ||
      !ratingWorkload ||
      !ratingExamDifficulty ||
      !ratingFinalResult
    ) {
      setError("Please provide a rating for all categories.");
      return;
    }

    if (captchaEnabled && !recaptchaToken) {
      setError("Please complete the CAPTCHA before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitCode,
          title: trimmedTitle,
          coordinatorName: trimmedCoordinator,
          lecturerName: trimmedLecturer,
          tutorName: trimmedTutor,
          year,
          content: trimmedContent,
          grade,
          ratingContent,
          ratingWorkload,
          ratingExamDifficulty,
          ratingFinalResult,
          recaptchaToken,
        }),
      });

      const data = await parseJsonResponse(res);

      if (!res.ok) {
        throw new Error(
          (typeof data.error === "string" && data.error) ||
            "Failed to submit review"
        );
      }

      resetForm();
      setRecaptchaToken("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h3 className="text-lg font-semibold text-slate-900">Write a review</h3>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Review Title" required>
          <input
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Great intro to programming"
            className="input-field"
          />
        </Field>
        <Field label="Year Taken" required>
          <div className="select-wrapper">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="select-field"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Coordinator" required>
          <input
            type="text"
            required
            maxLength={120}
            value={coordinatorName}
            onChange={(e) => setCoordinatorName(e.target.value)}
            placeholder="Coordinator name"
            className="input-field"
          />
        </Field>
        <Field label="Lecturer" required>
          <input
            type="text"
            required
            maxLength={120}
            value={lecturerName}
            onChange={(e) => setLecturerName(e.target.value)}
            placeholder="Lecturer name"
            className="input-field"
          />
        </Field>
        <Field label="Tutor">
          <input
            type="text"
            maxLength={120}
            value={tutorName}
            onChange={(e) => setTutorName(e.target.value)}
            placeholder="Tutor name"
            className="input-field"
          />
        </Field>
      </div>

      <Field label="Your Grade" required>
        <div className="flex gap-2">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                grade === g
                  ? "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <StarRating
          label="Unit Content"
          value={ratingContent}
          onChange={setRatingContent}
          required
        />
        <StarRating
          label="Overall Workload"
          value={ratingWorkload}
          onChange={setRatingWorkload}
          required
        />
        <StarRating
          label="Exam Difficulty"
          value={ratingExamDifficulty}
          onChange={setRatingExamDifficulty}
          required
        />
        <StarRating
          label="Final Result"
          value={ratingFinalResult}
          onChange={setRatingFinalResult}
          required
        />
      </div>

      <Field label="Review Content" required>
        <textarea
          required
          rows={6}
          maxLength={4000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Share your experience with this unit — teaching quality, assessments, tips for future students..."
          className="input-field resize-y"
        />
      </Field>

      {captchaEnabled && (
        <Field label="Verification" required>
          <ReCaptcha
            siteKey={recaptchaSiteKey}
            onTokenChange={handleReCaptchaTokenChange}
          />
        </Field>
      )}

      <button
        type="submit"
        disabled={submitting || (captchaEnabled && !recaptchaToken)}
        className="w-full rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-50 sm:w-auto"
      >
        {submitting ? "Submitting..." : "Submit review"}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-orange-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
