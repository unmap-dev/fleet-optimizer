"use client";

import { useId, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, type Lang } from "@/lib/kit/i18n";
import type { VehicleRow } from "@/lib/plan/summary";
import { TEXT } from "@/lib/text";
import { cn } from "@/lib/utils";
import { clock, shipmentName, vehicleColour, vehicleName } from "./result-format";

type Kind = VehicleRow["segments"][number]["kind"];

/**
 * How each kind of segment is drawn. The timeline is the app's one composed component (no shadcn
 * primitive draws a Gantt row), so its plain segment elements carry colour utilities here, on
 * stock tokens only: travel takes the vehicle's `--chart-N` (set inline, see `vehicleColour`), a
 * visit is `bg-primary`, a wait is `bg-muted` and a break is a dashed outline. Every other
 * component in the app passes layout-only classes to primitives.
 */
const KIND_CLASS: Record<Kind, string> = {
  travel: "",
  visit: "bg-primary",
  wait: "bg-muted border border-border",
  break: "bg-background border border-dashed border-foreground",
};

const MINUTE = 60;
/** Tick spacings to choose from, smallest first. */
const STEPS = [15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MINUTE);

/** Tick times inside [from, to], on whole multiples of a step that gives ten ticks at most. */
function ticks(from: number, to: number): number[] {
  const span = to - from;
  const step = STEPS.find((s) => span / s <= 10) ?? STEPS[STEPS.length - 1];
  const out: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(t);
  return out;
}

/** Legend swatch for one kind, drawn the way its segments are. */
function Swatch({ kind, label }: { kind: Kind; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={cn("inline-block h-3 w-4 rounded-sm", KIND_CLASS[kind])} style={kind === "travel" ? { backgroundColor: vehicleColour(0) } : undefined} />
      {label}
    </span>
  );
}

/**
 * One row per used vehicle along one shared time axis: travel, visits, waiting and breaks, each a
 * segment with a tooltip. Wide plans scroll sideways; the vehicle names stay put.
 */
export function Timeline({ rows, lang }: { rows: VehicleRow[]; lang: Lang }) {
  const t = TEXT[lang].results;
  const id = useId();
  const domain = useMemo(() => {
    let from = Infinity;
    let to = -Infinity;
    for (const row of rows) {
      from = Math.min(from, row.start ?? Infinity, ...row.segments.map((s) => s.start));
      to = Math.max(to, row.end ?? -Infinity, ...row.segments.map((s) => s.end));
    }
    return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
  }, [rows]);

  const kinds = t.kinds;
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2" data-timeline="">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          {t.timelineTitle}
        </h2>
        {(Object.keys(KIND_CLASS) as Kind[]).map((kind) => (
          <Swatch key={kind} kind={kind} label={kinds[kind]} />
        ))}
      </div>
      {domain ? (
        <div className="overflow-x-auto" role="group" aria-label={t.timelineLabel}>
          <div className="flex min-w-[640px] flex-col gap-1.5">
            <div className="flex">
              <div className="sticky left-0 w-32 flex-none bg-background" />
              <div className="relative h-4 flex-1" aria-hidden>
                {ticks(domain.from, domain.to).map((tick) => (
                  <span
                    key={tick}
                    className="absolute -translate-x-1/2 text-[10px] text-muted-foreground tabular-nums"
                    style={{ left: `${((tick - domain.from) / (domain.to - domain.from)) * 100}%` }}
                  >
                    {clock(tick)}
                  </span>
                ))}
              </div>
            </div>
            {rows.map((row) => {
              const name = vehicleName(row.vehicleIndex, row.label, lang);
              return (
                <div key={row.vehicleIndex} className="flex items-center" data-timeline-row={row.vehicleIndex}>
                  <div className="sticky left-0 z-10 w-32 flex-none truncate bg-background pr-2 text-xs" title={name}>
                    {name}
                  </div>
                  <div className="relative h-6 flex-1 rounded-sm border border-border">
                    {row.segments.map((seg, i) => {
                      const left = ((seg.start - domain.from) / (domain.to - domain.from)) * 100;
                      const width = ((seg.end - seg.start) / (domain.to - domain.from)) * 100;
                      const times = { from: clock(seg.start), to: clock(seg.end) };
                      const tip =
                        seg.kind === "visit"
                          ? format(t.visitTip, {
                              shipment: shipmentName(seg.shipmentIndex ?? 0, seg.shipmentLabel, lang),
                              action: seg.isPickup ? t.pickup : t.delivery,
                              ...times,
                            })
                          : format(t.segmentTip, { kind: kinds[seg.kind], ...times });
                      return (
                        <Tooltip key={i}>
                          <TooltipTrigger
                            aria-label={tip}
                            data-segment={seg.kind}
                            className={cn("absolute inset-y-0.5 min-w-0.5 rounded-sm", KIND_CLASS[seg.kind])}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              ...(seg.kind === "travel" ? { backgroundColor: vehicleColour(row.vehicleIndex) } : {}),
                            }}
                          />
                          <TooltipContent>{tip}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t.timelineUtc}</p>
    </section>
  );
}
