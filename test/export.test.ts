import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { fleetRoutingZip, responseJson } from "../lib/plan/export";
import type { Json } from "../lib/scenario/load";

const response: Json = { routes: [{ vehicleIndex: 1 }], metrics: { totalCost: 3 } };

function unzip(bytes: Uint8Array): Record<string, Json> {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, JSON.parse(strFromU8(data)) as Json]));
}

describe("responseJson", () => {
  it("is the response, pretty-printed", () => {
    expect(JSON.parse(responseJson(response))).toEqual(response);
    expect(responseJson(response)).toContain("\n");
  });
});

describe("fleetRoutingZip", () => {
  it("holds scenario.json and solution.json and nothing else", () => {
    const request: Json = { label: "Montreal", model: { shipments: [] } };
    const files = unzip(fleetRoutingZip(request, response, []));
    expect(Object.keys(files).sort()).toEqual(["scenario.json", "solution.json"]);
    expect(files["scenario.json"]).toEqual(request);
    expect(files["solution.json"]).toEqual(response);
  });

  it("labels the scenario with the removed fields, keeping the original label", () => {
    const request: Json = { label: "Montreal", model: {} };
    const files = unzip(fleetRoutingZip(request, response, ["model.a", "model.b[1].c"]));
    expect(files["scenario.json"].label).toBe("Montreal (solved by Unmap without: model.a, model.b[1].c)");
    expect(files["scenario.json"].model).toEqual({});
    expect(request.label).toBe("Montreal");
  });

  it("labels a scenario that had no label", () => {
    const files = unzip(fleetRoutingZip({ model: {} }, response, ["model.a"]));
    expect(files["scenario.json"].label).toBe("(solved by Unmap without: model.a)");
  });
});
