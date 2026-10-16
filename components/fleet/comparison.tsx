"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistance, formatDuration, formatNumber, type Lang } from "@/lib/kit/i18n";
import { comparePlans, type ComparisonMetric } from "@/lib/plan/compare";
import type { PlanSummary } from "@/lib/plan/summary";
import { TEXT } from "@/lib/text";
import { formatCost } from "./result-format";

function metricLabel(metric: ComparisonMetric, lang: Lang): string {
  const t = TEXT[lang].results;
  const labels: Record<ComparisonMetric, string> = {
    totalCost: t.totalCost,
    distanceMeters: t.distance,
    durationSeconds: t.duration,
    vehiclesUsed: t.vehiclesUsed,
    performed: t.performed,
    skipped: t.skipped,
  };
  return labels[metric];
}

function metricValue(metric: ComparisonMetric, value: number, lang: Lang): string {
  if (metric === "totalCost") return formatCost(value, lang);
  if (metric === "distanceMeters") return formatDistance(value, lang);
  if (metric === "durationSeconds") return formatDuration(value, lang);
  return formatNumber(value, lang);
}

/**
 * Unmap's plan beside the loaded solution.json: the numbers only, with the reason they are not a
 * verdict (the two used different travel times). Shown only when a solution.json was loaded.
 */
export function Comparison({ unmap, google, removed, lang }: { unmap: PlanSummary; google: PlanSummary; removed: string[]; lang: Lang }) {
  const t = TEXT[lang].results;
  const comparison = useMemo(() => comparePlans(unmap, google), [unmap, google]);
  return (
    <Card data-comparison="">
      <CardHeader>
        <CardTitle>{t.compareTitle}</CardTitle>
        <CardDescription>{t.compareNote}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {removed.length > 0 ? (
          <p className="text-sm" data-compare-without="">
            {format(TEXT[lang].report.solvedWithout, { paths: removed.join(", ") })}
          </p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.compareMeasure}</TableHead>
              <TableHead className="text-right">{t.compareUnmap}</TableHead>
              <TableHead className="text-right">{t.compareGoogle}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.rows.map((row) => (
              <TableRow key={row.metric} data-compare={row.metric}>
                <TableCell className="whitespace-normal">{metricLabel(row.metric, lang)}</TableCell>
                <TableCell className="text-right tabular-nums" data-side="unmap">
                  {metricValue(row.metric, row.unmap, lang)}
                </TableCell>
                <TableCell className="text-right tabular-nums" data-side="google">
                  {metricValue(row.metric, row.google, lang)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
