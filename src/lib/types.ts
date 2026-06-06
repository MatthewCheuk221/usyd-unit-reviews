export type UnitLevel =
  | "level1"
  | "level2"
  | "level3"
  | "level4"
  | "level5"
  | "level6"
  | "level9";

export type BrowseCategory = "undergraduate" | "postgraduate";

export type Grade = "H" | "D" | "C" | "P" | "F";

export interface Unit {
  code: string;
  name: string;
  category: UnitLevel;
  order: number;
}

export interface Review {
  id: string;
  unitCode: string;
  title: string;
  coordinatorName: string;
  lecturerName: string;
  tutorName: string;
  year: number;
  content: string;
  grade: Grade;
  ratingContent: number;
  ratingWorkload: number;
  ratingExamDifficulty: number;
  ratingFinalResult: number;
  reportedCount: number;
  createdAt: string;
}

export interface PublicReview {
  id: string;
  unitCode: string;
  title: string;
  coordinatorName: string;
  lecturerName: string;
  tutorName: string;
  year: number;
  content: string;
  grade: Grade;
  ratingContent: number;
  ratingWorkload: number;
  ratingExamDifficulty: number;
  ratingFinalResult: number;
  createdAt: string;
}

export interface ReviewInput {
  unitCode: string;
  title: string;
  coordinatorName: string;
  lecturerName: string;
  tutorName: string;
  year: number;
  content: string;
  grade: Grade;
  ratingContent: number;
  ratingWorkload: number;
  ratingExamDifficulty: number;
  ratingFinalResult: number;
}

export interface UnitSummary {
  unitCode: string;
  summary: string;
  reviewCount: number;
  avgContent: number;
  avgWorkload: number;
  avgExamDifficulty: number;
  avgFinalResult: number;
  generatedAt: string;
}

export const UNDERGRADUATE_LEVELS: UnitLevel[] = [
  "level1",
  "level2",
  "level3",
  "level4",
];

export const POSTGRADUATE_LEVELS: UnitLevel[] = ["level5", "level6", "level9"];

export const BROWSE_CATEGORIES: BrowseCategory[] = [
  "undergraduate",
  "postgraduate",
];

export const CATEGORY_LABELS: Record<BrowseCategory, string> = {
  undergraduate: "Undergraduate units",
  postgraduate: "Postgraduate units",
};

export const CATEGORY_DESCRIPTIONS: Record<BrowseCategory, string> = {
  undergraduate: "1000-level, 2000-level, 3000-level, and 4000-level units",
  postgraduate: "5000-level, 6000-level, and 9000-level units",
};

export const LEVEL_SECTION_LABELS: Record<UnitLevel, string> = {
  level1: "1000-level units",
  level2: "2000-level units",
  level3: "3000-level units",
  level4: "4000-level units",
  level5: "5000-level units",
  level6: "6000-level units",
  level9: "9000-level units",
};

export const UNIT_LEVEL_LABELS: Record<UnitLevel, string> = {
  level1: "1000-level unit",
  level2: "2000-level unit",
  level3: "3000-level unit",
  level4: "4000-level unit",
  level5: "5000-level unit",
  level6: "6000-level unit",
  level9: "9000-level unit",
};

export const GRADES: Grade[] = ["H", "D", "C", "P", "F"];

export const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029];

export function isPostgraduateLevel(level: UnitLevel): boolean {
  return POSTGRADUATE_LEVELS.includes(level);
}

export function unitBelongsToBrowseCategory(
  unitLevel: UnitLevel,
  browseCategory: BrowseCategory
): boolean {
  if (browseCategory === "undergraduate") {
    return UNDERGRADUATE_LEVELS.includes(unitLevel);
  }
  return isPostgraduateLevel(unitLevel);
}

export function normalizeBrowseCategorySlug(value: string): BrowseCategory | null {
  if (value === "undergraduate" || value === "postgraduate") {
    return value;
  }
  // Backward compatibility for old shared links.
  if (value === "level5plus") {
    return "postgraduate";
  }
  return null;
}
