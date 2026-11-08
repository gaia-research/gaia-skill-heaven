// DecisionBackend abstraction for Skill Heaven (SPEC §4, probabilistic semantic decision layer).
//
// Zero-runtime-dependency TypeScript ESM abstraction providing three modes:
// 1. "classic": deterministic baseline (decide() in decide.ts).
// 2. "jev": probabilistic semantic decision backend via JevClient.
// 3. "compare": classic remains 100% authoritative, Jev runs in shadow mode
//    generating a CompareDecisionRecord with agreement/disagreement tracking.
//
// Strict deterministic policy & security gates:
// - "Probabilistic inference must not become policy authority."
// - Candidates admitted by Jev must pass withholdReason(doc, surface) and installability.
// - Exact-name fast path: matchKind === "exact" bypasses Jev entirely ($0 cost).
// - Safe offline fallback: offline, unconfigured, timeout, or failure degrades
//   gracefully to classic deterministic decision with backend: "fallback".

import { marginOf, type ScoredSkill } from "./bm25f.js";
import {
  BAND,
  MARGIN,
  decide,
  isBareId,
  noMatchDecision,
  withholdReason,
  type DecideOptions,
  type Decision,
  type FilterReason,
  type NoMatch,
  type SummonSurface,
} from "./decide.js";
import { JevClient, getSharedJevClient, type JevQuestion, type JevResult } from "./jev-client.js";
import type { SkillIndex } from "./schema.js";

export type DecisionMode = "classic" | "jev" | "compare";

export interface SemanticCandidateEvaluation {
  id: string;
  name: string;
  probability: number;
  confidence?: number;
  chosen?: boolean;
  withheldReason?: string | null;
}

export interface SemanticDecision {
  chosen: string | null;
  confidence: number;
  noneProbability?: number;
  probabilities: Record<string, number>;
  evaluations: SemanticCandidateEvaluation[];
  model?: string;
  costUsd?: number;
  inputTokens?: number;
  latencyMs?: number;
  bypassed?: boolean;
  rationale?: string;
}

export interface CompareDecisionRecord {
  query: string;
  classic: {
    chosen: string | null;
    margin: number;
    admittedCount: number;
    noMatchReason?: string | null;
  };
  semantic: {
    chosen: string | null;
    confidence: number;
    none?: number;
    noneProbability?: number;
    probabilities?: Record<string, number>;
    evaluations?: SemanticCandidateEvaluation[];
    status?: "ok" | "failed" | "bypassed";
    error?: string;
    costUsd?: number;
    inputTokens?: number;
    rationale?: string;
  } | null;
  agreement: boolean;
  disagreementReason?: string;
  shadowError?: string;
}

export interface DecisionResult extends Decision {
  backend: "classic" | "jev" | "compare" | "fallback";
  fallbackReason?: string;
  semantic?: SemanticDecision | null;
  compare?: CompareDecisionRecord | null;
}

export type DecisionOptions = DecideOptions & {
  live?: boolean | undefined;
};

export interface DecisionBackend {
  readonly mode: DecisionMode;
  decide(options: DecisionOptions): Promise<DecisionResult>;
}

export class ClassicDecisionBackend implements DecisionBackend {
  readonly mode: DecisionMode = "classic";

  async decide(options: DecisionOptions): Promise<DecisionResult> {
    const outcome = decide(options);
    return {
      ...outcome,
      backend: "classic",
    };
  }
}

export interface JevDecisionBackendOptions {
  client?: JevClient;
  minProbability?: number;
  minConfidence?: number;
  maxCandidates?: number;
}

export class JevDecisionBackend implements DecisionBackend {
  readonly mode: DecisionMode = "jev";
  readonly client: JevClient;
  readonly minProbability: number;
  readonly minConfidence: number;
  readonly maxCandidates: number;

  constructor(options: JevDecisionBackendOptions = {}) {
    this.client = options.client ?? getSharedJevClient();
    this.minProbability = options.minProbability ?? 0.4;
    this.minConfidence = options.minConfidence ?? 0.5;
    this.maxCandidates = options.maxCandidates ?? 10;
  }

  async decide(options: DecisionOptions): Promise<DecisionResult> {
    const { index, query, ranked, surface = "any", source } = options;
    const floor = index.stats.floor;
    const filtered: FilterReason[] = [];
    const eligible: ScoredSkill[] = [];

    // Exact-match fast path ($0 spend bypass):
    // Check if any ranked hit has matchKind === "exact". If so, bypass Jev entirely
    // whether the exact hit is admitted or withheld, using classic decide() logic with rationale.
    const hasExact = ranked.some((hit) => hit.matchKind === "exact");
    if (hasExact) {
      const classicResult = decide(options);
      const exactHits = ranked.filter((hit) => hit.matchKind === "exact");
      const admittedExact = classicResult.admitted.find((hit) => hit.matchKind === "exact");
      const chosen = admittedExact?.doc.id ?? null;
      const probabilities = chosen ? { [chosen]: 1.0 } : {};
      const evaluations: SemanticCandidateEvaluation[] = exactHits.map((h) => ({
        id: h.doc.id,
        name: h.doc.name,
        probability: h.doc.id === chosen ? 1.0 : 0.0,
        confidence: 1.0,
        chosen: h.doc.id === chosen,
        withheldReason: withholdReason(h.doc, surface),
      }));

      return {
        ...classicResult,
        backend: "jev",
        semantic: {
          chosen,
          confidence: 1.0,
          noneProbability: 0,
          probabilities,
          evaluations,
          bypassed: true,
          costUsd: 0,
          inputTokens: 0,
          rationale: "Exact-match fast path: bypassed Jev semantic inference ($0 spend).",
        },
      };
    }

    // 1. Strict deterministic policy filter: withhold reason & installability
    for (const hit of ranked) {
      const why = withholdReason(hit.doc, surface);
      if (why) filtered.push({ id: hit.doc.id, name: hit.doc.name, why });
      else eligible.push(hit);
    }

    // Bare ID miss (e.g. pasted owner/name that does not exist in index)
    if (ranked.length > 0 && ranked[0]?.matchKind !== "exact" && isBareId(query)) {
      const miss = noMatchDecision(query, "name_not_found", [], filtered, floor, source);
      return {
        ...miss,
        backend: "jev",
        semantic: null,
      };
    }

    // No eligible candidates
    if (eligible.length === 0) {
      const reason = ranked.length === 0 ? "no_candidates" : "all_filtered";
      const miss = noMatchDecision(query, reason, ranked, filtered, floor, source);
      return {
        ...miss,
        backend: "jev",
        semantic: null,
      };
    }

    // 2. Prepare bounded evaluation for Jev
    const candidatesToEvaluate = eligible.slice(0, this.maxCandidates);
    const candidateIds = candidatesToEvaluate.map((c) => c.doc.id);
    const choices = [...candidateIds, "none"];

    const state = {
      query,
      surface,
      candidates: candidatesToEvaluate.map((c) => ({
        id: c.doc.id,
        name: c.doc.name,
        description: c.doc.description,
        tags: c.doc.tags,
      })),
    };

    const questions: Record<string, JevQuestion> = {
      selection: {
        type: "choice",
        instructions:
          "Select the single best skill for the user's query intent, or 'none' if none match well.",
        choices,
        criteria: {
          ...Object.fromEntries(
            candidatesToEvaluate.map((c) => [c.doc.id, `${c.doc.name}: ${c.doc.description}`]),
          ),
          none: "None of the candidate skills are a suitable match for the user query intent.",
        },
      },
    };

    // 4. Safe offline fallback: degrade to classic deterministic decide() on any failure
    let evalResult: JevResult;
    try {
      evalResult = await this.client.evaluate(state, questions, { live: options.live });
    } catch (err) {
      const classic = decide(options);
      return {
        ...classic,
        backend: "fallback",
        fallbackReason: err instanceof Error ? err.message : String(err),
      };
    }

    if (!evalResult.ok) {
      const classic = decide(options);
      return {
        ...classic,
        backend: "fallback",
        fallbackReason: evalResult.reason,
      };
    }

    // 5. Evaluate Jev answer
    const answer =
      evalResult.answers.selection ??
      evalResult.answers.relevance ??
      Object.values(evalResult.answers)[0];

    if (!answer) {
      const classic = decide(options);
      return {
        ...classic,
        backend: "fallback",
        fallbackReason: "missing_answer",
      };
    }

    const noneProb =
      answer.probabilities["none"] ?? answer.probabilities["none_of_the_above"] ?? 0;

    const evaluations: SemanticCandidateEvaluation[] = candidatesToEvaluate.map((hit) => {
      const prob = answer.probabilities[hit.doc.id] ?? 0;
      return {
        id: hit.doc.id,
        name: hit.doc.name,
        probability: prob,
        confidence: answer.confidence,
        chosen: hit.doc.id === answer.choice,
      };
    });

    const choice = answer.choice;
    const choiceProb = answer.probabilities[choice] ?? 0;
    const isNone = choice === "none" || choice === "none_of_the_above";
    const isLowProb = choiceProb < this.minProbability;
    const isLowConfidence = answer.confidence < this.minConfidence;

    const semanticRecord: SemanticDecision = {
      chosen: isNone ? null : choice,
      confidence: answer.confidence,
      noneProbability: noneProb,
      probabilities: answer.probabilities,
      evaluations,
      model: evalResult.model,
      costUsd: evalResult.costUsd,
      inputTokens: evalResult.usage?.input_tokens ?? 0,
      latencyMs: evalResult.latencyMs,
      bypassed: false,
    };

    // Low confidence or "none" selected -> calibrated noMatch
    if (isNone || isLowProb || isLowConfidence) {
      const topCandidates = eligible.slice(0, 3).map((hit) => ({
        id: hit.doc.id,
        name: hit.doc.name,
        score: Math.round((answer.probabilities[hit.doc.id] ?? hit.score) * 10_000) / 10_000,
        floor,
      }));
      return {
        admitted: [],
        noMatch: {
          reason: "below_floor",
          query,
          topCandidates,
          filtered,
          suggestion: isNone
            ? "Semantic decision evaluated candidate skills and concluded none match the query intent."
            : `Semantic choice probability (${choiceProb.toFixed(4)}) is below the required threshold (${this.minProbability}).`,
        },
        margin: 0,
        ambiguous: false,
        filtered,
        floor,
        backend: "jev",
        semantic: semanticRecord,
      };
    }

    // 6. Security gate: Jev choice MUST be an eligible candidate and pass policy
    const chosenHit = eligible.find((h) => h.doc.id === choice);
    if (!chosenHit) {
      const classic = decide(options);
      return {
        ...classic,
        backend: "fallback",
        fallbackReason: `invalid_candidate_selected:${choice}`,
      };
    }

    const policyWhy = withholdReason(chosenHit.doc, surface);
    if (policyWhy) {
      filtered.push({ id: chosenHit.doc.id, name: chosenHit.doc.name, why: policyWhy });
      return {
        admitted: [],
        noMatch: {
          reason: "all_filtered",
          query,
          topCandidates: [
            { id: chosenHit.doc.id, name: chosenHit.doc.name, score: choiceProb, floor },
          ],
          filtered,
          suggestion: `Selected candidate '${chosenHit.doc.id}' withheld: ${policyWhy}`,
        },
        margin: 0,
        ambiguous: false,
        filtered,
        floor,
        backend: "jev",
        semantic: semanticRecord,
      };
    }

    // Sort eligible by semantic probability, admit within BAND of top probability
    const scored: ScoredSkill[] = eligible
      .map((hit) => {
        const prob = answer.probabilities[hit.doc.id] ?? 0;
        return {
          doc: hit.doc,
          score: prob > 0 ? prob : 0,
          matchKind: hit.matchKind,
          matchedTerms: hit.matchedTerms,
        };
      })
      .sort((a, b) => b.score - a.score);

    const topProb = scored[0]?.score ?? choiceProb;
    const admitted = scored.filter((hit) => hit.score >= topProb * BAND && hit.score > 0);
    const margin = marginOf(admitted);

    return {
      admitted,
      noMatch: null,
      margin,
      ambiguous: admitted.length > 1 && margin < MARGIN,
      filtered,
      floor,
      backend: "jev",
      semantic: semanticRecord,
    };
  }
}

export interface CompareDecisionBackendOptions {
  classic?: ClassicDecisionBackend;
  jev?: JevDecisionBackend;
  client?: JevClient;
  minProbability?: number;
  minConfidence?: number;
  maxCandidates?: number;
}

export class CompareDecisionBackend implements DecisionBackend {
  readonly mode: DecisionMode = "compare";
  readonly classic: ClassicDecisionBackend;
  readonly jev: JevDecisionBackend;

  constructor(options: CompareDecisionBackendOptions = {}) {
    this.classic = options.classic ?? new ClassicDecisionBackend();
    this.jev =
      options.jev ??
      new JevDecisionBackend({
        client: options.client,
        minProbability: options.minProbability,
        minConfidence: options.minConfidence,
        maxCandidates: options.maxCandidates,
      });
  }

  async decide(options: DecisionOptions): Promise<DecisionResult> {
    // 1. Classic decide is strictly authoritative
    const classicDecision = decide(options);
    const classicChosen = classicDecision.admitted[0]?.doc.id ?? null;

    // 2. Exact match check: fast-path bypass Jev in shadow mode too ($0 cost)
    const hasExact = options.ranked.some((h) => h.matchKind === "exact");
    if (hasExact) {
      const compareRecord: CompareDecisionRecord = {
        query: options.query,
        classic: {
          chosen: classicChosen,
          margin: classicDecision.margin,
          admittedCount: classicDecision.admitted.length,
          noMatchReason: classicDecision.noMatch?.reason ?? null,
        },
        semantic: {
          chosen: classicChosen,
          confidence: 1.0,
          none: 0,
          noneProbability: 0,
          status: "bypassed",
          costUsd: 0,
          inputTokens: 0,
          rationale: "Exact-match fast path: bypassed Jev semantic inference ($0 spend).",
        },
        agreement: true,
      };

      return {
        ...classicDecision,
        backend: "compare",
        compare: compareRecord,
      };
    }

    // 3. Shadow run Jev backend
    let shadowResult: DecisionResult | null = null;
    let shadowError: string | undefined;

    try {
      shadowResult = await this.jev.decide(options);
      if (shadowResult.backend === "fallback") {
        shadowError = shadowResult.fallbackReason ?? "fallback";
      }
    } catch (err) {
      shadowError = err instanceof Error ? err.message : String(err);
    }

    // 4. Construct CompareDecisionRecord
    let semanticRecord: CompareDecisionRecord["semantic"] = null;
    let agreement = false;
    let disagreementReason: string | undefined;

    if (shadowResult && shadowResult.backend !== "fallback") {
      const semanticChosen = shadowResult.admitted[0]?.doc.id ?? null;
      const confidence = shadowResult.semantic?.confidence ?? 0;
      const noneProb = shadowResult.semantic?.noneProbability ?? 0;

      semanticRecord = {
        chosen: semanticChosen,
        confidence,
        none: noneProb,
        noneProbability: noneProb,
        probabilities: shadowResult.semantic?.probabilities,
        evaluations: shadowResult.semantic?.evaluations,
        status: "ok",
        costUsd: shadowResult.semantic?.costUsd,
        inputTokens: shadowResult.semantic?.inputTokens,
      };

      agreement = classicChosen === semanticChosen;
      if (!agreement) {
        if (classicChosen && !semanticChosen) {
          disagreementReason = `Classic admitted '${classicChosen}' but Jev refused or chose none.`;
        } else if (!classicChosen && semanticChosen) {
          disagreementReason = `Classic refused (${classicDecision.noMatch?.reason}) but Jev admitted '${semanticChosen}'.`;
        } else {
          disagreementReason = `Classic chose '${classicChosen}' while Jev chose '${semanticChosen}'.`;
        }
      }
    } else {
      semanticRecord = {
        chosen: null,
        confidence: 0,
        none: 0,
        noneProbability: 0,
        status: "failed",
        error: shadowError,
      };
      agreement = false;
      disagreementReason = `Jev shadow evaluation failed: ${shadowError}`;
    }

    const compareRecord: CompareDecisionRecord = {
      query: options.query,
      classic: {
        chosen: classicChosen,
        margin: classicDecision.margin,
        admittedCount: classicDecision.admitted.length,
        noMatchReason: classicDecision.noMatch?.reason ?? null,
      },
      semantic: semanticRecord,
      agreement,
      disagreementReason,
      shadowError,
    };

    // Return strictly authoritative classic decision with compare metadata attached
    return {
      ...classicDecision,
      backend: "compare",
      compare: compareRecord,
    };
  }
}

export interface CreateDecisionBackendOptions {
  mode?: DecisionMode;
  client?: JevClient;
  minProbability?: number;
  minConfidence?: number;
  maxCandidates?: number;
  live?: boolean;
}

export function createDecisionBackend(
  modeOrOptions?: DecisionMode | (CreateDecisionBackendOptions & { mode?: DecisionMode }),
  maybeOptions?: CreateDecisionBackendOptions,
): DecisionBackend {
  let mode: DecisionMode = "classic";
  let options: CreateDecisionBackendOptions = {};

  if (typeof modeOrOptions === "string") {
    mode = modeOrOptions;
    if (maybeOptions) options = maybeOptions;
  } else if (modeOrOptions && typeof modeOrOptions === "object") {
    mode = modeOrOptions.mode ?? "classic";
    options = modeOrOptions;
  }

  if (mode === "classic") {
    return new ClassicDecisionBackend();
  }

  const client =
    options.client ??
    getSharedJevClient(options.live !== undefined ? { live: options.live } : undefined);
  const backendOptions: CreateDecisionBackendOptions = {
    ...options,
    client,
  };

  switch (mode) {
    case "jev":
      return new JevDecisionBackend(backendOptions);
    case "compare":
      return new CompareDecisionBackend(backendOptions);
    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(`Unsupported decision mode: ${String(exhaustiveCheck)}`);
    }
  }
}
