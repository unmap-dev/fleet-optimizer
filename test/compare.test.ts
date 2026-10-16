import { describe, expect, it } from "vitest";
import { comparePlans } from "../lib/plan/compare";
import type { PlanSummary } from "../lib/plan/summary";

function plan(over: Partial<PlanSummary>): PlanSummary {
  return {
    totalCost: 0,
    costs: {},
    distanceMeters: 0,
    durationSeconds: 0,
    vehiclesUsed: 0,
    performed: 0,
    skipped: [],
    rows: [],
    features: { type: "FeatureCollection", features: [] },
    ...over,
  };
}

describe("comparePlans", () => {
  it("copies each number side by side and judges none", () => {
    const unmap = plan({ totalCost: 10, distanceMeters: 5000, durationSeconds: 900, vehiclesUsed: 2, performed: 5, skipped: [{ index: 1, reasons: [] }] });
    const google = plan({ totalCost: 12, distanceMeters: 4000, durationSeconds: 1000, vehiclesUsed: 3, performed: 6 });
    const result = comparePlans(unmap, google);
    expect(result.rows).toEqual([
      { metric: "totalCost", unmap: 10, google: 12 },
      { metric: "distanceMeters", unmap: 5000, google: 4000 },
      { metric: "durationSeconds", unmap: 900, google: 1000 },
      { metric: "vehiclesUsed", unmap: 2, google: 3 },
      { metric: "performed", unmap: 5, google: 6 },
      { metric: "skipped", unmap: 1, google: 0 },
    ]);
    for (const row of result.rows) expect(Object.keys(row).sort()).toEqual(["google", "metric", "unmap"]);
  });
});
