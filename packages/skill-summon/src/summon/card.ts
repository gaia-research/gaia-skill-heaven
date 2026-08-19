import { displayTrustFields } from "../trust.js";
import type { RankingSummary } from "./rank.js";
import type { InstalledSkill } from "./session.js";

type CardSkill = Omit<InstalledSkill, "card">;

export function inspectUrl(sourceUrl: string, repoUrl: string): string {
  if (/^https?:\/\//u.test(sourceUrl)) return sourceUrl;
  return repoUrl.replace(/\.git$/u, "");
}

/** Render a compact, context-ready card without placeholder trust values. */
export function renderSummonCard(
  skill: CardSkill,
  ranking: RankingSummary,
): string {
  const lines = [`[Summoned] ${skill.name}`, `  ID: ${skill.id}`];
  const trust = displayTrustFields(skill.trust ?? {});
  if (trust.length > 0) {
    lines.push(
      `  Trust: ${trust.map((field) => `${field.label} ${field.value}`).join(" · ")}`,
    );
  }
  lines.push(
    ranking.mode === "relevance-only"
      ? "  Ranking: relevance only — tree published no comparable trust signals"
      : `  Ranking: trust then relevance — ${ranking.trustFields.join(", ")}`,
    `  Install: ${skill.totalSeconds.toFixed(3)}s · ${skill.cache}/${skill.cacheSource} · ${skill.fileCount} files`,
    `  Path: ${skill.path}`,
    `  Inspect: ${skill.inspectUrl}`,
  );
  return lines.join("\n");
}
