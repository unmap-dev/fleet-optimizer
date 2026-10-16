import { strFromU8, unzipSync } from "fflate";
import { isRecord } from "./names";

export type Json = Record<string, unknown>;

export interface LoadedScenario {
  /** OptimizeToursRequest shape, canonicalised. Null when only a solution was given. */
  request: Json | null;
  /** OptimizeToursResponse shape, canonicalised. */
  googleSolution: Json | null;
  source: { kind: "json" | "zip" | "sample"; name: string };
}

export type ScenarioLoadReason = "unreadable" | "not-json" | "no-scenario" | "unknown-shape" | "too-large";

/**
 * The API's request limit, 4 MiB. A file or ZIP entry over it could never be sent, so it is refused
 * before it is read or inflated. Below it, parsing stays on the main thread (controller ruling: no
 * worker below 4 MiB).
 */
export const MAX_BYTES = 4 * 1024 * 1024;

export class ScenarioLoadError extends Error {
  readonly reason: ScenarioLoadReason;
  constructor(reason: ScenarioLoadReason, message: string) {
    super(message);
    this.name = "ScenarioLoadError";
    this.reason = reason;
  }
}

const DURATION_SUFFIXES = ["duration", "timeout", "delay"];

function isDurationKey(key: string): boolean {
  const lower = key.toLowerCase();
  return DURATION_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/** The one repeated duration field: `rows[].durations`, an array of durations (matrix rows). */
function isDurationListKey(key: string): boolean {
  return key.toLowerCase() === "durations";
}

const ZERO = BigInt(0);
const NANOS_PER_SECOND = BigInt(1000000000);

/** A whole number from a JSON number or an int64 string, as a BigInt; null when it is neither. */
function wholeNumber(value: unknown, fallback: bigint): bigint | null {
  if (value === undefined) return fallback;
  if (typeof value === "number") return Number.isSafeInteger(value) ? BigInt(value) : null;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

/**
 * `{seconds, nanos}` (and nothing else) as the canonical JSON duration string, or null. The string
 * is built from integers, never from a float: `{seconds:"1", nanos:500000000}` is `"1.5s"` and
 * `{nanos:1}` is `"0.000000001s"`.
 */
function durationString(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((k) => k !== "seconds" && k !== "nanos")) return null;
  const seconds = wholeNumber(value.seconds, ZERO);
  const nanos = wholeNumber(value.nanos, ZERO);
  if (seconds === null || nanos === null) return null;
  const total = seconds * NANOS_PER_SECOND + nanos;
  const abs = total < ZERO ? -total : total;
  const whole = abs / NANOS_PER_SECOND;
  const fraction = (abs % NANOS_PER_SECOND).toString().padStart(9, "0").replace(/0+$/, "");
  return `${total < ZERO ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}s`;
}

/**
 * Google's Fleet Routing app writes durations as `{ "seconds": "300" }`. The gateway wants the
 * canonical `"300s"`. Only values under duration-like keys change (and each element of a
 * `durations` array); timestamps such as `startTime: { seconds }` are left alone.
 */
export function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (!isRecord(value)) return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (isDurationListKey(key) && Array.isArray(child)) {
      out[key] = child.map((element) => durationString(element) ?? canonicalise(element));
    } else {
      const converted = isDurationKey(key) ? durationString(child) : null;
      out[key] = converted ?? canonicalise(child);
    }
  }
  return out;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ScenarioLoadError("not-json", "The file is not valid JSON.");
  }
}

function isSolution(value: Json): boolean {
  return "routes" in value || "skippedShipments" in value || "metrics" in value;
}

/** One parsed value: a request, a solution, or a wrapper holding either or both. */
function classify(value: unknown, source: LoadedScenario["source"]): LoadedScenario {
  if (!isRecord(value)) {
    throw new ScenarioLoadError("unknown-shape", "The file is not an object.");
  }
  if ("model" in value) {
    return { request: canonicalise(value) as Json, googleSolution: null, source };
  }
  if ("scenario" in value || "solution" in value) {
    const { scenario, solution } = value;
    const googleSolution = isRecord(solution) ? (canonicalise(solution) as Json) : null;
    if (scenario === undefined && googleSolution !== null) {
      return { request: null, googleSolution, source };
    }
    if (!isRecord(scenario) || !("model" in scenario)) {
      throw new ScenarioLoadError("no-scenario", "The file has no scenario with a model.");
    }
    return { request: canonicalise(scenario) as Json, googleSolution, source };
  }
  if (isSolution(value)) {
    return { request: null, googleSolution: canonicalise(value) as Json, source };
  }
  throw new ScenarioLoadError(
    "unknown-shape",
    "The file is neither an OptimizeToursRequest nor an OptimizeToursResponse.",
  );
}

/** A `.json` file: a request, a solution waiting for its request, or a `{ scenario, solution }` wrapper. */
export function loadText(name: string, text: string): LoadedScenario {
  return classify(parseJson(text), { kind: "json", name });
}

function findEntry(files: Record<string, Uint8Array>, wanted: string): Uint8Array | null {
  let best: { depth: number; bytes: Uint8Array } | null = null;
  for (const [path, bytes] of Object.entries(files)) {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "__MACOSX" || path.endsWith("/")) continue;
    if (parts[parts.length - 1]?.toLowerCase() !== wanted) continue;
    if (best === null || parts.length < best.depth) best = { depth: parts.length, bytes };
  }
  return best?.bytes ?? null;
}

/** A `.zip` with `scenario.json` (required) and `solution.json` (optional), at any depth. */
export function loadZip(name: string, bytes: Uint8Array): LoadedScenario {
  let files: Record<string, Uint8Array>;
  let oversized = false;
  try {
    // Only scenario.json and solution.json are inflated, and only when their declared size fits:
    // a ZIP with other or huge entries costs nothing to look at.
    files = unzipSync(bytes, {
      filter: (entry) => {
        const parts = entry.name.split("/").filter(Boolean);
        const base = parts[parts.length - 1]?.toLowerCase();
        if (parts[0] === "__MACOSX" || (base !== "scenario.json" && base !== "solution.json")) return false;
        if (entry.originalSize > MAX_BYTES) {
          oversized = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new ScenarioLoadError("unreadable", "The ZIP file could not be read.");
  }
  if (oversized) {
    throw new ScenarioLoadError("too-large", "A file in the ZIP is over the API's 4 MiB request limit.");
  }
  const scenarioBytes = findEntry(files, "scenario.json");
  if (scenarioBytes === null) {
    throw new ScenarioLoadError("no-scenario", "The ZIP file has no scenario.json.");
  }
  const source = { kind: "zip" as const, name };
  const loaded = classify(parseJson(strFromU8(scenarioBytes)), source);
  if (loaded.request === null) {
    throw new ScenarioLoadError("no-scenario", "scenario.json has no model.");
  }
  const solutionBytes = findEntry(files, "solution.json");
  if (solutionBytes === null) return loaded;
  const solution = parseJson(strFromU8(solutionBytes));
  if (!isRecord(solution) || !isSolution(solution)) {
    throw new ScenarioLoadError("unknown-shape", "solution.json is not an OptimizeToursResponse.");
  }
  return { ...loaded, googleSolution: canonicalise(solution) as Json };
}

/** Add a separately loaded solution.json to a scenario. */
export function mergeSolution(scenario: LoadedScenario, solution: Json): LoadedScenario {
  if (!isSolution(solution)) {
    throw new ScenarioLoadError("unknown-shape", "The file is not an OptimizeToursResponse.");
  }
  return { ...scenario, googleSolution: canonicalise(solution) as Json };
}

function isZip(name: string, bytes: Uint8Array): boolean {
  if (name.toLowerCase().endsWith(".zip")) return true;
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function loadFile(file: File): Promise<LoadedScenario> {
  if (file.size > MAX_BYTES) {
    throw new ScenarioLoadError("too-large", "The file is over the API's 4 MiB request limit.");
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new ScenarioLoadError("unreadable", "The file could not be read.");
  }
  if (isZip(file.name, bytes)) return loadZip(file.name, bytes);
  return loadText(file.name, new TextDecoder().decode(bytes));
}
