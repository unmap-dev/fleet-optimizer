import type { PlanSummary } from "./summary";

export type ComparisonMetric = "totalCost" | "distanceMeters" | "durationSeconds" | "vehiclesUsed" | "performed" | "skipped";

export interface Comparison {
  rows: { metric: ComparisonMetric; unmap: number; google: number }[];
}

/** The two plans' numbers side by side. It copies them and does not say which is better. */
export function comparePlans(unmap: PlanSummary, google: PlanSummary): Comparison {
  const pick = (plan: PlanSummary): Record<ComparisonMetric, number> => ({
    totalCost: plan.totalCost,
    distanceMeters: plan.distanceMeters,
    durationSeconds: plan.durationSeconds,
    vehiclesUsed: plan.vehiclesUsed,
    performed: plan.performed,
    skipped: plan.skipped.length,
  });
  const a = pick(unmap);
  const b = pick(google);
  return {
    rows: (Object.keys(a) as ComparisonMetric[]).map((metric) => ({ metric, unmap: a[metric], google: b[metric] })),
  };
}
