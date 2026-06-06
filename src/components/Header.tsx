import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 text-white font-bold text-sm">
            USYD
          </div>
          <div>
            <p className="font-semibold text-slate-900 group-hover:text-orange-600 transition-colors">
              Unit Reviews
            </p>
            <p className="text-xs text-slate-500">Computing · University of Sydney</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
