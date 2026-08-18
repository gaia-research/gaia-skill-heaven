import { z } from "zod";

const evidenceSchema = z
  .object({
    class: z.string().optional(),
    grade: z.string().optional(),
    type: z.string().optional(),
    source: z.string().url(),
    evaluator: z.string().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
    trustNumber: z.number().optional(),
  })
  .passthrough();

const genericSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    title: z.string().optional(),
    summary: z.string().optional(),
    description: z.string(),
    prerequisites: z.array(z.string()).default([]),
    derivatives: z.array(z.string()).default([]),
    evidence: z.array(evidenceSchema).default([]),
    status: z.string(),
    namedMaxLevel: z.string().optional(),
    overallTrustGrade: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

const trustFieldSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z
    .object({
      value: z.union([z.string(), z.number(), z.boolean()]),
      score: z.number().optional(),
      label: z.string().optional(),
    })
    .passthrough(),
]);

const namedSkillSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    title: z.string().optional(),
    contributor: z.string().min(1),
    genericSkillRef: z.string().min(1),
    status: z.string(),
    level: z.string().optional(),
    description: z.string(),
    catalogRef: z.string().min(1).optional(),
    tags: z.array(z.string()).default([]),
    links: z.record(z.unknown()).default({}),
    evidence: z.array(evidenceSchema).default([]),
    trustMagnitude: z.number().optional(),
    overallTrustGrade: z.string().optional(),
    trust: z.record(trustFieldSchema).optional(),
    type: z.string().optional(),
    updatedAt: z.string().optional(),
    installable: z.boolean().optional(),
    suiteComponents: z.array(z.string()).optional(),
  })
  .passthrough();

export const genericRegistrySchema = z
  .object({
    $schema: z.string().optional(),
    contractVersion: z.string().optional(),
    schemaVersion: z.string().optional(),
    generatedAt: z.string().min(1),
    skills: z.array(genericSkillSchema),
  })
  .passthrough();

export const namedRegistrySchema = z
  .object({
    contractVersion: z.string().optional(),
    schemaVersion: z.string().optional(),
    generatedAt: z.string().min(1),
    buckets: z.record(z.array(namedSkillSchema)),
  })
  .passthrough();
