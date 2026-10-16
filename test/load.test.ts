import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  canonicalise,
  loadFile,
  loadText,
  loadZip,
  MAX_BYTES,
  mergeSolution,
  ScenarioLoadError,
  type Json,
} from "../lib/scenario/load";

const request = { model: { shipments: [{ deliveries: [{ duration: { seconds: "300" } }] }] }, timeout: "10s" };
const solution = { routes: [{ vehicleIndex: 0 }] };

function zip(entries: Record<string, unknown>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) files[name] = strToU8(JSON.stringify(value));
  return zipSync(files);
}

function reason(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ScenarioLoadError ? error.reason : "other";
  }
  return undefined;
}

describe("loadText", () => {
  it("reads a request", () => {
    const loaded = loadText("a.json", JSON.stringify(request));
    expect(loaded.request).not.toBeNull();
    expect(loaded.googleSolution).toBeNull();
    expect(loaded.source).toEqual({ kind: "json", name: "a.json" });
  });

  it("converts Google's durations before anything else sees them", () => {
    const loaded = loadText("a.json", JSON.stringify(request));
    const model = loaded.request?.model as { shipments: { deliveries: { duration: string }[] }[] };
    expect(model.shipments[0]?.deliveries[0]?.duration).toBe("300s");
  });

  it("reads a solution on its own, with no request", () => {
    const loaded = loadText("solution.json", JSON.stringify(solution));
    expect(loaded.request).toBeNull();
    expect(loaded.googleSolution).toEqual(solution);
  });

  it("reads a { scenario, solution } wrapper", () => {
    const loaded = loadText("w.json", JSON.stringify({ scenario: request, solution }));
    expect(loaded.request).not.toBeNull();
    expect(loaded.googleSolution).toEqual(solution);
  });

  it("rejects a wrapper whose scenario has no model", () => {
    expect(reason(() => loadText("w.json", JSON.stringify({ scenario: { x: 1 } })))).toBe("no-scenario");
  });

  it("rejects invalid JSON", () => {
    expect(reason(() => loadText("a.json", "{nope"))).toBe("not-json");
  });

  it("rejects JSON that is neither a request nor a solution", () => {
    expect(reason(() => loadText("a.json", JSON.stringify({ hello: 1 })))).toBe("unknown-shape");
    expect(reason(() => loadText("a.json", "[1,2]"))).toBe("unknown-shape");
  });
});

describe("loadZip", () => {
  it("reads scenario.json alone", () => {
    const loaded = loadZip("a.zip", zip({ "scenario.json": request }));
    expect(loaded.request).not.toBeNull();
    expect(loaded.googleSolution).toBeNull();
    expect(loaded.source).toEqual({ kind: "zip", name: "a.zip" });
  });

  it("reads scenario.json and solution.json, at any depth and in any case", () => {
    const loaded = loadZip("a.zip", zip({ "export/Scenario.JSON": request, "export/inner/solution.json": solution }));
    expect(loaded.request).not.toBeNull();
    expect(loaded.googleSolution).toEqual(solution);
  });

  it("rejects a ZIP with no scenario.json", () => {
    expect(reason(() => loadZip("a.zip", zip({ "solution.json": solution })))).toBe("no-scenario");
  });

  it("rejects bytes that are not a ZIP", () => {
    expect(reason(() => loadZip("a.zip", strToU8("not a zip")))).toBe("unreadable");
  });

  it("rejects invalid JSON inside a ZIP", () => {
    const bytes = zipSync({ "scenario.json": strToU8("{nope") });
    expect(reason(() => loadZip("a.zip", bytes))).toBe("not-json");
  });
});

describe("loadFile", () => {
  it("reads a .json file", async () => {
    const loaded = await loadFile(new File([JSON.stringify(request)], "r.json"));
    expect(loaded.request).not.toBeNull();
  });

  it("reads a .zip file", async () => {
    const loaded = await loadFile(new File([zip({ "scenario.json": request }).slice().buffer], "r.zip"));
    expect(loaded.source.kind).toBe("zip");
  });

  it("recognises a ZIP with the wrong extension by its magic bytes", async () => {
    const loaded = await loadFile(new File([zip({ "scenario.json": request }).slice().buffer], "r.json"));
    expect(loaded.source.kind).toBe("zip");
  });
});

describe("size bounds", () => {
  it("refuses a file over the API's 4 MiB limit before reading it", async () => {
    const big = new File([new Uint8Array(MAX_BYTES + 1)], "big.json");
    await expect(loadFile(big)).rejects.toMatchObject({ reason: "too-large" });
    const bigZip = new File([new Uint8Array(MAX_BYTES + 1)], "big.zip");
    await expect(loadFile(bigZip)).rejects.toMatchObject({ reason: "too-large" });
  });

  it("refuses a ZIP whose scenario.json inflates past 4 MiB", () => {
    // Spaces compress to almost nothing: a small ZIP that would inflate past the limit.
    const padded = strToU8(JSON.stringify(request) + " ".repeat(MAX_BYTES));
    const bytes = zipSync({ "scenario.json": padded });
    expect(bytes.length).toBeLessThan(MAX_BYTES);
    expect(reason(() => loadZip("bomb.zip", bytes))).toBe("too-large");
  });

  it("inflates only scenario.json and solution.json, whatever else the ZIP holds", () => {
    const bytes = zipSync({ "scenario.json": strToU8(JSON.stringify(request)), "big.bin": new Uint8Array(MAX_BYTES * 2) });
    const loaded = loadZip("a.zip", bytes);
    expect(loaded.request).not.toBeNull();
  });
});

describe("canonicalise", () => {
  it("turns Google's duration objects into duration strings", () => {
    expect(canonicalise({ duration: { seconds: "300" } })).toEqual({ duration: "300s" });
    expect(canonicalise({ maxDuration: { seconds: 60, nanos: 500000000 } })).toEqual({ maxDuration: "60.5s" });
    expect(canonicalise({ delay: { nanos: 1000000000 }, timeout: { seconds: "5" } })).toEqual({
      delay: "1s",
      timeout: "5s",
    });
  });

  it("reaches into arrays and nested objects", () => {
    const out = canonicalise({ a: [{ softMaxDuration: { seconds: "9" }, minDuration: { seconds: "1" } }] });
    expect(out).toEqual({ a: [{ softMaxDuration: "9s", minDuration: "1s" }] });
  });

  it("leaves timestamps alone", () => {
    const value = { startTime: { seconds: "1760000000" }, endTime: { seconds: "1760003600" }, globalStartTime: { seconds: "1" } };
    expect(canonicalise(value)).toEqual(value);
  });

  it("leaves a duration-like key alone when its object has other fields or is already a string", () => {
    const value = { duration: { seconds: "3", unit: "x" }, travelDuration: "12s" };
    expect(canonicalise(value)).toEqual(value);
  });

  it("converts every element of a matrix row's durations", () => {
    const value = { model: { durationDistanceMatrices: [{ rows: [{ durations: [{ seconds: "60" }, { seconds: "120" }, "30s"], meters: [100, 200, 300] }] }] } };
    expect(canonicalise(value)).toEqual({
      model: { durationDistanceMatrices: [{ rows: [{ durations: ["60s", "120s", "30s"], meters: [100, 200, 300] }] }] },
    });
  });

  it("writes durations from integer parts, not floats", () => {
    const out = (d: unknown) => (canonicalise({ duration: d }) as { duration: unknown }).duration;
    expect(out({ seconds: "300" })).toBe("300s");
    expect(out({ seconds: "1", nanos: 500000000 })).toBe("1.5s");
    expect(out({ nanos: 1 })).toBe("0.000000001s");
    expect(out({ nanos: 500 })).toBe("0.0000005s");
    expect(out({ seconds: 123456789, nanos: 123456789 })).toBe("123456789.123456789s");
    expect(out({ seconds: "-2", nanos: -500000000 })).toBe("-2.5s");
    expect(out({ seconds: "oops" })).toEqual({ seconds: "oops" });
  });

  it("does not mutate its input", () => {
    const value = { duration: { seconds: "300" } };
    canonicalise(value);
    expect(value).toEqual({ duration: { seconds: "300" } });
  });
});

describe("loadZip shape checks", () => {
  it("rejects a scenario.json that has no model", () => {
    expect(reason(() => loadZip("a.zip", zip({ "scenario.json": solution })))).toBe("no-scenario");
  });

  it("rejects a solution.json that is not a response", () => {
    expect(reason(() => loadZip("a.zip", zip({ "scenario.json": request, "solution.json": { hello: 1 } })))).toBe(
      "unknown-shape",
    );
  });
});

describe("mergeSolution", () => {
  it("rejects an object that is not a response", () => {
    const base = loadText("a.json", JSON.stringify(request));
    expect(reason(() => mergeSolution(base, { hello: 1 }))).toBe("unknown-shape");
  });

  it("adds a separately loaded solution and keeps the request", () => {
    const base = loadText("a.json", JSON.stringify(request));
    const merged = mergeSolution(base, { routes: [], travelDuration: { seconds: "7" } } as Json);
    expect(merged.request).toBe(base.request);
    expect(merged.googleSolution).toEqual({ routes: [], travelDuration: "7s" });
    expect(base.googleSolution).toBeNull();
  });
});
