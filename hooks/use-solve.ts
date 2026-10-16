"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OptimizeToursRequest, OptimizeToursWarning } from "@unmap/sdk";
import { getUnmap } from "@/lib/kit/client";
import { isAbort } from "@/lib/kit/errors";
import { summarisePlan, type PlanSummary } from "@/lib/plan/summary";
import { requestKey } from "@/lib/request-key";
import type { Json } from "@/lib/scenario/load";
import { classifyOptimizeError, type OptimizeProblem } from "./optimize-error";

export type SolveState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | {
      status: "ok";
      key: string;
      response: Json;
      warnings: OptimizeToursWarning[];
      billableShipments: number;
      /** True when the requested timeout was over the plan's cap and was shortened. */
      timeoutClamped: boolean;
      /** The timeout the solve ran with, in seconds, when `timeoutClamped`; otherwise null. */
      clampedTimeoutSeconds: number | null;
      summary: PlanSummary;
    }
  | { status: "error"; key: string; problem: OptimizeProblem }
  /** No API key is configured: nothing is ever called. */
  | { status: "disabled" };

/**
 * The solve: `POST /optimize`, on demand only. `current` is the request on screen now; an answer
 * for any other request reads as idle (see `useCheck`, which also explains why `current` must be
 * a new object when the request changes). The request is sent as given, so a caller
 * passes the stripped request with settings applied.
 */
export function useSolve(current?: Json | null) {
  const [state, setState] = useState<SolveState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  // Hashed once per request object, not on every render: a 4 MiB scenario is slow to canonicalise.
  const currentKey = useMemo(() => (current ? requestKey(current) : null), [current]);
  const hasKey = getUnmap() !== null;

  useEffect(() => () => controller.current?.abort(), []);

  const solve = useCallback((request: Json) => {
    const unmap = getUnmap();
    if (!unmap) return;
    const key = requestKey(request);
    controller.current?.abort();
    const own = new AbortController();
    controller.current = own;
    setState({ status: "loading", key });
    unmap.router.optimizeTours(request as unknown as OptimizeToursRequest, { signal: own.signal }).then(
      (result) => {
        if (own.signal.aborted) return;
        const response = result.response as Json;
        setState({
          status: "ok",
          key,
          response,
          warnings: result.warnings,
          billableShipments: result.billableShipments,
          timeoutClamped: result.timeoutClamped,
          clampedTimeoutSeconds: result.clampedTimeoutSeconds,
          summary: summarisePlan(request, response),
        });
      },
      (error: unknown) => {
        if (own.signal.aborted || isAbort(error)) return;
        setState({ status: "error", key, problem: classifyOptimizeError(error) });
      },
    );
  }, []);

  /** Drops whatever is on screen: aborts a call in flight and goes back to idle. */
  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "idle" });
  }, []);

  const shown: SolveState = !hasKey
    ? { status: "disabled" }
    : state.status === "idle" || state.status === "disabled" || currentKey === null || state.key === currentKey
      ? state
      : { status: "idle" };
  return { state: shown, solve, reset };
}
