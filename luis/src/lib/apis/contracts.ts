/**
 * Request/response contracts between the browser and our route handlers.
 * The zod schemas are `.strict()`: unknown fields → 400 (defense in depth,
 * the browser-side router already enforces the allowlist).
 */
import { z } from "zod";
import type { CompanyFact, SalaryBenchmark } from "../types";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const companyRequestSchema = z
  .object({
    company: shortText(120),
    role: shortText(120),
  })
  .strict();

export const salaryRequestSchema = z
  .object({
    jobTitle: shortText(120),
    location: shortText(120),
    yearsBucket: z.enum([
      "LESS_THAN_ONE",
      "ONE_TO_THREE",
      "FOUR_TO_SIX",
      "SEVEN_TO_NINE",
      "TEN_TO_FOURTEEN",
      "ABOVE_FIFTEEN",
    ]),
  })
  .strict();

export const letterRequestSchema = z
  .object({
    desiredRole: shortText(120),
    targetCompany: shortText(120),
    yearsExperience: z.number().int().min(0).max(60),
    achievements: z.string().max(2_100),
    jobOffer: z.string().max(4_100),
    companyFacts: z
      .array(
        z
          .object({
            id: z.number().int().min(1).max(10),
            title: z.string().max(300),
            snippet: z.string().max(400),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();

export type CompanyRequest = z.infer<typeof companyRequestSchema>;
export type SalaryRequest = z.infer<typeof salaryRequestSchema>;
export type LetterRequest = z.infer<typeof letterRequestSchema>;

export interface ApiError {
  error: { code: string; message: string };
}

export interface CompanyResponse {
  facts: CompanyFact[];
  /** What the route sent to Tavily (never the key). */
  upstream: { url: string; body: Record<string, unknown> };
}

export interface SalaryResponse {
  benchmark: SalaryBenchmark | null;
  upstream: { url: string; params: Record<string, string> };
}

export interface LetterResponse {
  letter: string;
  usedFacts: number[];
  model: string;
  upstream: { model: string; prompt: string };
}
