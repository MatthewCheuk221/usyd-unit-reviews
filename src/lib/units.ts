import unitsData from "../../data/units.json";
import type { Unit, UnitLevel, BrowseCategory } from "./types";
import {
  UNDERGRADUATE_LEVELS,
  POSTGRADUATE_LEVELS,
  unitBelongsToBrowseCategory,
} from "./types";

const units = unitsData as Unit[];

function sortByXlsxOrder(a: Unit, b: Unit): number {
  return a.order - b.order;
}

export function getAllUnits(): Unit[] {
  return units;
}

export function getUnitsByBrowseCategory(
  browseCategory: BrowseCategory
): Unit[] {
  return units
    .filter((u) => unitBelongsToBrowseCategory(u.category, browseCategory))
    .sort(sortByXlsxOrder);
}

export function getUnitsGroupedByLevel(
  browseCategory: BrowseCategory
): { level: UnitLevel; units: Unit[] }[] {
  const levels =
    browseCategory === "undergraduate"
      ? UNDERGRADUATE_LEVELS
      : POSTGRADUATE_LEVELS;

  return levels
    .map((level) => ({
      level,
      units: units
        .filter((u) => u.category === level)
        .sort(sortByXlsxOrder),
    }))
    .filter((group) => group.units.length > 0);
}

export function getUnit(code: string): Unit | undefined {
  return units.find((u) => u.code === code);
}

export function getBrowseCategoryCounts(): Record<BrowseCategory, number> {
  const counts: Record<BrowseCategory, number> = {
    undergraduate: 0,
    level5plus: 0,
  };
  for (const unit of units) {
    if (UNDERGRADUATE_LEVELS.includes(unit.category)) {
      counts.undergraduate++;
    } else if (POSTGRADUATE_LEVELS.includes(unit.category)) {
      counts.level5plus++;
    }
  }
  return counts;
}
