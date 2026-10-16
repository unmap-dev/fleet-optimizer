import type { Json } from "./load";
import { field } from "./names";

export interface Caps {
  maxShipments?: number;
  maxVehicles?: number;
}

function positiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** The hosted build sets both; a clone sets neither. A value that is not a positive integer is ignored. */
export function capsFromEnv(): Caps {
  const caps: Caps = {};
  // Next inlines NEXT_PUBLIC_* only where they are written out in full.
  const shipments = positiveInt(process.env.NEXT_PUBLIC_MAX_SHIPMENTS);
  const vehicles = positiveInt(process.env.NEXT_PUBLIC_MAX_VEHICLES);
  if (shipments !== undefined) caps.maxShipments = shipments;
  if (vehicles !== undefined) caps.maxVehicles = vehicles;
  return caps;
}

function count(model: unknown, name: string): number {
  const list = field(model, name);
  return Array.isArray(list) ? list.length : 0;
}

/** What the scenario holds, and whether either count is past a cap. The check still runs when over. */
export function overCaps(request: Json, caps: Caps): { shipments: number; vehicles: number; over: boolean } {
  const model = field(request, "model");
  const shipments = count(model, "shipments");
  const vehicles = count(model, "vehicles");
  const over =
    (caps.maxShipments !== undefined && shipments > caps.maxShipments) ||
    (caps.maxVehicles !== undefined && vehicles > caps.maxVehicles);
  return { shipments, vehicles, over };
}
