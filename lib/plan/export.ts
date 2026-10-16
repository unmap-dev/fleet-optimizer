import { strToU8, zipSync } from "fflate";
import type { Json } from "../scenario/load";

/** The response as pretty-printed JSON, for the download button. */
export function responseJson(response: Json): string {
  return JSON.stringify(response, null, 2);
}

/**
 * The Fleet Routing app's file pair: `scenario.json` (the request) and `solution.json` (the
 * response), and nothing else. When fields were removed to get a solve, the scenario's `label`
 * says so: `"<original label> (solved by Unmap without: a, b)"`, or just the parenthesis text
 * without the leading space when the request had no label.
 */
export function fleetRoutingZip(request: Json, response: Json, removed: string[]): Uint8Array {
  const scenario: Json = { ...request };
  if (removed.length > 0) {
    const original = typeof request.label === "string" ? request.label : "";
    const note = `(solved by Unmap without: ${removed.join(", ")})`;
    scenario.label = original === "" ? note : `${original} ${note}`;
  }
  return zipSync({
    "scenario.json": strToU8(JSON.stringify(scenario, null, 2)),
    "solution.json": strToU8(JSON.stringify(response, null, 2)),
  });
}
