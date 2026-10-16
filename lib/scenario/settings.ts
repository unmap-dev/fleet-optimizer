import type { Json } from "./load";
import { deleteField, field, list } from "./names";

export interface SolveSettings {
  timeoutSeconds?: number;
  searchMode?: "RETURN_FAST" | "CONSUME_ALL_AVAILABLE_TIME";
  travel: "road" | "straight";
  metersPerSecond: number;
}

/** Straight-line speed used when the request does not say, in metres per second (about 36 km/h). */
const DEFAULT_METERS_PER_SECOND = 10;

/**
 * Approximate bounding box of Canada. East of Lake of the Woods it still includes some United
 * States land (Detroit, Chicago, Boston); it is a guard against sending a Paris scenario to a road
 * network that does not cover it, not a boundary. The API answers a road request outside its graph
 * with an error, which the UI shows with a hint to use straight lines.
 */
const CANADA = { south: 41.6, north: 83.2, west: -141.1, east: -52.5 };

/** West of Lake of the Woods the border is the 49th parallel, so everything south of it is the United States. */
const BORDER = { parallel: 49, eastEnd: -95.153 };

/**
 * Further east the border runs through the Great Lakes. South of 48 N, Canada begins east of about
 * 84.9 W (Sault Ste. Marie is at 84.35 W), so Minneapolis, Duluth and Chicago fall outside. Detroit
 * and Boston stay inside the box: that stretch is left approximate.
 */
const GREAT_LAKES = { parallel: 48, westEdge: -84.9 };

/**
 * The one carve-out: southern Vancouver Island (Victoria, 48.4 N) lies south of the 49th parallel
 * but is Canadian. Bellingham and Seattle are east of this strip.
 */
const VANCOUVER_ISLAND = { south: 48.3, west: -125.5, east: -122.8 };

function insideCanada([lat, lon]: [number, number]): boolean {
  if (lat < CANADA.south || lat > CANADA.north || lon < CANADA.west || lon > CANADA.east) return false;
  if (lat < GREAT_LAKES.parallel && lon < GREAT_LAKES.westEdge) return false;
  if (lat < BORDER.parallel && lon < BORDER.eastEnd) {
    return lat >= VANCOUVER_ISLAND.south && lon >= VANCOUVER_ISLAND.west && lon <= VANCOUVER_ISLAND.east;
  }
  return true;
}

/**
 * A copy of the request with the solve settings written in. Both spellings of a field are replaced.
 *
 * - The file's own `solvingMode` is dropped: a file saved as `VALIDATE_ONLY` would otherwise be
 *   "solved" into an empty plan. The solve always runs the default mode.
 * - Road travel without the file's own matrices asks for `populatePolylines`, so the map draws the
 *   roads the plan uses rather than straight legs. Straight-line travel leaves the file's value.
 */
export function applySettings(request: Json, s: SolveSettings): Json {
  const out = structuredClone(request);
  deleteField(out, "solvingMode");
  if (s.timeoutSeconds !== undefined) {
    deleteField(out, "timeout");
    out.timeout = `${s.timeoutSeconds}s`;
  }
  if (s.searchMode !== undefined) {
    deleteField(out, "searchMode");
    out.searchMode = s.searchMode;
  }
  deleteField(out, "useGeodesicDistances");
  deleteField(out, "geodesicMetersPerSecond");
  if (s.travel === "straight") {
    out.useGeodesicDistances = true;
    out.geodesicMetersPerSecond = s.metersPerSecond;
  } else if (!usesMatrices(out)) {
    deleteField(out, "populatePolylines");
    out.populatePolylines = true;
  }
  return out;
}

function coordinates(value: unknown): [number, number] | null {
  const lat = field(value, "latitude");
  const lon = field(value, "longitude");
  return typeof lat === "number" && typeof lon === "number" ? [lat, lon] : null;
}

/** The point a stop or vehicle end is placed at: `*Location` directly, or `*Waypoint.location.latLng`. */
function pointOf(owner: unknown, locationName: string, waypointName: string): [number, number] | null {
  const direct = coordinates(field(owner, locationName));
  if (direct) return direct;
  return coordinates(field(field(field(owner, waypointName), "location"), "latLng"));
}

function stopPoints(request: Json): [number, number][] {
  const model = field(request, "model");
  const points: [number, number][] = [];
  const take = (point: [number, number] | null) => {
    if (point) points.push(point);
  };
  for (const shipment of list(field(model, "shipments"))) {
    for (const side of ["pickups", "deliveries"]) {
      for (const visit of list(field(shipment, side))) {
        take(pointOf(visit, "arrivalLocation", "arrivalWaypoint"));
        take(pointOf(visit, "departureLocation", "departureWaypoint"));
      }
    }
  }
  for (const vehicle of list(field(model, "vehicles"))) {
    take(pointOf(vehicle, "startLocation", "startWaypoint"));
    take(pointOf(vehicle, "endLocation", "endWaypoint"));
  }
  return points;
}

/** How many arrival, departure, start and end coordinates fall outside the approximate Canada box. */
export function stopsOutsideCanada(request: Json): number {
  return stopPoints(request).filter((point) => !insideCanada(point)).length;
}

/** Whether the request carries its own `model.durationDistanceMatrices`; travel then comes from them. */
export function usesMatrices(request: Json): boolean {
  return list(field(field(request, "model"), "durationDistanceMatrices")).length > 0;
}

/**
 * Road travel, unless a stop is outside Canada (the road network ends there) or the request already
 * asked for straight lines. A request with travel matrices keeps road: the matrices stand in for
 * travel and the API refuses geodesic distances beside them.
 */
export function defaultSettings(request: Json): SolveSettings {
  const speed = field(request, "geodesicMetersPerSecond");
  const metersPerSecond = typeof speed === "number" && speed >= 1 ? speed : DEFAULT_METERS_PER_SECOND;
  const straight =
    !usesMatrices(request) && (field(request, "useGeodesicDistances") === true || stopsOutsideCanada(request) > 0);
  return { travel: straight ? "straight" : "road", metersPerSecond };
}
