import type {
  NamedSkill,
  TrustFieldDescriptor,
  TrustFields,
  TrustFieldValue,
  TrustScalar,
} from "./domain/types.js";

export type DisplayTrustField = {
  key: string;
  label: string;
  value: string;
};

/**
 * Adapt Gaia's legacy top-level fields into the open tree-provided bag while
 * preserving every field already published in `trust` without interpretation.
 */
export function trustFields(skill: NamedSkill): TrustFields {
  const fields: TrustFields = { ...(skill.trust ?? {}) };
  if (skill.level !== undefined && fields.level === undefined) {
    fields.level = skill.level;
  }
  if (
    skill.trustMagnitude !== undefined &&
    fields.trustMagnitude === undefined
  ) {
    fields.trustMagnitude = skill.trustMagnitude;
  }
  if (
    skill.overallTrustGrade !== undefined &&
    fields.overallTrustGrade === undefined
  ) {
    fields.overallTrustGrade = skill.overallTrustGrade;
  }
  return fields;
}

/** Return a comparable score only when the publisher supplied real ordering data. */
export function trustScore(
  key: string,
  field: TrustFieldValue,
): number | undefined {
  if (isDescriptor(field)) return field.score;
  if (typeof field === "number")
    return Number.isFinite(field) ? field : undefined;
  if (typeof field === "boolean") return field ? 1 : 0;

  const numeric = Number(field);
  if (field.trim() !== "" && Number.isFinite(numeric)) return numeric;

  // Compatibility adapter for Gaia's established `3★` level vocabulary.
  if (key === "level") {
    const stars = /^(\d+)★/u.exec(field)?.[1];
    if (stars !== undefined) return Number(stars);
  }
  return undefined;
}

export function displayTrustFields(fields: TrustFields): DisplayTrustField[] {
  return Object.entries(fields).map(([key, field]) => {
    const descriptor = isDescriptor(field) ? field : undefined;
    const value: TrustScalar = isDescriptor(field) ? field.value : field;
    return {
      key,
      label: descriptor?.label ?? humanizeTrustKey(key),
      value: formatTrustValue(value),
    };
  });
}

function isDescriptor(field: TrustFieldValue): field is TrustFieldDescriptor {
  return typeof field === "object";
}

function formatTrustValue(value: TrustScalar): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function humanizeTrustKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
  return words.replace(/\b\w/gu, (letter) => letter.toLocaleUpperCase("en-US"));
}
