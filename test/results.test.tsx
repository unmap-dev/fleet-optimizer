// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { strFromU8, unzipSync } from "fflate";

// MapLibre needs WebGL, which jsdom lacks: the registry map pieces render as plain elements, so the
// result map's own work (one line per vehicle, a pin per stop and depot) is still what is tested.
vi.mock("@/components/ui/map", () => ({ Map: ({ children }: { children?: ReactNode }) => <div data-mock-map="">{children}</div> }));
vi.mock("@/components/ui/route-line", () => ({
  RouteLine: ({ id, coordinates }: { id?: string; coordinates: unknown[] }) => <div data-mock-route={id} data-points={coordinates.length} />,
}));
vi.mock("@/components/ui/marker-popup", () => ({
  Marker: ({ markerContent, children }: { markerContent?: ReactNode; children?: ReactNode }) => (
    <div data-mock-marker="">
      {markerContent}
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div data-mock-popup="">{children}</div>,
}));
vi.mock("@/lib/map-context", async (orig) => ({ ...(await orig<typeof import("@/lib/map-context")>()), useMap: () => null, useMapGeneration: () => 0 }));

import { Results, type ResultsProps } from "../components/fleet/results";
import type { SolveState } from "../hooks/use-solve";
import { format, formatDistance, formatDuration, formatNumber } from "../lib/kit/i18n";
import { summarisePlan } from "../lib/plan/summary";
import type { Json } from "../lib/scenario/load";
import { TEXT } from "../lib/text";
import { request, response } from "./fixtures/courier-plan";

type Lang = "en" | "fr";

function solvedState(res: Json = response(), extra: Partial<Extract<SolveState, { status: "ok" }>> = {}): SolveState {
  return {
    status: "ok",
    key: "k",
    response: res,
    warnings: [],
    billableShipments: 3,
    timeoutClamped: false,
    clampedTimeoutSeconds: null,
    summary: summarisePlan(request(), res),
    ...extra,
  };
}

/** Google's plan for the same request: a different total, one more vehicle, nothing skipped. */
function googleSolution(): Json {
  const res = response();
  res.metrics = { aggregatedRouteMetrics: { performedShipmentCount: 4, travelDistanceMeters: 13500, totalDuration: "5400s" }, usedVehicleCount: 3, totalCost: 52.25 };
  res.skippedShipments = [];
  return res;
}

function show(lang: Lang, props: Partial<ResultsProps> = {}) {
  return render(
    <Results state={solvedState()} removed={[]} solved={request()} original={request()} googleSolution={null} lang={lang} {...props} />,
  );
}

function total(key: string): string {
  return document.querySelector(`[data-total="${key}"] td:last-child`)?.textContent ?? "";
}

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each<Lang>(["en", "fr"])("Fleet Optimizer results (%s)", (lang) => {
  const t = TEXT[lang].results;

  it("shows the empty state before a solve and the spinner while solving", () => {
    const { rerender } = show(lang, { state: { status: "idle" } });
    expect(document.querySelector('[data-results="empty"]')).toBeTruthy();
    rerender(<Results state={{ status: "loading", key: "k" }} removed={[]} solved={null} original={null} googleSolution={null} lang={lang} />);
    expect(document.querySelector('[data-results="solving"]')?.textContent).toContain(t.solvingTitle);
  });

  it("totals show the plan's numbers, each cost key and the billable shipments", () => {
    show(lang);
    expect(total("totalCost")).toBe(formatNumber(45, lang, 2));
    expect(total("distance")).toBe(formatDistance(11000, lang));
    expect(total("duration")).toBe(formatDuration(4560, lang));
    expect(total("vehicles")).toBe(formatNumber(2, lang));
    expect(total("performed")).toBe(formatNumber(3, lang));
    expect(total("skipped")).toBe(formatNumber(1, lang));
    expect(total("billable")).toBe(formatNumber(3, lang));
    const hour = document.querySelector('[data-total="cost:model.vehicles.cost_per_hour"]')?.textContent;
    expect(hour).toContain(t.costs["model.vehicles.cost_per_hour"]);
    expect(hour).toContain(formatNumber(20, lang, 2));
    expect(document.querySelector("[data-billing-note]")?.textContent).toBe(t.billingNote);
  });

  it("names a known skipped reason in words and shows an unknown one as its code", () => {
    const res = response();
    res.skippedShipments = [{ index: 3, label: "order-304", reasons: [{ code: "NO_VEHICLE" }, { code: "SOMETHING_NEW" }] }];
    res.metrics = { ...(res.metrics as Json), costs: { "model.something_new": 1.5 } };
    show(lang, { state: solvedState(res) });
    const skipped = document.querySelector("[data-skipped]") as HTMLElement;
    expect(skipped.textContent).toContain("order-304");
    expect(skipped.querySelector('[data-reason="NO_VEHICLE"]')?.textContent).toBe(t.reasons.NO_VEHICLE);
    const unknown = skipped.querySelector('[data-reason="SOMETHING_NEW"]');
    expect(unknown?.tagName).toBe("CODE");
    expect(unknown?.textContent).toBe("SOMETHING_NEW");
    // An unknown cost key is shown as written.
    expect(document.querySelector('[data-total="cost:model.something_new"] code')?.textContent).toBe("model.something_new");
  });

  it("the comparison is absent without a solution.json", () => {
    show(lang);
    expect(document.querySelector("[data-comparison]")).toBeNull();
  });

  it("the comparison is present with a solution.json, numbers only, with the travel-time caveat", () => {
    show(lang, { googleSolution: googleSolution() });
    const card = document.querySelector("[data-comparison]") as HTMLElement;
    expect(card.textContent).toContain(t.compareNote);
    const cell = (metric: string, side: string) => card.querySelector(`[data-compare="${metric}"] [data-side="${side}"]`)?.textContent;
    expect(cell("totalCost", "unmap")).toBe(formatNumber(45, lang, 2));
    expect(cell("totalCost", "google")).toBe(formatNumber(52.25, lang, 2));
    expect(cell("vehiclesUsed", "google")).toBe(formatNumber(3, lang));
    expect(cell("skipped", "unmap")).toBe(formatNumber(1, lang));
    expect(cell("skipped", "google")).toBe(formatNumber(0, lang));
  });

  it("the without-banner shows on the plan and the comparison when fields were removed", () => {
    const removed = ["model.shipments[0].costsPerVehicle", "model.vehicles[0].routeModifiers"];
    const label = format(TEXT[lang].report.solvedWithout, { paths: removed.join(", ") });
    show(lang, { removed, googleSolution: googleSolution() });
    expect(document.querySelector("[data-results-without]")?.textContent).toBe(label);
    expect(document.querySelector("[data-compare-without]")?.textContent).toBe(label);
  });

  it("has no without-banner when nothing was removed", () => {
    show(lang, { googleSolution: googleSolution() });
    expect(document.querySelector("[data-results-without]")).toBeNull();
    expect(document.querySelector("[data-compare-without]")).toBeNull();
  });

  it("says when the key's plan limited the solve time", () => {
    show(lang, { state: solvedState(response(), { timeoutClamped: true, clampedTimeoutSeconds: 30 }) });
    expect(document.querySelector("[data-timeout-clamped]")?.textContent).toBe(format(t.timeoutClamped, { n: formatNumber(30, lang) }));
  });

  it("shows the solve's warnings in the report's table, and none when there are none", () => {
    show(lang);
    expect(document.querySelector("[data-solve-warnings]")).toBeNull();
    cleanup();
    show(lang, { state: solvedState(response(), { warnings: [{ code: "ROAD_TRAVEL_FORCED", message: "Travel was straight-line.", field: "useGeodesicDistances" }] }) });
    const section = document.querySelector("[data-solve-warnings]") as HTMLElement;
    expect(section.textContent).toContain(t.warningsTitle);
    expect(section.querySelector("[data-warnings]")?.textContent).toContain("ROAD_TRAVEL_FORCED");
    expect(section.textContent).toContain("useGeodesicDistances");
    expect(section.textContent).toContain("Travel was straight-line.");
  });

  it("draws a line per used vehicle, a pin per visit and a pin per depot", () => {
    show(lang);
    const routes = [...document.querySelectorAll("[data-mock-route]")].map((el) => el.getAttribute("data-mock-route"));
    expect(routes).toEqual(["fleet-route-0", "fleet-route-1"]);
    expect(document.querySelectorAll("[data-stop-pin]")).toHaveLength(6);
    expect(document.querySelectorAll("[data-depot-pin]").length).toBeGreaterThan(0);
  });

  it("draws one timeline row per used vehicle, and names an unlabelled one", () => {
    const state = solvedState();
    if (state.status !== "ok") throw new Error("unreachable");
    state.summary.rows[1] = { ...state.summary.rows[1], label: "" };
    show(lang, { state });
    const rows = document.querySelectorAll("[data-timeline-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("courier-1");
    expect(rows[1].textContent).toContain(format(t.vehicle, { n: formatNumber(2, lang) }));
    const kinds = new Set([...rows[0].querySelectorAll("[data-segment]")].map((el) => el.getAttribute("data-segment")));
    expect(kinds).toEqual(new Set(["travel", "wait", "visit", "break"]));
    expect(document.querySelector("[data-timeline]")?.textContent).toContain(t.timelineUtc);
  });

  it("downloads the response as JSON and the Fleet Routing App ZIP, with the removed paths in the label", async () => {
    const blobs: { name: string; blob: Blob }[] = [];
    let last: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      last = blob;
      return "blob:x";
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      blobs.push({ name: this.download, blob: last as unknown as Blob });
    });
    const removed = ["model.vehicles[0].routeModifiers"];
    show(lang, { removed });
    fireEvent.click(document.querySelector('button[data-download="response"]') as HTMLButtonElement);
    fireEvent.click(document.querySelector('button[data-download="zip"]') as HTMLButtonElement);
    expect(blobs.map((b) => b.name)).toEqual(["fleet-optimizer-response.json", "fleet-optimizer-plan.zip"]);
    expect(JSON.parse(await blobs[0].blob.text())).toEqual(response());
    const files = unzipSync(new Uint8Array(await blobs[1].blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["scenario.json", "solution.json"]);
    expect(JSON.parse(strFromU8(files["scenario.json"])).label).toContain("model.vehicles[0].routeModifiers");
  });
});
