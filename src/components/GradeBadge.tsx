import type { Grade } from "@/lib/types";

const GRADE_STYLES: Record<Grade, string> = {
  H: "bg-violet-100 text-violet-800 border-violet-200",
  D: "bg-blue-100 text-blue-800 border-blue-200",
  C: "bg-green-100 text-green-800 border-green-200",
  P: "bg-yellow-100 text-yellow-800 border-yellow-200",
  F: "bg-red-100 text-red-800 border-red-200",
};

const GRADE_LABELS: Record<Grade, string> = {
  H: "High Distinction",
  D: "Distinction",
  C: "Credit",
  P: "Pass",
  F: "Fail",
};

export function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${GRADE_STYLES[grade]}`}
      title={GRADE_LABELS[grade]}
    >
      {grade}
    </span>
  );
}
