import { describe, expect, it } from "vitest";
import type { Json } from "../lib/scenario/load";
import { applySettings, defaultSettings, stopsOutsideCanada } from "../lib/scenario/settings";

function scenario(lat: number, lon: number): Json {
  return {
    model: {
      shipments: [{ deliveries: [{ arrivalLocation: { latitude: lat, longitude: lon } }] }],
      vehicles: [{ startLocation: { latitude: lat, longitude: lon }, endLocation: { latitude: lat, longitude: lon } }],
    },
  };
}

const calgary = scenario(51.05, -114.07);
const paris = scenario(48.85, 2.35);

describe("applySettings", () => {
  it("removes the geodesic fields for road travel, in either spelling", () => {
    const out = applySettings({ useGeodesicDistances: true, geodesic_meters_per_second: 8, model: {} }, { travel: "road", metersPerSecond: 10 });
    expect(out).toEqual({ model: {}, populatePolylines: true });
  });

  it("sets them for straight travel and formats the timeout", () => {
    const out = applySettings({ timeout: "5s", model: {} }, { travel: "straight", metersPerSecond: 12, timeoutSeconds: 30, searchMode: "RETURN_FAST" });
    expect(out).toEqual({ timeout: "30s", searchMode: "RETURN_FAST", useGeodesicDistances: true, geodesicMetersPerSecond: 12, model: {} });
  });

  it("keeps the request's own timeout when none is chosen, and does not mutate", () => {
    const input = { timeout: "5s", model: {} };
    const out = applySettings(input, { travel: "road", metersPerSecond: 10 });
    expect(out.timeout).toBe("5s");
    expect(input).toEqual({ timeout: "5s", model: {} });
  });

  it("replaces a snake_case search mode instead of sending both", () => {
    const out = applySettings({ model: {} }, { travel: "road", metersPerSecond: 10, timeoutSeconds: 9 });
    expect(out.timeout).toBe("9s");
    const snake = applySettings({ search_mode: "RETURN_FAST", model: {} }, { travel: "road", metersPerSecond: 10, searchMode: "CONSUME_ALL_AVAILABLE_TIME" });
    expect(snake).toEqual({ searchMode: "CONSUME_ALL_AVAILABLE_TIME", model: {}, populatePolylines: true });
  });

  it("asks for road polylines on road travel, replacing the snake_case spelling", () => {
    const out = applySettings({ populate_polylines: false, model: {} }, { travel: "road", metersPerSecond: 10 });
    expect(out).toEqual({ populatePolylines: true, model: {} });
  });

  it("leaves the file's polyline choice alone on straight travel and with the file's own matrices", () => {
    const straight = applySettings({ populatePolylines: false, model: {} }, { travel: "straight", metersPerSecond: 10 });
    expect(straight.populatePolylines).toBe(false);
    expect("populatePolylines" in applySettings({ model: {} }, { travel: "straight", metersPerSecond: 10 })).toBe(false);
    const matrices = applySettings({ model: { durationDistanceMatrices: [{ rows: [] }] } }, { travel: "road", metersPerSecond: 10 });
    expect("populatePolylines" in matrices).toBe(false);
  });

  it("drops the file's own solvingMode, in either spelling", () => {
    expect("solvingMode" in applySettings({ solvingMode: "VALIDATE_ONLY", model: {} }, { travel: "road", metersPerSecond: 10 })).toBe(false);
    expect("solving_mode" in applySettings({ solving_mode: "VALIDATE_ONLY", model: {} }, { travel: "straight", metersPerSecond: 10 })).toBe(false);
  });
});

describe("stopsOutsideCanada", () => {
  it("counts arrival, start and end coordinates", () => {
    expect(stopsOutsideCanada(paris)).toBe(3);
    expect(stopsOutsideCanada(calgary)).toBe(0);
  });

  it("reads waypoint coordinates", () => {
    const req: Json = { model: { vehicles: [{ startWaypoint: { location: { latLng: { latitude: 48.85, longitude: 2.35 } } } }] } };
    expect(stopsOutsideCanada(req)).toBe(1);
  });

  it("is zero for a request with no coordinates", () => {
    expect(stopsOutsideCanada({})).toBe(0);
  });
});

describe("stopsOutsideCanada: the border", () => {
  const outside = (lat: number, lon: number) => stopsOutsideCanada(scenario(lat, lon)) > 0;

  it("counts the contiguous United States west of Lake of the Woods as outside", () => {
    expect(outside(47.61, -122.33)).toBe(true); // Seattle
    expect(outside(44.98, -93.27)).toBe(true); // Minneapolis
    expect(outside(41.88, -87.63)).toBe(true); // Chicago
  });

  it("keeps Canadian cities inside", () => {
    expect(outside(43.65, -79.38)).toBe(false); // Toronto
    expect(outside(45.5, -73.57)).toBe(false); // Montreal
    expect(outside(44.65, -63.58)).toBe(false); // Halifax
    expect(outside(51.05, -114.07)).toBe(false); // Calgary
    expect(outside(49.28, -123.12)).toBe(false); // Vancouver
    expect(outside(48.43, -123.37)).toBe(false); // Victoria is south of the 49th parallel
    expect(outside(42.31, -83.04)).toBe(false); // Windsor
    expect(outside(46.52, -84.35)).toBe(false); // Sault Ste. Marie
    expect(outside(48.38, -89.25)).toBe(false); // Thunder Bay
  });

  it("counts departure points too", () => {
    const request: Json = {
      model: {
        shipments: [
          {
            pickups: [
              { arrivalLocation: { latitude: 51.05, longitude: -114.07 }, departureLocation: { latitude: 48.85, longitude: 2.35 } },
              {
                arrivalLocation: { latitude: 51.05, longitude: -114.07 },
                departureWaypoint: { location: { latLng: { latitude: 48.85, longitude: 2.35 } } },
              },
            ],
          },
        ],
      },
    };
    expect(stopsOutsideCanada(request)).toBe(2);
  });
});

describe("defaultSettings", () => {
  it("defaults a Calgary scenario to road", () => {
    expect(defaultSettings(calgary).travel).toBe("road");
  });

  it("defaults a Paris scenario to straight", () => {
    expect(defaultSettings(paris).travel).toBe("straight");
  });

  it("keeps straight lines and the speed a request already asks for", () => {
    expect(defaultSettings({ ...calgary, useGeodesicDistances: true, geodesicMetersPerSecond: 7 })).toEqual({ travel: "straight", metersPerSecond: 7 });
  });

  it("keeps road when the model carries matrices", () => {
    const withMatrices: Json = { model: { durationDistanceMatrices: [{ rows: [] }] } };
    expect(defaultSettings(withMatrices).travel).toBe("road");
  });
});
