import type { Json } from "../../lib/scenario/load";
import { loadSample } from "../../lib/scenario/samples";

/**
 * The plan fixture shared by the summary and results tests: the courier sample's request and a
 * hand-written response with two used routes, an empty route and one skipped shipment.
 */
export const T0 = Date.parse("2026-10-13T13:00:00Z") / 1000;

export function request(): Json {
  const loaded = loadSample("pickup-delivery-courier");
  if (!loaded?.request) throw new Error("sample missing");
  return loaded.request;
}

export function visit(shipmentIndex: number, isPickup: boolean, startTime: string, shipmentLabel: string): Json {
  // proto3 JSON leaves out zeros: no shipmentIndex 0, no isPickup false, no visitRequestIndex.
  return {
    ...(shipmentIndex === 0 ? {} : { shipmentIndex }),
    ...(isPickup ? { isPickup: true } : {}),
    startTime,
    shipmentLabel,
  };
}

/** Two used routes, one skipped shipment; the polyline on route 1 is Google's documented example. */
export function response(): Json {
  return {
    routes: [
      {
        vehicleLabel: "courier-1",
        vehicleStartTime: "2026-10-13T13:00:00Z",
        vehicleEndTime: "2026-10-13T13:46:00Z",
        visits: [
          visit(0, true, "2026-10-13T13:05:00Z", "order-301"),
          visit(0, false, "2026-10-13T13:20:00Z", "order-301"),
          visit(1, true, "2026-10-13T13:25:00Z", "order-302"),
          visit(1, false, "2026-10-13T13:35:00Z", "order-302"),
        ],
        transitions: [
          { travelDuration: "240s", waitDuration: "60s", startTime: "2026-10-13T13:00:00Z", travelDistanceMeters: 2000 },
          { travelDuration: "600s", startTime: "2026-10-13T13:08:00Z", travelDistanceMeters: 5000 },
          { travelDuration: "60s", startTime: "2026-10-13T13:24:00Z", travelDistanceMeters: 400 },
          { travelDuration: "30s", startTime: "2026-10-13T13:28:00Z", travelDistanceMeters: 300 },
          { travelDuration: "120s", breakDuration: "300s", startTime: "2026-10-13T13:39:00Z", travelDistanceMeters: 100 },
        ],
        metrics: { performedShipmentCount: 2, travelDistanceMeters: 7800, totalDuration: "2760s" },
        routeTotalCost: 30.5,
      },
      {
        vehicleIndex: 1,
        vehicleLabel: "courier-2",
        vehicleStartTime: { seconds: String(T0) },
        vehicleEndTime: { seconds: String(T0 + 1800) },
        visits: [visit(2, true, "2026-10-13T13:05:00Z", "order-303"), visit(2, false, "2026-10-13T13:15:00Z", "order-303")],
        transitions: [
          { travelDuration: "200s", startTime: "2026-10-13T13:00:00Z", travelDistanceMeters: 1500 },
          { travelDuration: "100s", startTime: "2026-10-13T13:09:00Z", travelDistanceMeters: 900 },
          { travelDuration: "100s", startTime: "2026-10-13T13:19:00Z", travelDistanceMeters: 800 },
        ],
        metrics: { performedShipmentCount: 1, travelDistanceMeters: 3200, totalDuration: "1800s" },
        routeTotalCost: 14.5,
      },
      { vehicleIndex: 2, vehicleLabel: "courier-3" },
    ],
    skippedShipments: [{ index: 3, label: "order-304", reasons: [{ code: "NO_VEHICLE" }] }],
    metrics: {
      aggregatedRouteMetrics: { performedShipmentCount: 3, travelDistanceMeters: 11000, totalDuration: "4560s" },
      usedVehicleCount: 2,
      costs: { "model.vehicles.cost_per_hour": 20, "model.vehicles.cost_per_kilometer": 5.5 },
      totalCost: 45,
    },
  };
}
