import { afterEach, describe, expect, it, vi } from "vitest";
import { capsFromEnv, overCaps } from "../lib/scenario/limits";

afterEach(() => vi.unstubAllEnvs());

function request(shipments: number, vehicles: number) {
  return { model: { shipments: Array.from({ length: shipments }, () => ({})), vehicles: Array.from({ length: vehicles }, () => ({})) } };
}

describe("capsFromEnv", () => {
  it("is empty in a clone", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_SHIPMENTS", "");
    vi.stubEnv("NEXT_PUBLIC_MAX_VEHICLES", "");
    expect(capsFromEnv()).toEqual({});
  });

  it("reads positive integers", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_SHIPMENTS", "25");
    vi.stubEnv("NEXT_PUBLIC_MAX_VEHICLES", "5");
    expect(capsFromEnv()).toEqual({ maxShipments: 25, maxVehicles: 5 });
  });

  it("ignores values that are not positive integers", () => {
    vi.stubEnv("NEXT_PUBLIC_MAX_SHIPMENTS", "0");
    vi.stubEnv("NEXT_PUBLIC_MAX_VEHICLES", "-3");
    expect(capsFromEnv()).toEqual({});
    vi.stubEnv("NEXT_PUBLIC_MAX_SHIPMENTS", "2.5");
    vi.stubEnv("NEXT_PUBLIC_MAX_VEHICLES", "many");
    expect(capsFromEnv()).toEqual({});
  });
});

describe("overCaps", () => {
  it("is over with 30 shipments against a cap of 25, and reports the counts", () => {
    expect(overCaps(request(30, 2), { maxShipments: 25, maxVehicles: 5 })).toEqual({ shipments: 30, vehicles: 2, over: true });
  });

  it("is over when only the vehicles exceed", () => {
    expect(overCaps(request(3, 6), { maxShipments: 25, maxVehicles: 5 }).over).toBe(true);
  });

  it("is not over at the cap, or with no caps", () => {
    expect(overCaps(request(25, 5), { maxShipments: 25, maxVehicles: 5 }).over).toBe(false);
    expect(overCaps(request(500, 90), {}).over).toBe(false);
  });

  it("counts zero for a request with no model", () => {
    expect(overCaps({}, { maxShipments: 1 })).toEqual({ shipments: 0, vehicles: 0, over: false });
  });
});
