import Link from "next/link";
import {
  BROWSE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  type BrowseCategory,
} from "@/lib/types";

const LEVEL_COLORS: Record<BrowseCategory, string> = {
  undergraduate: "from-emerald-500 to-orange-500",
  postgraduate: "from-violet-900 to-indigo-900",
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          USyd Unit Reviews
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          Read and share honest reviews for computing-related units of study at
          The University of Sydney. Choose undergraduate or postgraduate units to
          browse and write reviews.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
        {BROWSE_CATEGORIES.map((category) => (
          <Link
            key={category}
            href={`/units/${category}`}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${LEVEL_COLORS[category]}`}
            />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 group-hover:text-orange-600 transition-colors">
                {CATEGORY_LABELS[category]}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {CATEGORY_DESCRIPTIONS[category]}
              </p>
            </div>
            <p className="mt-4 text-sm font-medium text-orange-600 opacity-0 transition-opacity group-hover:opacity-100">
              Browse units →
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <Step
            number={1}
            title="Choose a level"
            description="Select undergraduate or postgraduate units"
          />
          <Step
            number={2}
            title="Pick a unit"
            description="Browse computing units and read student reviews"
          />
          <Step
            number={3}
            title="Share your experience"
            description="Write a review with ratings, grades, and tips for future students"
          />
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
        {number}
      </div>
      <div>
        <h3 className="font-medium text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
