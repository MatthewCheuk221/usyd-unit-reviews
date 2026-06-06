import Link from "next/link";
import { notFound } from "next/navigation";
import { getUnitsGroupedByLevel } from "@/lib/units";
import {
  BROWSE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  LEVEL_SECTION_LABELS,
  type BrowseCategory,
} from "@/lib/types";

const VALID_CATEGORIES = new Set<string>(BROWSE_CATEGORIES);

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  if (!VALID_CATEGORIES.has(category)) {
    notFound();
  }

  const browseCategory = category as BrowseCategory;
  const groups = getUnitsGroupedByLevel(browseCategory);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav className="mb-6 text-sm text-slate-500">
        <Link href="/" className="hover:text-orange-600 transition-colors">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900">{CATEGORY_LABELS[browseCategory]}</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {CATEGORY_LABELS[browseCategory]}
        </h1>
        <p className="mt-2 text-slate-600">
          {CATEGORY_DESCRIPTIONS[browseCategory]}
        </p>
      </div>

      <div className="space-y-10">
        {groups.map(({ level, units }) => (
          <section key={level}>
            <h2 className="mb-4 text-lg font-semibold text-slate-800">
              {LEVEL_SECTION_LABELS[level]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {units.map((unit) => (
                <Link
                  key={unit.code}
                  href={`/units/${category}/${unit.code}`}
                  className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-orange-300 hover:shadow-md"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-orange-600">
                      {unit.code}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-700 group-hover:text-slate-900">
                      {unit.name}
                    </p>
                  </div>
                  <span className="text-slate-300 group-hover:text-orange-500 transition-colors">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
