// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { UnmapOptimizeError } from "@unmap/sdk";

const optimizeTours = vi.fn();
vi.mock("@/lib/kit/client", () => ({ getUnmap: () => ({ router: { optimizeTours } }) }));
vi.mock("@/lib/kit/config", async (orig) => ({ ...(await orig<typeof import("@/lib/kit/config")>()), API_KEY: "test" }));
// The results map needs WebGL, which jsdom lacks; results.test.tsx covers what it draws.
vi.mock("@/components/fleet/result-map", () => ({ ResultMap: () => null }));

import { FleetApp } from "../components/fleet/fleet-app";
import { format } from "../lib/kit/i18n";
import { TEXT } from "../lib/text";

type Lang = "en" | "fr";

const CALGARY = { latitude: 51.04, longitude: -114.07 };

function shipment(label: string, extra: Record<string, unknown> = {}) {
  return { label, deliveries: [{ arrivalLocation: CALGARY, duration: "300s" }], ...extra };
}

function request(shipments: number, extra: { shipment?: Record<string, unknown>; vehicle?: Record<string, unknown> } = {}) {
  return {
    model: {
      shipments: Array.from({ length: shipments }, (_, i) => shipment(`s${i}`, i === 0 ? extra.shipment : {})),
      vehicles: [{ label: "v0", startLocation: CALGARY, endLocation: CALGARY, ...extra.vehicle }],
    },
  };
}

function file(name: string, body: unknown): File {
  return new File([JSON.stringify(body)], name, { type: "application/json" });
}

function checked(validationErrors: unknown[] = []) {
  return { response: { validationErrors }, warnings: [], billableShipments: 0, timeoutClamped: false, clampedTimeoutSeconds: null };
}

const solved = {
  response: {
    routes: [{ vehicleIndex: 0, visits: [{ shipmentIndex: 0, isPickup: false, startTime: "2026-01-01T09:00:00Z" }], metrics: { travelDistanceMeters: 1000, travelDuration: "60s" } }],
    skippedShipments: [],
    metrics: { aggregatedRouteMetrics: { performedShipmentCount: 1, travelDistanceMeters: 1000, travelDuration: "60s" }, totalCost: 3 },
  },
  warnings: [],
  billableShipments: 1,
  timeoutClamped: false,
  clampedTimeoutSeconds: null,
};

const unsupported = (fields: unknown[]) => ({ code: 1, displayName: "FIELD_NOT_SUPPORTED_YET", errorMessage: "Not modelled yet.", fields });
const placeId = { code: 2, displayName: "PLACE_ID_NOT_SUPPORTED", errorMessage: "Use a latitude and longitude.", fields: [{ name: "model", subField: { name: "shipments", index: 0 } }] };

function scenarioInput(): HTMLInputElement {
  return document.querySelector('input[data-file-input="scenario"]') as HTMLInputElement;
}

function open(f: File) {
  const input = scenarioInput();
  Object.defineProperty(input, "files", { value: [f], configurable: true });
  fireEvent.change(input);
}

function solveButton(): HTMLButtonElement {
  return document.querySelector("button[data-solve]") as HTMLButtonElement;
}

function isValidate(body: { solvingMode?: string }) {
  return body.solvingMode === "VALIDATE_ONLY";
}

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  optimizeTours.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

describe.each<Lang>(["en", "fr"])("Fleet Optimizer panels (%s)", (lang) => {
  const t = TEXT[lang];

  async function mount() {
    window.history.replaceState(null, "", lang === "fr" ? "/?lang=fr" : "/");
    render(<FleetApp />);
    await screen.findByText(t.load.title);
  }

  it("shows the privacy and not-affiliated lines by the load area", async () => {
    await mount();
    const panel = document.querySelector("[data-load-panel]") as HTMLElement;
    expect(within(panel).getByText(t.privacy)).toBeTruthy();
    expect(within(panel).getByText(t.affiliation)).toBeTruthy();
  });

  it("over-cap scenario checks but cannot solve", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_SHIPMENTS", "25");
    vi.stubEnv("NEXT_PUBLIC_MAX_VEHICLES", "5");
    optimizeTours.mockResolvedValue(checked());
    await mount();
    open(file("big.json", request(30)));
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    expect(optimizeTours).toHaveBeenCalledTimes(1);
    expect(isValidate(optimizeTours.mock.calls[0]![0])).toBe(true);
    const notice = document.querySelector("[data-over-caps]") as HTMLElement;
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain("30");
    expect(notice.textContent).toContain(format(t.settings.limitShipments, { n: 25 }));
    expect(notice.textContent).toContain(t.settings.cloneHint);
    expect(solveButton().disabled).toBe(true);
    expect(screen.getByText(t.settings.waitOver)).toBeTruthy();
    fireEvent.click(solveButton());
    expect(optimizeTours).toHaveBeenCalledTimes(1);
  });

  it("a blocked report disables solve", async () => {
    optimizeTours.mockResolvedValue(checked([placeId]));
    await mount();
    fireEvent.click(document.querySelector('button[data-sample="last-mile-deliveries"]') as HTMLButtonElement);
    await waitFor(() => expect(document.querySelector('[data-status="blocked"]')).toBeTruthy());
    expect(screen.getByText(t.report.status.blocked)).toBeTruthy();
    expect(document.querySelector('[data-issues="blocking"]')?.textContent).toContain("PLACE_ID_NOT_SUPPORTED");
    // Each blocking issue says what to change in the file, not only what is wrong.
    expect(document.querySelector('[data-hint="PLACE_ID_NOT_SUPPORTED"]')?.textContent).toBe(t.report.hints.PLACE_ID_NOT_SUPPORTED);
    expect(document.querySelector("button[data-remove]")).toBeNull();
    expect(solveButton().disabled).toBe(true);
    expect(screen.getByText(t.settings.waitBlocked)).toBeTruthy();
  });

  it("the remove button shows the count and, after a click, the Solved without label appears", async () => {
    const issues = [
      unsupported([{ name: "model", subField: { name: "shipments", index: 0, subField: { name: "costsPerVehicle" } } }]),
      unsupported([{ name: "model", subField: { name: "vehicles", index: 0, subField: { name: "routeModifiers" } } }]),
    ];
    let checks = 0;
    optimizeTours.mockImplementation((body: { solvingMode?: string }) => {
      if (!isValidate(body)) return Promise.resolve(solved);
      checks++;
      return Promise.resolve(checks === 1 ? checked(issues) : checked());
    });
    await mount();
    open(file("gmpro.json", request(2, { shipment: { costsPerVehicle: [5] }, vehicle: { routeModifiers: { avoidTolls: true } } })));
    const remove = await waitFor(() => {
      const button = document.querySelector("button[data-remove]") as HTMLButtonElement | null;
      if (!button) throw new Error("no remove button yet");
      return button;
    });
    expect(remove.textContent).toContain(format(t.report.remove, { n: 2 }));
    expect(solveButton().disabled).toBe(true);
    expect(document.querySelector("[data-solved-without]")).toBeNull();

    fireEvent.click(remove);
    const label = format(t.report.solvedWithout, { paths: "model.shipments[0].costsPerVehicle, model.vehicles[0].routeModifiers" });
    await waitFor(() => expect(document.querySelector("[data-solved-without]")?.textContent).toBe(label));

    // The stripped request is checked again, then solved, and neither carries the removed fields.
    await waitFor(() => expect(optimizeTours).toHaveBeenCalledTimes(3));
    const [, recheck, solve] = optimizeTours.mock.calls.map((c) => c[0]);
    expect(isValidate(recheck)).toBe(true);
    expect(isValidate(solve)).toBe(false);
    for (const body of [recheck, solve]) {
      expect(body.model.shipments[0].costsPerVehicle).toBeUndefined();
      expect(body.model.vehicles[0].routeModifiers).toBeUndefined();
    }
    // Calgary is inside Canada, so the solve goes by road: no straight-line fields are written.
    expect(solve.useGeodesicDistances).toBeUndefined();
    await waitFor(() => expect(document.querySelector('[data-results="solved"]')).toBeTruthy());
    expect(document.querySelector("[data-results-without]")?.textContent).toBe(label);
  });

  it("loading a new file clears the old report", async () => {
    let checks = 0;
    optimizeTours.mockImplementation(() => {
      checks++;
      // The second file's check never answers, so only the reset can clear the first report.
      return checks === 1 ? Promise.resolve(checked([placeId])) : new Promise(() => {});
    });
    await mount();
    open(file("first.json", request(2)));
    await waitFor(() => expect(document.querySelector('[data-issues="blocking"]')).toBeTruthy());
    open(file("second.json", request(3)));
    await waitFor(() => expect(document.querySelector("[data-checking]")).toBeTruthy());
    expect(document.querySelector('[data-issues="blocking"]')).toBeNull();
    expect(document.querySelector("[data-status]")).toBeNull();
    expect(screen.getByText("second.json")).toBeTruthy();
  });

  it("forces straight-line travel for stops outside Canada", async () => {
    optimizeTours.mockImplementation((body: { solvingMode?: string }) => Promise.resolve(isValidate(body) ? checked() : solved));
    await mount();
    const paris = { latitude: 48.86, longitude: 2.35 };
    open(
      file("paris.json", {
        model: { shipments: [{ deliveries: [{ arrivalLocation: paris }] }], vehicles: [{ startLocation: paris }] },
      }),
    );
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    expect(document.querySelector("[data-outside-canada]")?.textContent).toContain(format(t.settings.outside, { n: 2 }));
    expect(screen.getByRole("button", { name: t.settings.road }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(solveButton());
    await waitFor(() => expect(optimizeTours).toHaveBeenCalledTimes(2));
    expect(optimizeTours.mock.calls[1]![0].useGeodesicDistances).toBe(true);
  });

  it("uses the scenario's own matrices instead of offering a travel choice", async () => {
    optimizeTours.mockResolvedValue(checked());
    await mount();
    const body = request(1);
    open(file("matrix.json", { ...body, model: { ...body.model, durationDistanceMatrices: [{ rows: [] }] } }));
    await waitFor(() => expect(document.querySelector("[data-matrices]")).toBeTruthy());
    expect(screen.getByText(t.settings.matrices)).toBeTruthy();
    expect(document.querySelector("[data-travel]")).toBeNull();
  });

  async function solveFile(name = "plan.json", body: unknown = request(1)) {
    open(file(name, body));
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    fireEvent.click(solveButton());
    await waitFor(() => expect(document.querySelector('[data-results="solved"]')).toBeTruthy());
  }

  it("a shown plan clears after a setting change, and the solve in flight is cancelled", async () => {
    const signals: AbortSignal[] = [];
    let solves = 0;
    optimizeTours.mockImplementation((body: { solvingMode?: string }, opts: { signal: AbortSignal }) => {
      if (isValidate(body)) return Promise.resolve(checked());
      signals.push(opts.signal);
      solves++;
      // The second solve never answers, so the timeout change below must clear it.
      return solves === 1 ? Promise.resolve(solved) : new Promise(() => {});
    });
    await mount();
    await solveFile();
    fireEvent.change(screen.getByLabelText(t.settings.timeout), { target: { value: "5" } });
    await waitFor(() => expect(document.querySelector('[data-results="empty"]')).toBeTruthy());
    fireEvent.click(solveButton());
    await waitFor(() => expect(document.querySelector('[data-results="solving"]')).toBeTruthy());
    fireEvent.change(screen.getByLabelText(t.settings.timeout), { target: { value: "6" } });
    expect(signals[1]!.aborted).toBe(true);
    await waitFor(() => expect(document.querySelector('[data-results="empty"]')).toBeTruthy());
  });

  it("a shown plan clears after a new file", async () => {
    optimizeTours.mockImplementation((body: { solvingMode?: string }) => Promise.resolve(isValidate(body) ? checked() : solved));
    await mount();
    await solveFile();
    open(file("other.json", request(2)));
    await waitFor(() => expect(document.querySelector('[data-results="empty"]')).toBeTruthy());
    expect(document.querySelector('[data-results="solved"]')).toBeNull();
  });

  it("a solution.json opened before its request attaches when the request arrives", async () => {
    optimizeTours.mockImplementation((body: { solvingMode?: string }) => Promise.resolve(isValidate(body) ? checked() : solved));
    await mount();
    open(file("solution.json", solved.response));
    await waitFor(() => expect(document.querySelector("[data-google-solution]")?.textContent).toBe(t.load.solutionWaiting));
    expect(optimizeTours).not.toHaveBeenCalled();
    await solveFile("request.json");
    expect(document.querySelector("[data-google-solution]")?.textContent).toBe(t.load.solutionLoaded);
    expect(document.querySelector("[data-comparison]")).toBeTruthy();
  });

  it("a waiting solution.json is not attached to a sample", async () => {
    optimizeTours.mockResolvedValue(checked());
    await mount();
    open(file("solution.json", solved.response));
    await waitFor(() => expect(document.querySelector("[data-google-solution]")).toBeTruthy());
    fireEvent.click(document.querySelector('button[data-sample="last-mile-deliveries"]') as HTMLButtonElement);
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    expect(document.querySelector("[data-google-solution]")).toBeNull();
  });

  it("a failed check says so, keeps solve off and offers to check again", async () => {
    let checks = 0;
    optimizeTours.mockImplementation(() => {
      checks++;
      return checks === 1 ? Promise.reject(new UnmapOptimizeError(504, "timeout", undefined, undefined, "DEADLINE_EXCEEDED")) : Promise.resolve(checked());
    });
    await mount();
    open(file("plan.json", request(1)));
    await waitFor(() => expect(document.querySelector('[data-solve-wait="check-failed"]')).toBeTruthy());
    expect(screen.getByText(t.settings.waitCheckFailed)).toBeTruthy();
    expect(solveButton().disabled).toBe(true);
    const retry = document.querySelector("[data-report-panel] button[data-retry]") as HTMLButtonElement;
    expect(retry.textContent).toContain(t.report.checkAgain);
    fireEvent.click(retry);
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    expect(checks).toBe(2);
  });

  it("names fields strip cannot delete, counts only the rest, and does not re-check for nothing", async () => {
    const issues = [
      unsupported([{ name: "model", subField: { name: "nothingHere" } }]),
      unsupported([{ name: "model", subField: { name: "vehicles", index: 0, subField: { name: "routeModifiers" } } }]),
    ];
    optimizeTours.mockImplementation((body: { solvingMode?: string }) => Promise.resolve(isValidate(body) ? checked(issues) : solved));
    await mount();
    open(file("gmpro.json", request(1, { vehicle: { routeModifiers: { avoidTolls: true } } })));
    await waitFor(() => expect(document.querySelector("button[data-remove]")).toBeTruthy());
    expect(document.querySelector("button[data-remove]")?.textContent).toContain(t.report.removeOne);
    expect(document.querySelector("[data-stuck]")?.textContent).toBe(format(t.report.stuck, { paths: "model.nothingHere" }));
  });

  it("shows no remove button and sends nothing more when no removable field resolves", async () => {
    optimizeTours.mockResolvedValue(checked([unsupported([{ name: "model", subField: { name: "nothingHere" } }])]));
    await mount();
    open(file("gmpro.json", request(1)));
    await waitFor(() => expect(document.querySelector("[data-stuck]")).toBeTruthy());
    expect(document.querySelector("button[data-remove]")).toBeNull();
    expect(optimizeTours).toHaveBeenCalledTimes(1);
  });

  it("marks an invalid timeout or speed and keeps solve off until it is fixed", async () => {
    optimizeTours.mockResolvedValue(checked());
    await mount();
    open(file("plan.json", request(1)));
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    expect(solveButton().disabled).toBe(false);
    const timeout = screen.getByLabelText(t.settings.timeout);
    fireEvent.change(timeout, { target: { value: "0" } });
    expect(timeout.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector("[data-invalid-timeout]")?.textContent).toBe(t.settings.timeoutInvalid);
    expect(solveButton().disabled).toBe(true);
    fireEvent.change(timeout, { target: { value: "" } });
    expect(timeout.getAttribute("aria-invalid")).toBeNull();
    expect(solveButton().disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: t.settings.straight }));
    const speed = screen.getByLabelText(t.settings.speed);
    fireEvent.change(speed, { target: { value: "0.5" } });
    expect(speed.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector("[data-invalid-speed]")?.textContent).toBe(t.settings.speedInvalid);
    expect(solveButton().disabled).toBe(true);
  });

  it("opens a file dropped anywhere on the page, and a drop on the zone only once", async () => {
    optimizeTours.mockResolvedValue(checked());
    await mount();
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { types: ["Files"], files: [file("anywhere.json", request(1))] } });
    (document.querySelector("[data-results-slot]") as HTMLElement).dispatchEvent(drop);
    // The browser must not navigate to the file.
    expect(drop.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByText("anywhere.json")).toBeTruthy());
    await waitFor(() => expect(optimizeTours).toHaveBeenCalledTimes(1));
    fireEvent.drop(document.querySelector("[data-drop-zone]") as HTMLElement, {
      dataTransfer: { types: ["Files"], files: [file("zone.json", request(2))] },
    });
    await waitFor(() => expect(screen.getByText("zone.json")).toBeTruthy());
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    expect(optimizeTours).toHaveBeenCalledTimes(2);
  });

  it("refuses a file over 4 MiB and sends nothing", async () => {
    await mount();
    open(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "huge.json", { type: "application/json" }));
    await waitFor(() => expect(document.querySelector('[data-load-error="too-large"]')).toBeTruthy());
    expect(screen.getByText(t.load.errors["too-large"])).toBeTruthy();
    expect(optimizeTours).not.toHaveBeenCalled();
  });

  it("does not auto-solve after a removal while a setting is invalid", async () => {
    const issues = [unsupported([{ name: "model", subField: { name: "vehicles", index: 0, subField: { name: "routeModifiers" } } }])];
    let checks = 0;
    optimizeTours.mockImplementation((body: { solvingMode?: string }) => {
      if (!isValidate(body)) return Promise.resolve(solved);
      checks++;
      return Promise.resolve(checks === 1 ? checked(issues) : checked());
    });
    await mount();
    open(file("gmpro.json", request(1, { vehicle: { routeModifiers: { avoidTolls: true } } })));
    const remove = await waitFor(() => {
      const button = document.querySelector("button[data-remove]") as HTMLButtonElement | null;
      if (!button) throw new Error("no remove button yet");
      return button;
    });
    fireEvent.change(screen.getByLabelText(t.settings.timeout), { target: { value: "0" } });
    fireEvent.click(remove);
    await waitFor(() => expect(document.querySelector('[data-status="ready"]')).toBeTruthy());
    await new Promise((r) => setTimeout(r, 20));
    expect(optimizeTours).toHaveBeenCalledTimes(2);
    expect(optimizeTours.mock.calls.every(([body]) => isValidate(body))).toBe(true);
    expect(solveButton().disabled).toBe(true);
  });

  it("names an unreadable file and sends nothing", async () => {
    await mount();
    open(new File(["{not json"], "broken.json", { type: "application/json" }));
    await waitFor(() => expect(document.querySelector('[data-load-error="not-json"]')).toBeTruthy());
    expect(screen.getByText(t.load.errors["not-json"])).toBeTruthy();
    expect(optimizeTours).not.toHaveBeenCalled();
  });
});
