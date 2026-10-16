"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OptimizeToursRequest } from "@unmap/sdk";
import { getUnmap } from "@/lib/kit/client";
import { isAbort } from "@/lib/kit/errors";
import { requestKey } from "@/lib/request-key";
import { buildReport, type Report } from "@/lib/scenario/report";
import type { Json } from "@/lib/scenario/load";
import { deleteField } from "@/lib/scenario/names";
import { classifyOptimizeError, type OptimizeProblem } from "./optimize-error";

export type CheckState =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ok"; key: string; report: Report }
  | { status: "error"; key: string; problem: OptimizeProblem }
  /** No API key is configured: nothing is ever called. */
  | { status: "disabled" };

/**
 * The free check: `POST /optimize` with `solvingMode: "VALIDATE_ONLY"`, on demand only.
 *
 * `current` is the request on screen now. An answer belongs to the exact request it was asked for,
 * so once `current` hashes differently the state reads as idle and is never shown against another
 * file or setting. Leave `current` out to read whatever was asked last. The key is memoised on the
 * object, so `current` is treated as immutable: a changed request must be a new object.
 */
export function useCheck(current?: Json | null) {
  const [state, setState] = useState<CheckState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  // Hashed once per request object, not on every render: a 4 MiB scenario is slow to canonicalise.
  const currentKey = useMemo(() => (current ? requestKey(current) : null), [current]);
  const hasKey = getUnmap() !== null;

  useEffect(() => () => controller.current?.abort(), []);

  const check = useCallback(
    (request: Json) => {
      const unmap = getUnmap();
      if (!unmap) return;
      const key = requestKey(request);
      controller.current?.abort();
      const own = new AbortController();
      controller.current = own;
      setState({ status: "loading", key });
      // The file's own solvingMode, in either spelling, gives way to VALIDATE_ONLY: never two of them.
      const body: Json = { ...request };
      deleteField(body, "solvingMode");
      body.solvingMode = "VALIDATE_ONLY";
      unmap.router.optimizeTours(body as unknown as OptimizeToursRequest, { signal: own.signal }).then(
        (result) => {
          if (own.signal.aborted) return;
          setState({ status: "ok", key, report: buildReport(result.response as Json, result.warnings) });
        },
        (error: unknown) => {
          if (own.signal.aborted || isAbort(error)) return;
          setState({ status: "error", key, problem: classifyOptimizeError(error) });
        },
      );
    },
    [],
  );

  /** Drops whatever is on screen: aborts a call in flight and goes back to idle. */
  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "idle" });
  }, []);

  const shown: CheckState = !hasKey
    ? { status: "disabled" }
    : state.status === "idle" || state.status === "disabled" || currentKey === null || state.key === currentKey
      ? state
      : { status: "idle" };
  return { state: shown, check, reset };
}
