// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { UnmapError, UnmapOptimizeError } from "@unmap/sdk";

const optimizeTours = vi.fn();
let hasKey = true;
vi.mock("@/lib/kit/client", () => ({ getUnmap: () => (hasKey ? { router: { optimizeTours } } : null) }));

import { useCheck } from "../hooks/use-check";
import { useSolve } from "../hooks/use-solve";
import { requestKey } from "../lib/request-key";

const requestA = { model: { shipments: [{ label: "a", pickups: [{ arrivalLocation: { latLng: { latitude: 51.04, longitude: -114.07 } } }] }], vehicles: [{ label: "v" }] } };
const requestB = { model: { ...requestA.model, vehicles: [{ label: "w" }] } };

const solved = {
  response: {
    routes: [{ vehicleIndex: 0, visits: [{ shipmentIndex: 0, isPickup: true, startTime: "2026-01-01T09:00:00Z" }], metrics: { travelDistanceMeters: 1000, travelDuration: "60s" } }],
    skippedShipments: [],
    metrics: { aggregatedRouteMetrics: { performedShipmentCount: 1, travelDistanceMeters: 1000, travelDuration: "60s" }, totalCost: 3 },
  },
  warnings: [{ code: "ROAD_TRAVEL_FORCED", message: "straight line" }],
  billableShipments: 1,
  timeoutClamped: true,
  clampedTimeoutSeconds: 30,
};

beforeEach(() => {
  hasKey = true;
  optimizeTours.mockReset();
});
afterEach(cleanup);

describe("requestKey", () => {
  it("ignores key order and tells different requests apart", () => {
    expect(requestKey({ a: 1, b: { c: [1, 2], d: 3 } })).toBe(requestKey({ b: { d: 3, c: [1, 2] }, a: 1 }));
    expect(requestKey({ a: 1 })).not.toBe(requestKey({ a: 2 }));
    expect(requestKey({ a: [1, 2] })).not.toBe(requestKey({ a: [2, 1] }));
  });
});

describe("useCheck", () => {
  it("sends VALIDATE_ONLY and builds a report from the body", async () => {
    optimizeTours.mockResolvedValue({
      response: {
        validationErrors: [
          { code: 1, displayName: "FIELD_NOT_SUPPORTED_YET", errorMessage: "x", fields: [{ name: "model", subField: { name: "shipments", index: 0 } }] },
        ],
      },
      warnings: [],
      billableShipments: 0,
      timeoutClamped: false,
      clampedTimeoutSeconds: null,
    });
    const { result } = renderHook(() => useCheck(requestA));
    expect(result.current.state.status).toBe("idle");
    expect(optimizeTours).not.toHaveBeenCalled();
    act(() => result.current.check(requestA));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    const [body, opts] = optimizeTours.mock.calls[0]!;
    expect(body.solvingMode).toBe("VALIDATE_ONLY");
    expect(body.model).toEqual(requestA.model);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    const state = result.current.state;
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.report.status).toBe("needs-changes");
    expect(state.report.removable).toHaveLength(1);
  });

  it("replaces the file's own solvingMode, in either spelling, with VALIDATE_ONLY", () => {
    optimizeTours.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCheck(null));
    act(() => result.current.check({ ...requestA, solving_mode: "DEFAULT_SOLVE" }));
    act(() => result.current.check({ ...requestA, solvingMode: "DEFAULT_SOLVE" }));
    for (const [body] of optimizeTours.mock.calls) {
      expect(body.solvingMode).toBe("VALIDATE_ONLY");
      expect("solving_mode" in body).toBe(false);
    }
  });

  it("shows an error state, with a 429 wait", async () => {
    optimizeTours.mockRejectedValue(new UnmapError(429, "slow down", "rate_limited", 12));
    const { result } = renderHook(() => useCheck(requestA));
    act(() => result.current.check(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    if (state.status !== "error") throw new Error("expected error");
    expect(state.problem).toEqual({ kind: "rate-limited", code: "rate_limited", retryAfterSeconds: 12 });
  });

  it("reads as idle once the request on screen changes", async () => {
    optimizeTours.mockResolvedValue({ response: {}, warnings: [], billableShipments: 0, timeoutClamped: false, clampedTimeoutSeconds: null });
    const { result, rerender } = renderHook(({ current }) => useCheck(current), { initialProps: { current: requestA as Record<string, unknown> } });
    act(() => result.current.check(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    rerender({ current: requestB });
    expect(result.current.state.status).toBe("idle");
    rerender({ current: requestA });
    expect(result.current.state.status).toBe("ok");
  });
});

describe("useCheck reset", () => {
  it("aborts the check in flight and goes idle", () => {
    let signal: AbortSignal | undefined;
    optimizeTours.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useCheck(requestA));
    act(() => result.current.check(requestA));
    expect(result.current.state.status).toBe("loading");
    act(() => result.current.reset());
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.status).toBe("idle");
  });
});

describe("useSolve", () => {
  it("returns the response, warnings, billing, clamp and a summary", async () => {
    optimizeTours.mockResolvedValue(solved);
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    const state = result.current.state;
    if (state.status !== "ok") throw new Error("expected ok");
    expect(state.billableShipments).toBe(1);
    expect(state.warnings).toEqual(solved.warnings);
    expect(state.timeoutClamped).toBe(true);
    expect(state.clampedTimeoutSeconds).toBe(30);
    expect(state.summary.performed).toBe(1);
    expect(optimizeTours.mock.calls[0]![0]).toBe(requestA);
  });

  it("surfaces retryAfterSeconds on a 429", async () => {
    optimizeTours.mockRejectedValue(new UnmapOptimizeError(429, "limit", "rate_limited", 30, "RESOURCE_EXHAUSTED"));
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    if (state.status !== "error") throw new Error("expected error");
    expect(state.problem).toEqual({ kind: "rate-limited", code: "rate_limited", retryAfterSeconds: 30 });
  });

  it("surfaces the violations of a FAILED_PRECONDITION", async () => {
    optimizeTours.mockRejectedValue(
      new UnmapOptimizeError(400, "no vehicle", undefined, undefined, "FAILED_PRECONDITION", [
        { "@type": "type.googleapis.com/google.rpc.RetryInfo" },
        {
          "@type": "type.googleapis.com/google.rpc.PreconditionFailure",
          violations: [{ type: "NO_VEHICLE", subject: "model.shipments[3]", description: "No allowed vehicle can perform this mandatory shipment." }],
        },
      ]),
    );
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    if (state.status !== "error") throw new Error("expected error");
    expect(state.problem).toEqual({
      kind: "infeasible",
      violations: [{ type: "NO_VEHICLE", subject: "model.shipments[3]", description: "No allowed vehicle can perform this mandatory shipment." }],
    });
  });

  it("hands any other error to the UI untouched", async () => {
    const failure = new UnmapOptimizeError(400, "bad", "bad_request", undefined, "INVALID_ARGUMENT");
    optimizeTours.mockRejectedValue(failure);
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    if (state.status !== "error") throw new Error("expected error");
    expect(state.problem).toEqual({ kind: "other", error: failure });
  });

  it("does not show a result for an old key", async () => {
    optimizeTours.mockResolvedValue(solved);
    const { result, rerender } = renderHook(({ current }) => useSolve(current), { initialProps: { current: requestA as Record<string, unknown> } });
    act(() => result.current.solve(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("ok"));
    rerender({ current: requestB });
    expect(result.current.state.status).toBe("idle");
  });

  it("aborts the request on unmount and ignores the late answer", async () => {
    let signal: AbortSignal | undefined;
    let finish: (value: unknown) => void = () => {};
    optimizeTours.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise((resolve) => (finish = resolve));
    });
    const { result, unmount } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => finish(solved));
  });

  it("aborts the earlier call when a new one starts", () => {
    const signals: AbortSignal[] = [];
    optimizeTours.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useSolve(requestB));
    act(() => result.current.solve(requestA));
    act(() => result.current.solve(requestB));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it("keeps the gateway code of a spent allowance", async () => {
    optimizeTours.mockRejectedValue(new UnmapOptimizeError(429, "quota", "quota_exceeded", 3600, "RESOURCE_EXHAUSTED"));
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    const state = result.current.state;
    if (state.status !== "error") throw new Error("expected error");
    expect(state.problem).toEqual({ kind: "rate-limited", code: "quota_exceeded", retryAfterSeconds: 3600 });
  });

  it("reset aborts the solve in flight and goes idle", async () => {
    let signal: AbortSignal | undefined;
    let finish: (value: unknown) => void = () => {};
    optimizeTours.mockImplementation((_req: unknown, opts: { signal: AbortSignal }) => {
      signal = opts.signal;
      return new Promise((resolve) => (finish = resolve));
    });
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    expect(result.current.state.status).toBe("loading");
    act(() => result.current.reset());
    expect(signal?.aborted).toBe(true);
    expect(result.current.state.status).toBe("idle");
    // The late answer is dropped.
    await act(async () => finish(solved));
    expect(result.current.state.status).toBe("idle");
  });

  it("ignores an abort error rather than showing it", async () => {
    optimizeTours.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const { result } = renderHook(() => useSolve(requestA));
    act(() => result.current.solve(requestA));
    await act(async () => {});
    expect(result.current.state.status).toBe("loading");
  });
});

describe("without a key", () => {
  it("is disabled and never calls", () => {
    hasKey = false;
    const check = renderHook(() => useCheck(requestA));
    const solve = renderHook(() => useSolve(requestA));
    act(() => check.result.current.check(requestA));
    act(() => solve.result.current.solve(requestA));
    expect(check.result.current.state.status).toBe("disabled");
    expect(solve.result.current.state.status).toBe("disabled");
    expect(optimizeTours).not.toHaveBeenCalled();
  });
});
