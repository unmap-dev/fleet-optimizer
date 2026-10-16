import { describe, expect, it } from "vitest";
import type { Json } from "../lib/scenario/load";
import { renderPath, type FieldIssue, type FieldRef } from "../lib/scenario/report";
import { removablePaths, stripFields } from "../lib/scenario/strip";

function issue(chain: FieldRef): FieldIssue {
  return { path: renderPath(chain), fields: [chain], code: "FIELD_NOT_SUPPORTED_YET", message: "", removable: true };
}

function request(): Json {
  return {
    model: {
      transitionAttributes: [{ cost: 1 }],
      shipments: [
        { costsPerVehicle: [1] },
        { costsPerVehicle: [2] },
        { costsPerVehicle: [3] },
        { costsPerVehicle: [4], label: "four" },
      ],
      vehicles: [{ loadLimits: { k: { costPerKilometer: 1, maxLoad: 5 }, other: { costPerKilometer: 2 } } }],
    },
  };
}

describe("stripFields", () => {
  it("deletes a plain field", () => {
    const out = stripFields(request(), [issue({ name: "model", subField: { name: "transitionAttributes" } })]);
    expect(out.removed).toEqual(["model.transitionAttributes"]);
    expect("transitionAttributes" in (out.request.model as Json)).toBe(false);
  });

  it("deletes a field of one array element and no other", () => {
    const chain: FieldRef = { name: "model", subField: { name: "shipments", index: 3, subField: { name: "costsPerVehicle" } } };
    const out = stripFields(request(), [issue(chain)]);
    const shipments = (out.request.model as { shipments: Json[] }).shipments;
    expect(out.removed).toEqual(["model.shipments[3].costsPerVehicle"]);
    expect(shipments[3]).toEqual({ label: "four" });
    expect(shipments[0]).toEqual({ costsPerVehicle: [1] });
    expect(shipments[2]).toEqual({ costsPerVehicle: [3] });
  });

  it("deletes a field under one map key and leaves the sibling key", () => {
    const chain: FieldRef = {
      name: "model",
      subField: { name: "vehicles", index: 0, subField: { name: "loadLimits", key: "k", subField: { name: "costPerKilometer" } } },
    };
    const out = stripFields(request(), [issue(chain)]);
    const limits = ((out.request.model as { vehicles: Json[] }).vehicles[0] as { loadLimits: Json }).loadLimits;
    expect(out.removed).toEqual(['model.vehicles[0].loadLimits["k"].costPerKilometer']);
    expect(limits).toEqual({ k: { maxLoad: 5 }, other: { costPerKilometer: 2 } });
  });

  it("deletes a whole map entry when the key is the last link", () => {
    const chain: FieldRef = { name: "model", subField: { name: "vehicles", index: 0, subField: { name: "loadLimits", key: "other" } } };
    const out = stripFields(request(), [issue(chain)]);
    const limits = ((out.request.model as { vehicles: Json[] }).vehicles[0] as { loadLimits: Json }).loadLimits;
    expect(Object.keys(limits)).toEqual(["k"]);
  });

  it("finds a snake_case spelling of a camelCase name", () => {
    const snake = { model: { transition_attributes: [1], keep: 1 } };
    const out = stripFields(snake, [issue({ name: "model", subField: { name: "transitionAttributes" } })]);
    expect(out.request).toEqual({ model: { keep: 1 } });
    expect(out.removed).toEqual(["model.transitionAttributes"]);
  });

  it("leaves the input unchanged", () => {
    const input = request();
    const before = structuredClone(input);
    stripFields(input, [issue({ name: "model", subField: { name: "transitionAttributes" } })]);
    expect(input).toEqual(before);
  });

  it("does not report a path it did not delete, and never splices an array element", () => {
    const input = request();
    const out = stripFields(input, [
      issue({ name: "model", subField: { name: "nothing" } }),
      issue({ name: "model", subField: { name: "shipments", index: 9, subField: { name: "costsPerVehicle" } } }),
      issue({ name: "model", subField: { name: "shipments", index: 0 } }),
    ]);
    expect(out.removed).toEqual([]);
    expect(out.request).toEqual(input);
  });
});

describe("removablePaths", () => {
  it("splits the issues into what strip deletes and what it cannot, leaving the request alone", () => {
    const req = request();
    const before = JSON.stringify(req);
    const plain = issue({ name: "model", subField: { name: "transitionAttributes" } });
    const missing = issue({ name: "model", subField: { name: "nothingHere" } });
    const element = issue({ name: "model", subField: { name: "shipments", index: 1 } });
    const out = removablePaths(req, [plain, missing, element]);
    expect(out.paths).toEqual(["model.transitionAttributes"]);
    expect(out.stuck.map((i) => i.path)).toEqual(["model.nothingHere", "model.shipments[1]"]);
    expect(JSON.stringify(req)).toBe(before);
    expect(out.paths).toEqual(stripFields(req, [plain, missing, element]).removed);
  });
});
