import { describe, expect, it } from "vitest";
import { buildReport, renderPath } from "../lib/scenario/report";

// Shaped like the gateway's VALIDATE_ONLY body: an integer `code`, the string code as `displayName`,
// and `fields` as an array of FieldReference chains linked through `subField`.
const body = {
  validationErrors: [
    {
      code: 16,
      displayName: "FIELD_NOT_SUPPORTED_YET",
      fields: [{ name: "model", subField: { name: "transitionAttributes" } }],
      errorMessage: "model.transitionAttributes is not supported yet.",
    },
    {
      code: 18,
      displayName: "PLACE_ID_NOT_SUPPORTED",
      fields: [
        {
          name: "model",
          subField: {
            name: "shipments",
            index: 2,
            subField: { name: "deliveries", index: 0, subField: { name: "arrivalWaypoint", subField: { name: "placeId" } } },
          },
        },
      ],
      errorMessage: "Place IDs are not supported.",
      offendingValues: "ChIJ123",
    },
  ],
};

describe("buildReport", () => {
  it("blocks on a place ID and offers transitionAttributes for removal", () => {
    const report = buildReport(body, [{ code: "FIELD_IGNORED", field: "populateTransitionPolylines", path: "populateTransitionPolylines", count: 3, message: "ignored" }]);
    expect(report.status).toBe("blocked");
    expect(report.blocking.map((i) => i.path)).toEqual(["model.shipments[2].deliveries[0].arrivalWaypoint.placeId"]);
    expect(report.blocking[0]?.code).toBe("PLACE_ID_NOT_SUPPORTED");
    expect(report.blocking[0]?.removable).toBe(false);
    expect(report.removable.map((i) => i.path)).toEqual(["model.transitionAttributes"]);
    expect(report.removable[0]?.removable).toBe(true);
    expect(report.warnings).toEqual([{ code: "FIELD_IGNORED", field: "populateTransitionPolylines", count: 3, message: "ignored" }]);
  });

  it("is ready for an empty body", () => {
    expect(buildReport({}, [])).toEqual({ status: "ready", removable: [], blocking: [], warnings: [] });
  });

  it("needs changes when only removable fields are present", () => {
    const report = buildReport({ validationErrors: [body.validationErrors[0]] }, []);
    expect(report.status).toBe("needs-changes");
    expect(report.blocking).toEqual([]);
  });

  it("treats VALUE_NOT_SUPPORTED_YET and malformed values as blocking", () => {
    const report = buildReport(
      {
        validationErrors: [
          { code: 17, displayName: "VALUE_NOT_SUPPORTED_YET", fields: [{ name: "model" }], errorMessage: "x" },
          { code: 6, displayName: "INVALID_DURATION", fields: [{ name: "timeout" }], errorMessage: "y" },
        ],
      },
      [],
    );
    expect(report.status).toBe("blocked");
    expect(report.removable).toEqual([]);
    expect(report.blocking).toHaveLength(2);
  });

  it("counts a warning without a count once", () => {
    expect(buildReport({}, [{ code: "W", message: "m" }]).warnings).toEqual([{ code: "W", count: 1, message: "m" }]);
  });
});

describe("renderPath", () => {
  it("renders indices and map keys", () => {
    expect(
      renderPath({ name: "model", subField: { name: "vehicles", index: 0, subField: { name: "loadLimits", key: "k", subField: { name: "costPerKilometer" } } } }),
    ).toBe('model.vehicles[0].loadLimits["k"].costPerKilometer');
  });
});
