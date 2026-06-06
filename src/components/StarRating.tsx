"use client";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  label: string;
  readonly?: boolean;
  size?: "sm" | "md";
  required?: boolean;
}

export function StarRating({
  value,
  onChange,
  label,
  readonly = false,
  size = "md",
  required = false,
}: StarRatingProps) {
  const starSize = size === "sm" ? "text-lg" : "text-2xl";
  const hasValue = value > 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-600">
        {label}
        {required && <span className="text-orange-500 ml-0.5">*</span>}
      </span>
      <div className="flex items-center gap-0.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            className={`${starSize} transition-colors ${
              readonly ? "cursor-default" : "cursor-pointer hover:scale-110"
            } ${hasValue && star <= value ? "text-amber-400" : "text-slate-300"}`}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
        {!readonly && hasValue && (
          <span className="ml-2 text-sm text-slate-500">{value}/5</span>
        )}
      </div>
    </div>
  );
}

export function StarDisplay({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const starSize = size === "sm" ? "text-sm" : "text-lg";
  return (
    <span className={`inline-flex items-center gap-0.5 ${starSize}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= Math.round(value) ? "text-amber-400" : "text-slate-300"}
        >
          ★
        </span>
      ))}
      <span className="ml-1 text-slate-500 text-xs">{value.toFixed(1)}</span>
    </span>
  );
}
