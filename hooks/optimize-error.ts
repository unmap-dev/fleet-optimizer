import { UnmapError, UnmapOptimizeError } from "@unmap/sdk";

/** One unservable mandatory shipment from a `google.rpc.PreconditionFailure`. */
export interface PreconditionViolation {
  /** The reason code, such as `TIME_WINDOW_INFEASIBLE`. */
  type: string;
  /** The request path, such as `model.shipments[3]`. */
  subject: string;
  description: string;
}

/**
 * An Optimize failure sorted by what the UI does with it:
 * - `rate-limited`: 429, or a refusal for a spent allowance. `code` is the gateway's (`rate_limited`,
 *   `quota_exceeded`, `spend_cap`, `billing_required`); `retryAfterSeconds` is undefined when no
 *   header came back.
 * - `infeasible`: 400 FAILED_PRECONDITION; mandatory shipments no vehicle can serve, listed in `violations`.
 * - `other`: anything else; render with `describeError(error, lang)` from `@/lib/kit/errors`.
 */
export type OptimizeProblem =
  | { kind: "rate-limited"; code: string | undefined; retryAfterSeconds: number | undefined }
  | { kind: "infeasible"; violations: PreconditionViolation[] }
  | { kind: "other"; error: unknown };

function violationsOf(error: UnmapOptimizeError): PreconditionViolation[] {
  const out: PreconditionViolation[] = [];
  for (const detail of error.details) {
    if (typeof detail["@type"] !== "string" || !detail["@type"].endsWith("PreconditionFailure")) continue;
    const violations = detail.violations;
    if (!Array.isArray(violations)) continue;
    for (const v of violations) {
      if (!v || typeof v !== "object") continue;
      const r = v as Record<string, unknown>;
      out.push({
        type: typeof r.type === "string" ? r.type : "CODE_UNSPECIFIED",
        subject: typeof r.subject === "string" ? r.subject : "",
        description: typeof r.description === "string" ? r.description : "",
      });
    }
  }
  return out;
}

/** Gateway codes that mean the key's allowance is spent: waiting a minute will not help. */
export const QUOTA_CODES: readonly string[] = ["quota_exceeded", "spend_cap", "billing_required"];

export function classifyOptimizeError(error: unknown): OptimizeProblem {
  if (error instanceof UnmapError && (error.status === 429 || (error.code !== undefined && QUOTA_CODES.includes(error.code)))) {
    return { kind: "rate-limited", code: error.code, retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error instanceof UnmapOptimizeError && error.googleStatus === "FAILED_PRECONDITION") {
    const violations = violationsOf(error);
    if (violations.length > 0) return { kind: "infeasible", violations };
  }
  return { kind: "other", error };
}
