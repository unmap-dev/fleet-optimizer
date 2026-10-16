import { describe, expect, it } from "vitest";
import type { Json } from "../lib/scenario/load";
import { summarisePlan } from "../lib/plan/summary";
import { request, response, T0, visit } from "./fixtures/courier-plan";

describe("summarisePlan", () => {
  const plan = summarisePlan(request(), response());

  it("takes the totals from the response metrics", () => {
    expect(plan.totalCost).toBe(45);
    expect(plan.costs).toEqual({ "model.vehicles.cost_per_hour": 20, "model.vehicles.cost_per_kilometer": 5.5 });
    expect(plan.distanceMeters).toBe(11000);
    expect(plan.durationSeconds).toBe(4560);
    expect(plan.vehiclesUsed).toBe(2);
    expect(plan.performed).toBe(3);
  });

  it("lists the skipped shipment with its reason codes", () => {
    expect(plan.skipped).toEqual([{ index: 3, label: "order-304", reasons: ["NO_VEHICLE"] }]);
  });

  it("makes a row for each route with visits and none for an empty route", () => {
    expect(plan.rows.map((r) => [r.vehicleIndex, r.label])).toEqual([
      [0, "courier-1"],
      [1, "courier-2"],
    ]);
    expect(plan.rows[0].start).toBe(T0);
    expect(plan.rows[0].end).toBe(T0 + 2760);
    // Google's {seconds} timestamps read the same as RFC 3339.
    expect(plan.rows[1].start).toBe(T0);
    expect(plan.rows[1].end).toBe(T0 + 1800);
  });

  it("orders segments in time: travel, wait, visit, travel, visit, ...", () => {
    const row = plan.rows[0];
    expect(row.segments.slice(0, 5).map((s) => [s.kind, s.start - T0, s.end - T0])).toEqual([
      ["travel", 0, 240],
      ["wait", 240, 300],
      ["visit", 300, 480], // order-301 pickup, 180 s from the request
      ["travel", 480, 1080],
      ["visit", 1200, 1440], // delivery, 240 s
    ]);
    expect(row.segments[2]).toMatchObject({ shipmentLabel: "order-301", isPickup: true });
    expect(row.segments[4]).toMatchObject({ shipmentLabel: "order-301", isPickup: false });
    const starts = row.segments.map((s) => s.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("places a break after the travel of its transition", () => {
    const last = plan.rows[0].segments.slice(-2);
    expect(last.map((s) => s.kind)).toEqual(["travel", "break"]);
    expect(last[1].end - last[1].start).toBe(300);
  });

  it("draws one line per used route, a point per visit and a point per depot", () => {
    const features = plan.features.features;
    expect(features.filter((f) => f.geometry.type === "LineString")).toHaveLength(2);
    const visits = features.filter((f) => f.geometry.type === "Point" && "order" in f.properties);
    expect(visits).toHaveLength(6);
    const depots = features.filter((f) => f.geometry.type === "Point" && "kind" in f.properties);
    expect(depots).toHaveLength(2);
    expect(depots[0].properties).toMatchObject({ kind: "depot", vehicleIndex: 0 });
    expect(depots[0].geometry).toEqual({ type: "Point", coordinates: [-73.57, 45.5] });
  });

  it("puts visit points at the request's [lng, lat] with order, label and pickup flag", () => {
    const first = plan.features.features.find((f) => f.properties.order === 1 && f.properties.vehicleIndex === 0);
    expect(first?.geometry).toEqual({ type: "Point", coordinates: [-73.58, 45.522] });
    expect(first?.properties).toMatchObject({ label: "order-301", isPickup: true });
    const second = plan.features.features.find((f) => f.properties.order === 2 && f.properties.vehicleIndex === 0);
    expect(second?.geometry).toEqual({ type: "Point", coordinates: [-73.554, 45.507] });
    expect(second?.properties.isPickup).toBe(false);
  });

  it("falls back to straight legs through depot and visits when there is no polyline", () => {
    const line = plan.features.features.find((f) => f.geometry.type === "LineString" && f.properties.vehicleIndex === 1);
    const coords = (line?.geometry as { coordinates: number[][] }).coordinates;
    expect(coords).toHaveLength(4);
    expect(coords[0]).toEqual([-73.57, 45.5]);
    expect(coords[3]).toEqual([-73.57, 45.5]);
  });

  it("uses the route polyline when the response carries one", () => {
    const res = response();
    (res.routes as Json[])[0].routePolyline = { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" };
    const line = summarisePlan(request(), res).features.features.find(
      (f) => f.geometry.type === "LineString" && f.properties.vehicleIndex === 0,
    );
    expect((line?.geometry as { coordinates: number[][] }).coordinates).toHaveLength(3);
  });

  it("joins transition polylines, with a straight leg where one is missing", () => {
    const res = response();
    const route = (res.routes as Json[])[1];
    const transitions = route.transitions as Json[];
    transitions[0].routePolyline = { points: "_p~iF~ps|U_ulLnnqC" }; // two points
    const out = summarisePlan(request(), res).features.features.find(
      (f) => f.geometry.type === "LineString" && f.properties.vehicleIndex === 1,
    );
    // 2 (polyline) + 2 (visit 1 to visit 2) + 1 (visit 2 to depot): a shared join point is not repeated.
    expect((out?.geometry as { coordinates: number[][] }).coordinates).toHaveLength(5);
  });

  it("sums the route numbers when the response has no aggregate metrics", () => {
    const res = response();
    delete res.metrics;
    for (const r of res.routes as Json[]) delete r.metrics;
    const bare = summarisePlan(request(), res);
    expect(bare.distanceMeters).toBe(2000 + 5000 + 400 + 300 + 100 + 1500 + 900 + 800);
    expect(bare.durationSeconds).toBe(2760 + 1800);
    expect(bare.vehiclesUsed).toBe(2);
    expect(bare.performed).toBe(3);
    expect(bare.totalCost).toBe(45);
  });

  it("reads snake_case keys", () => {
    const res: Json = {
      routes: [
        {
          vehicle_index: 1,
          visits: [{ shipment_index: 2, is_pickup: true, start_time: "2026-10-13T13:05:00Z" }],
          transitions: [],
        },
      ],
      metrics: { used_vehicle_count: 1, total_cost: 3 },
    };
    const p = summarisePlan(request(), res);
    expect(p.rows[0].vehicleIndex).toBe(1);
    expect(p.totalCost).toBe(3);
    expect(p.features.features.find((f) => f.properties.order === 1)?.geometry).toEqual({
      type: "Point",
      coordinates: [-73.585, 45.543],
    });
  });

  it("reads a skipped shipment that omits its index as shipment 0, keeping the raw reason code", () => {
    const p = summarisePlan(request(), { skippedShipments: [{ reasons: [{ code: "NO_VEHICLE" }, {}] }] });
    expect(p.skipped).toEqual([{ index: 0, reasons: ["NO_VEHICLE", "CODE_UNSPECIFIED"] }]);
  });

  it("reads a transition startTime in {seconds} form", () => {
    const res: Json = {
      routes: [
        {
          vehicleStartTime: "2026-10-13T13:00:00Z",
          visits: [visit(0, true, "2026-10-13T13:05:00Z", "order-301")],
          transitions: [{ travelDuration: "100s", startTime: { seconds: String(T0 + 60) } }, {}],
        },
      ],
    };
    const first = summarisePlan(request(), res).rows[0].segments[0];
    expect(first).toMatchObject({ kind: "travel", start: T0 + 60, end: T0 + 160 });
  });

  it("draws breaks from route.breaks and splits the travel around them", () => {
    const res: Json = {
      routes: [
        {
          vehicleStartTime: "2026-10-13T13:00:00Z",
          visits: [visit(0, true, "2026-10-13T13:20:00Z", "order-301")],
          breaks: [{ startTime: "2026-10-13T13:00:00Z", duration: "300s" }],
          transitions: [{ travelDuration: "600s", breakDuration: "300s", startTime: "2026-10-13T13:00:00Z" }, {}],
        },
      ],
    };
    const segs = summarisePlan(request(), res).rows[0].segments;
    expect(segs.slice(0, 2).map((s) => [s.kind, s.start - T0, s.end - T0])).toEqual([
      ["break", 0, 300],
      ["travel", 300, 900],
    ]);
    expect(segs.filter((s) => s.kind === "break")).toHaveLength(1);
  });

  it("folds delay into travel", () => {
    const res: Json = {
      routes: [
        {
          vehicleStartTime: "2026-10-13T13:00:00Z",
          visits: [visit(0, true, "2026-10-13T13:10:00Z", "order-301")],
          transitions: [{ travelDuration: "100s", delayDuration: "20s", startTime: "2026-10-13T13:00:00Z" }, {}],
        },
      ],
    };
    expect(summarisePlan(request(), res).rows[0].segments[0]).toMatchObject({ kind: "travel", start: T0, end: T0 + 120 });
  });

  it("keeps per-leg polylines for a vehicle with no end location", () => {
    const req = request();
    const vehicle = ((req.model as Json).vehicles as Json[])[0];
    delete vehicle.endLocation;
    const res: Json = {
      routes: [
        {
          visits: [visit(0, true, "2026-10-13T13:05:00Z", "order-301")],
          transitions: [
            { routePolyline: { points: "_p~iF~ps|U_ulLnnqC" } },
            { routePolyline: { points: "_mqNvxq`@_ulLnnqC" } },
          ],
        },
      ],
    };
    const line = summarisePlan(req, res).features.features.find((f) => f.geometry.type === "LineString");
    // Leg 1 ends at [-120.95, 40.7]; leg 2 starts at [-126.453, 43.252], so both are kept whole.
    expect((line?.geometry as { coordinates: number[][] }).coordinates).toHaveLength(4);
  });

  it("leaves labels empty rather than writing English words", () => {
    const req = request();
    const vehicle = ((req.model as Json).vehicles as Json[])[1];
    delete vehicle.label;
    ((req.model as Json).shipments as Json[])[2].label = "";
    const res: Json = {
      routes: [{ vehicleIndex: 1, visits: [{ shipmentIndex: 2, startTime: "2026-10-13T13:05:00Z" }], transitions: [] }],
    };
    const p = summarisePlan(req, res);
    expect(p.rows[0].label).toBe("");
    expect(p.features.features.find((f) => f.properties.order === 1)?.properties.label).toBe("");
  });

  it("uses the request's vehicle label before the response's", () => {
    const res: Json = {
      routes: [{ vehicleLabel: "other", visits: [visit(0, true, "2026-10-13T13:05:00Z", "order-301")], transitions: [] }],
    };
    expect(summarisePlan(request(), res).rows[0].label).toBe("courier-1");
  });

  it("treats an empty response as an empty plan", () => {
    const p = summarisePlan(request(), {});
    expect(p).toMatchObject({ totalCost: 0, distanceMeters: 0, durationSeconds: 0, vehiclesUsed: 0, performed: 0, skipped: [], rows: [] });
    expect(p.features.features).toEqual([]);
  });
});
