import { z } from "zod";

export const rankedOptionSchema = z.object({
  optionId: z.string(),
  title: z.string(),
  rank: z.number().int().positive(),
  score: z.number().min(0).max(100),
  verdict: z.string(),
  reasons: z.array(z.string()).default([]),
  tradeoffs: z.array(z.string()).default([]),
});

export const rejectedOptionSchema = z.object({
  optionId: z.string(),
  title: z.string(),
  reason: z.string(),
});

export const recommendationPayloadSchema = z.object({
  summary: z.string(),
  rankedOptions: z.array(rankedOptionSchema).min(0),
  avoidToday: z.array(rejectedOptionSchema).default([]),
  fallbackPlan: z.string(),
});

export const specificSuggestionSchema = z.object({
  rank: z.number().int().min(1).max(3),
  title: z.string(),
  category: z.string(),
  fit: z.string(),
  why: z.string(),
  tradeoffs: z.array(z.string()).default([]),
  practicalNotes: z.string(),
});

export const specificSuggestionsPayloadSchema = z.object({
  suggestions: z.array(specificSuggestionSchema).length(3),
  caveat: z.string(),
});
