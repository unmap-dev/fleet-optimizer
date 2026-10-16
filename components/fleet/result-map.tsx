"use client";

import { useEffect, useMemo } from "react";
import { WarehouseIcon } from "lucide-react";
import { Map } from "@/components/ui/map";
import { Marker, Popup } from "@/components/ui/marker-popup";
import { RouteLine } from "@/components/ui/route-line";
import { API_KEY, GATEWAY } from "@/lib/kit/config";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { chartRamp } from "@/lib/map-layers";
import { useMap, useMapGeneration } from "@/lib/map-context";
import type { PlanSummary, Position } from "@/lib/plan/summary";
import { TEXT } from "@/lib/text";
import { shipmentName, vehicleColour, vehicleName } from "./result-format";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Frames every route, stop and depot once per plan. */
function Camera({ points }: { points: readonly Position[] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (!map || points.length === 0) return;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [lng, lat] of points) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    map.fitBounds([[w, s], [e, n]], { padding: 48, maxZoom: 14, duration: reduceMotion() ? 0 : 600 });
    // Fit once per set of places, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

interface Line {
  vehicleIndex: number;
  coordinates: Position[];
}

/**
 * One line per vehicle in the theme's `--chart-1..5`, cycled by vehicle index. MapLibre paint needs
 * concrete colours, so the tokens are resolved on the map (and again after each style swap).
 */
function Routes({ lines }: { lines: Line[] }) {
  const map = useMap();
  const generation = useMapGeneration();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `generation`: tokens are read afresh per style load.
  const ramp = useMemo(() => chartRamp(map), [map, generation]);
  return (
    <>
      {lines.map((line) => (
        <RouteLine
          key={line.vehicleIndex}
          id={`fleet-route-${line.vehicleIndex}`}
          coordinates={line.coordinates}
          color={ramp[line.vehicleIndex % ramp.length]}
        />
      ))}
    </>
  );
}

/**
 * The plan on the registry map: a line per used vehicle (the road polyline, or straight legs
 * between stops), a numbered pin per visit and a pin per depot, each in its vehicle's colour, with
 * a popup that names the vehicle, the stop and the shipment.
 */
export function ResultMap({ summary, lang }: { summary: PlanSummary; lang: Lang }) {
  const t = TEXT[lang].results;
  const labels = useMemo(() => new globalThis.Map(summary.rows.map((r) => [r.vehicleIndex, r.label])), [summary]);
  const { lines, stops, depots, points } = useMemo(() => {
    const lines: Line[] = [];
    const stops: { key: string; at: Position; vehicleIndex: number; order: number; label: string; shipmentIndex: number; isPickup: boolean }[] = [];
    const depots: { key: string; at: Position; vehicleIndex: number; kind: "start" | "end" | "depot" }[] = [];
    const points: Position[] = [];
    summary.features.features.forEach((f, i) => {
      const p = f.properties;
      const vehicleIndex = Number(p.vehicleIndex);
      if (f.geometry.type === "LineString") {
        lines.push({ vehicleIndex, coordinates: f.geometry.coordinates });
        points.push(...f.geometry.coordinates);
        return;
      }
      const at = f.geometry.coordinates;
      points.push(at);
      if (typeof p.kind === "string") {
        depots.push({ key: `d${i}`, at, vehicleIndex, kind: p.kind as "start" | "end" | "depot" });
      } else {
        stops.push({
          key: `s${i}`,
          at,
          vehicleIndex,
          order: Number(p.order),
          label: String(p.label ?? ""),
          shipmentIndex: Number(p.shipmentIndex ?? 0),
          isPickup: p.isPickup === true,
        });
      }
    });
    return { lines, stops, depots, points };
  }, [summary]);

  return (
    <div role="region" aria-label={t.mapLabel} className="relative h-[45dvh] min-h-72" data-result-map="">
      <Map apiKey={API_KEY} gateway={GATEWAY} style="base" lang={lang} center={[-96, 56]} zoom={3} containerStyle={{ position: "absolute", inset: 0, minHeight: 0 }}>
        <Camera points={points} />
        <Routes lines={lines} />
        {depots.map((d) => {
          const vehicle = vehicleName(d.vehicleIndex, labels.get(d.vehicleIndex), lang);
          const tip = format(t.depotTip, { vehicle, kind: t.depot[d.kind] });
          return (
            <Marker
              key={d.key}
              lngLat={d.at}
              markerContent={
                <span
                  aria-label={tip}
                  data-depot-pin={d.kind}
                  className="flex size-7 items-center justify-center rounded-md border-2 bg-foreground text-background shadow-md"
                  style={{ borderColor: vehicleColour(d.vehicleIndex) }}
                >
                  <WarehouseIcon className="size-4" aria-hidden />
                </span>
              }
            >
              <Popup>
                <p className="text-sm">{tip}</p>
              </Popup>
            </Marker>
          );
        })}
        {stops.map((s) => {
          const vehicle = vehicleName(s.vehicleIndex, labels.get(s.vehicleIndex), lang);
          const tip = format(t.stopTip, {
            vehicle,
            n: formatNumber(s.order, lang),
            shipment: shipmentName(s.shipmentIndex, s.label, lang),
            action: s.isPickup ? t.pickup : t.delivery,
          });
          return (
            <Marker
              key={s.key}
              lngLat={s.at}
              markerContent={
                <span
                  aria-label={tip}
                  data-stop-pin={s.order}
                  className="flex size-6 items-center justify-center rounded-full border-2 bg-background font-sans text-[11px] font-semibold text-foreground shadow-md tabular-nums"
                  style={{ borderColor: vehicleColour(s.vehicleIndex) }}
                >
                  {s.order}
                </span>
              }
            >
              <Popup>
                <p className="text-sm">{tip}</p>
              </Popup>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
