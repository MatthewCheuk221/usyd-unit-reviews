import Link from "next/link";
import { notFound } from "next/navigation";
import { UnitReviews } from "@/components/UnitReviews";
import { getUnit } from "@/lib/units";
import {
  BROWSE_CATEGORIES,
  CATEGORY_LABELS,
  UNIT_LEVEL_LABELS,
  unitBelongsToBrowseCategory,
  type BrowseCategory,
} from "@/lib/types";

const VALID_CATEGORIES = new Set<string>(BROWSE_CATEGORIES);

export default async function UnitPage({
  params,
}: {
  params: Promise<{ category: string; code: string }>;
}) {
  const { category, code } = await params;

  if (!VALID_CATEGORIES.has(category)) {
    notFound();
  }

  const browseCategory = category as BrowseCategory;
  const unit = getUnit(code);

  if (!unit || !unitBelongsToBrowseCategory(unit.category, browseCategory)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 text-sm text-slate-500">
        <Link href="/" className="hover:text-orange-600 transition-colors">
          Home
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/units/${category}`}
          className="hover:text-orange-600 transition-colors"
        >
          {CATEGORY_LABELS[browseCategory]}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">{unit.code}</span>
      </nav>

      <div className="mb-8">
        <p className="font-mono text-sm font-semibold text-orange-600">{unit.code}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
          {unit.name}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {UNIT_LEVEL_LABELS[unit.category]}
        </p>
      </div>

      <UnitReviews unitCode={unit.code} />
    </div>
  );
}
