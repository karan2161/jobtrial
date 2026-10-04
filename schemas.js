import { z } from 'zod';

const s = (max) => z.string().trim().min(1).max(max);
const list = (max, n) => z.array(s(max)).max(n);

// Every model response is parsed against one of these before it is used or stored.
export const jdExtractionSchema = z.object({
  title: s(200).nullable().default(null),
  requiredSkills: list(60, 40).default([]),
  preferredSkills: list(60, 30).default([]),
  keywords: list(60, 40).default([]),
  responsibilities: list(300, 20).default([]),
  minYearsExperience: z.number().min(0).max(40).nullable().default(null),
  educationLevel: z.enum(['diploma', 'bachelor', 'master', 'phd']).nullable().default(null),
});

export const insightsSchema = z.object({
  summary: s(600).default('No summary available.'),
  recommendations: z.array(z.object({
    problem: s(300), why_it_matters: s(400), suggestion: s(500),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
  })).max(10).default([]),
  bullet_suggestions: z.array(z.object({ original: s(600), suggested: s(600), reason: s(300) })).max(8).default([]),
});

export const tailorSchema = z.object({
  changes: z.array(z.object({ original_text: s(800), suggested_text: s(800), reason: s(300) })).max(15).default([]),
});

export const bulletSchema = z.object({ suggested: s(600), reason: s(400) });
