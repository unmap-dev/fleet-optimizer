import { field, isRecord, list } from "../scenario/names";
import type { Json } from "../scenario/load";
import { decodePolyline } from "./polyline";

/** The few GeoJSON shapes this app draws, defined here so lib/ needs no extra dependency. */
export type Position = [number, number];
export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}
export interface LineStringGeometry {
  type: "LineString";
  coordinates: Position[];
}
export interface PlanFeature {
  type: "Feature";
  geometry: PointGeometry | LineStringGeometry;
  properties: Record<string, string | number | boolean>;
}
export interface PlanFeatureCollection {
  type: "FeatureCollection";
  features: PlanFeature[];
}

export interface VehicleRow {
  vehicleIndex: number;
  /**
   * The request's vehicle label, else the response's `vehicleLabel`, else "". This module writes no
   * words of its own: the UI formats an empty label as "Vehicle N" in the visitor's language.
   */
  label: string;
  start?: number;
  end?: number;
  segments: {
    kind: "travel" | "visit" | "wait" | "break";
    start: number;
    end: number;
    shipmentLabel?: string;
    /** For a visit: the shipment's index in `model.shipments`, so the UI can name an unlabelled one. */
    shipmentIndex?: number;
    isPickup?: boolean;
  }[];
}

export interface PlanSummary {
  totalCost: number;
  costs: Record<string, number>;
  distanceMeters: number;
  durationSeconds: number;
  vehiclesUsed: number;
  performed: number;
  /** `reasons` are the raw GMPRO codes (the UI translates them); a reason with no code is "CODE_UNSPECIFIED". */
  skipped: { index: number; label?: string; reasons: string[] }[];
  /** One row per used route (a route with visits). Times are epoch seconds. */
  rows: VehicleRow[];
  /**
   * One LineString per used route (the decoded polyline, else straight legs through the stops),
   * a Point per visit (`vehicleIndex`, `order`, `label`, `shipmentIndex`, `isPickup`) and a Point per depot
   * (`vehicleIndex`, `label`, `kind` of "start", "end" or "depot" when both are the same place).
   */
  features: PlanFeatureCollection;
}

/** A number from a JSON number or an int64 string; anything else is 0 (proto3 leaves zeros out). */
function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Seconds from `"300s"`, `"1.5s"`, a bare number, or Google's `{ seconds, nanos }`. */
function seconds(value: unknown): number {
  if (typeof value === "string") {
    const m = /^(-?\d+(?:\.\d+)?)s$/.exec(value.trim());
    return m ? Number(m[1]) : num(value);
  }
  if (isRecord(value)) return num(value.seconds) + num(value.nanos) / 1e9;
  return num(value);
}

/** Epoch seconds from an RFC 3339 string or `{ seconds, nanos }`; undefined when absent or unreadable. */
function time(value: unknown): number | undefined {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms / 1000;
  }
  if (isRecord(value)) return num(value.seconds) + num(value.nanos) / 1e9;
  return undefined;
}

/** `{ latitude, longitude }` (or a waypoint around one) as `[lng, lat]`. */
function position(value: unknown): Position | undefined {
  if (!isRecord(value)) return undefined;
  const direct = value.latitude !== undefined && value.longitude !== undefined ? value : undefined;
  const latLng = direct ?? field(field(value, "location"), "latLng");
  if (!isRecord(latLng)) return undefined;
  const lat = Number(latLng.latitude);
  const lng = Number(latLng.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : undefined;
}

function samePlace(a: Position | undefined, b: Position | undefined): boolean {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

interface VisitRequestInfo {
  position?: Position;
  duration: number;
}

/** The pickup or delivery a visit refers to: `model.shipments[i].pickups|deliveries[j]`. */
function visitRequest(request: Json, visit: Json): VisitRequestInfo {
  const shipments = list(field(field(request, "model"), "shipments"));
  const shipment = shipments[num(field(visit, "shipmentIndex"))];
  const requests = list(field(shipment, field(visit, "isPickup") === true ? "pickups" : "deliveries"));
  const vr = requests[num(field(visit, "visitRequestIndex"))];
  if (!vr) return { duration: 0 };
  return {
    position: position(field(vr, "arrivalLocation")) ?? position(field(vr, "arrivalWaypoint")),
    duration: seconds(field(vr, "duration")),
  };
}

function vehicleDepots(request: Json, vehicleIndex: number): { start?: Position; end?: Position } {
  const vehicle = list(field(field(request, "model"), "vehicles"))[vehicleIndex];
  if (!vehicle) return {};
  return {
    start: position(field(vehicle, "startLocation")) ?? position(field(vehicle, "startWaypoint")),
    end: position(field(vehicle, "endLocation")) ?? position(field(vehicle, "endWaypoint")),
  };
}

function polylinePoints(holder: unknown): Position[] | undefined {
  const points = field(field(holder, "routePolyline"), "points");
  return typeof points === "string" && points !== "" ? decodePolyline(points) : undefined;
}

type SegmentKind = VehicleRow["segments"][number]["kind"];

interface Interval {
  start: number;
  length: number;
  used: boolean;
}

/** `route.breaks[]`: each break's own start and duration. Empty when the response lists none. */
function routeBreaks(route: Json): Interval[] {
  return list(field(route, "breaks"))
    .map((b) => ({ start: time(field(b, "startTime")), length: seconds(field(b, "duration")), used: false }))
    .filter((b): b is Interval => b.start !== undefined && b.length > 0);
}

/**
 * Segments of one route, in time order. A route with n visits has n + 1 transitions (start to the
 * first visit, ..., last visit to the end).
 *
 * A transition is laid out from its `startTime` (or from where the previous segment ended): travel,
 * then wait. `delayDuration` is folded into travel, because the plan has no separate kind for it.
 * Breaks are drawn at the exact `startTime` and `duration` of `route.breaks[]` when the response has
 * any; the travel and wait around a break are split so nothing overlaps it. Without `route.breaks`,
 * the transition's own `breakDuration` is drawn after its wait. Each visit runs from its `startTime`
 * for the duration of the pickup or delivery it performs. Zero-length pieces are left out.
 */
function routeSegments(request: Json, route: Json): VehicleRow["segments"] {
  const visits = list(field(route, "visits"));
  const transitions = list(field(route, "transitions"));
  const breaks = routeBreaks(route);
  const explicitBreaks = breaks.length > 0;
  const segments: VehicleRow["segments"] = [];
  let cursor = time(field(route, "vehicleStartTime"));

  const push = (kind: SegmentKind, start: number, length: number, extra: object = {}) => {
    if (length <= 0) return;
    segments.push({ kind, start, end: start + length, ...extra });
  };

  const pushTransition = (t: Json | undefined) => {
    if (!t) return;
    let at = time(field(t, "startTime")) ?? cursor;
    if (at === undefined) return;
    const travel = seconds(field(t, "travelDuration")) + seconds(field(t, "delayDuration"));
    const wait = seconds(field(t, "waitDuration"));
    const ownBreak = explicitBreaks ? 0 : seconds(field(t, "breakDuration"));
    const window = travel + wait + ownBreak;
    // Breaks that begin inside this transition's window are taken here, once.
    const inside = breaks.filter((b) => !b.used && b.start >= at! && b.start <= at! + window);
    for (const b of inside) b.used = true;
    inside.sort((x, y) => x.start - y.start);

    for (const [kind, total] of [["travel", travel], ["wait", wait]] as const) {
      let remaining = total;
      while (remaining > 0) {
        const next = inside[0];
        if (next && next.start < at + remaining) {
          push(kind, at, next.start - at);
          remaining -= Math.max(0, next.start - at);
          push("break", next.start, next.length);
          at = next.start + next.length;
          inside.shift();
        } else {
          push(kind, at, remaining);
          at += remaining;
          remaining = 0;
        }
      }
    }
    for (const b of inside) {
      push("break", b.start, b.length);
      at = Math.max(at, b.start + b.length);
    }
    push("break", at, ownBreak);
    cursor = at + ownBreak;
  };

  for (let i = 0; i < visits.length; i += 1) {
    pushTransition(transitions[i]);
    const visit = visits[i];
    const start = time(field(visit, "startTime")) ?? cursor;
    if (start === undefined) continue;
    const length = visitRequest(request, visit).duration;
    const label = shipmentLabel(request, visit);
    push("visit", start, length, {
      ...(label === "" ? {} : { shipmentLabel: label }),
      shipmentIndex: num(field(visit, "shipmentIndex")),
      isPickup: field(visit, "isPickup") === true,
    });
    cursor = start + length;
  }
  pushTransition(transitions[visits.length]);
  // Any break the transitions did not reach (a break at the very end, say) is still drawn.
  for (const b of breaks) if (!b.used) push("break", b.start, b.length);
  return segments.sort((x, y) => x.start - y.start || x.end - y.end);
}

/** Shipment label for a visit: the response's own, else the request's, else "". */
function shipmentLabel(request: Json, visit: Json): string {
  const own = field(visit, "shipmentLabel");
  if (typeof own === "string" && own !== "") return own;
  const shipment = list(field(field(request, "model"), "shipments"))[num(field(visit, "shipmentIndex"))];
  const label = field(shipment, "label");
  return typeof label === "string" ? label : "";
}

/** Vehicle label: the request's, else the response's, else "". */
function vehicleLabelOf(request: Json, route: Json, vehicleIndex: number): string {
  const vehicle = list(field(field(request, "model"), "vehicles"))[vehicleIndex];
  const fromRequest = field(vehicle, "label");
  if (typeof fromRequest === "string" && fromRequest !== "") return fromRequest;
  const fromResponse = field(route, "vehicleLabel");
  return typeof fromResponse === "string" ? fromResponse : "";
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Reads a GMPRO `OptimizeToursResponse` (either key spelling) against the request that produced it. */
export function summarisePlan(request: Json, response: Json): PlanSummary {
  const routes = list(field(response, "routes")).filter((r) => list(r.visits).length > 0);
  const metrics = field(response, "metrics");
  const aggregate = field(metrics, "aggregatedRouteMetrics");

  const rows: VehicleRow[] = [];
  const features: PlanFeature[] = [];
  const shipmentsDone = new Set<number>();
  let routeDistance = 0;
  let routeDuration = 0;

  for (const route of routes) {
    const vehicleIndex = num(field(route, "vehicleIndex"));
    const label = vehicleLabelOf(request, route, vehicleIndex);
    const visits = list(field(route, "visits"));
    const transitions = list(field(route, "transitions"));
    const start = time(field(route, "vehicleStartTime"));
    const end = time(field(route, "vehicleEndTime"));

    rows.push({
      vehicleIndex,
      label,
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
      segments: routeSegments(request, route),
    });

    // Totals that fall back to this route's own numbers when the response has no aggregate.
    const routeMetrics = field(route, "metrics");
    routeDistance += isRecord(routeMetrics) && field(routeMetrics, "travelDistanceMeters") !== undefined
      ? num(field(routeMetrics, "travelDistanceMeters"))
      : sum(transitions.map((t) => num(field(t, "travelDistanceMeters"))));
    routeDuration += isRecord(routeMetrics) && field(routeMetrics, "totalDuration") !== undefined
      ? seconds(field(routeMetrics, "totalDuration"))
      : start !== undefined && end !== undefined
        ? end - start
        : sum(transitions.map((t) => seconds(field(t, "totalDuration"))));

    // Nodes in travel order: start depot, visits, end depot. Transition i joins node i to node i + 1,
    // so a node with no known place stays in the list as undefined to keep the legs aligned.
    const depots = vehicleDepots(request, vehicleIndex);
    const nodes: (Position | undefined)[] = [depots.start];
    visits.forEach((visit, order) => {
      shipmentsDone.add(num(field(visit, "shipmentIndex")));
      const at = visitRequest(request, visit).position;
      nodes.push(at);
      if (!at) return;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: at },
        properties: {
          vehicleIndex,
          order: order + 1,
          label: shipmentLabel(request, visit),
          shipmentIndex: num(field(visit, "shipmentIndex")),
          isPickup: field(visit, "isPickup") === true,
        },
      });
    });
    nodes.push(depots.end);

    if (samePlace(depots.start, depots.end)) {
      features.push(depotFeature(vehicleIndex, label, "depot", depots.start as Position));
    } else {
      if (depots.start) features.push(depotFeature(vehicleIndex, label, "start", depots.start));
      if (depots.end) features.push(depotFeature(vehicleIndex, label, "end", depots.end));
    }

    const line = routeLine(route, transitions, nodes);
    if (line.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line },
        properties: { vehicleIndex, label },
      });
    }
  }

  const costs: Record<string, number> = {};
  const rawCosts = field(metrics, "costs");
  if (isRecord(rawCosts)) for (const [k, v] of Object.entries(rawCosts)) costs[k] = num(v);

  const routeCostSum = sum(list(field(response, "routes")).map((r) => num(field(r, "routeTotalCost"))));
  const hasAggregate = isRecord(aggregate);
  const skippedRaw = list(field(response, "skippedShipments"));

  return {
    totalCost: isRecord(metrics) && field(metrics, "totalCost") !== undefined ? num(field(metrics, "totalCost")) : routeCostSum,
    costs,
    distanceMeters:
      hasAggregate && field(aggregate, "travelDistanceMeters") !== undefined
        ? num(field(aggregate, "travelDistanceMeters"))
        : routeDistance,
    durationSeconds:
      hasAggregate && field(aggregate, "totalDuration") !== undefined
        ? seconds(field(aggregate, "totalDuration"))
        : routeDuration,
    vehiclesUsed:
      isRecord(metrics) && field(metrics, "usedVehicleCount") !== undefined
        ? num(field(metrics, "usedVehicleCount"))
        : routes.length,
    performed:
      hasAggregate && field(aggregate, "performedShipmentCount") !== undefined
        ? num(field(aggregate, "performedShipmentCount"))
        : shipmentsDone.size,
    skipped: skippedRaw.map((s) => {
      const label = field(s, "label");
      return {
        index: num(field(s, "index")),
        ...(typeof label === "string" && label !== "" ? { label } : {}),
        reasons: list(field(s, "reasons")).map((r) => String(field(r, "code") ?? "CODE_UNSPECIFIED")),
      };
    }),
    rows,
    features: { type: "FeatureCollection", features },
  };
}

function depotFeature(vehicleIndex: number, label: string, kind: "start" | "end" | "depot", at: Position): PlanFeature {
  return { type: "Feature", geometry: { type: "Point", coordinates: at }, properties: { vehicleIndex, label, kind } };
}

/**
 * The line to draw for one route: the route's own polyline if it has one; else, leg by leg, each
 * transition's polyline where it has one and a straight segment between its two nodes where it
 * does not (and both nodes have a place). `nodes` is start depot, visits, end depot, so a vehicle
 * with no end location still has all its legs. If the transitions do not match the nodes (one per
 * leg), the line is straight through the nodes that have a place.
 */
function routeLine(route: Json, transitions: Json[], nodes: (Position | undefined)[]): Position[] {
  const whole = polylinePoints(route);
  if (whole && whole.length >= 2) return whole;
  const stops = nodes.filter((n): n is Position => n !== undefined);
  if (transitions.length !== nodes.length - 1) return stops;
  const line: Position[] = [];
  const append = (points: Position[]) => {
    for (const p of points) {
      const last = line[line.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) line.push(p);
    }
  };
  for (let i = 0; i < transitions.length; i += 1) {
    const encoded = polylinePoints(transitions[i]);
    if (encoded) append(encoded);
    else {
      const from = nodes[i];
      const to = nodes[i + 1];
      if (from && to) append([from, to]);
    }
  }
  return line;
}
