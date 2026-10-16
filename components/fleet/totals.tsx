"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistance, formatDuration, formatNumber, type Lang } from "@/lib/kit/i18n";
import type { PlanSummary } from "@/lib/plan/summary";
import { TEXT } from "@/lib/text";
import { formatCost, shipmentName } from "./result-format";

/** A GMPRO skipped reason in plain words, or the raw code when this app does not know it. */
function Reason({ code, lang }: { code: string; lang: Lang }) {
  const known = TEXT[lang].results.reasons[code];
  return known ? <span data-reason={code}>{known}</span> : <code data-reason={code}>{code}</code>;
}

/**
 * The plan's numbers: total cost and each `metrics.costs` key (in plain words where known, the raw
 * key otherwise), distance, duration, vehicles, shipments served and skipped with their reasons,
 * and the shipments the solve billed.
 */
export function Totals({ summary, billableShipments, lang }: { summary: PlanSummary; billableShipments: number; lang: Lang }) {
  const t = TEXT[lang].results;
  const costs = Object.entries(summary.costs);
  const rows: { key: string; label: ReactNode; value: string; sub?: boolean }[] = [
    { key: "totalCost", label: t.totalCost, value: formatCost(summary.totalCost, lang) },
    ...costs.map(([key, value]) => ({
      key: `cost:${key}`,
      label: t.costs[key] ?? <code>{key}</code>,
      value: formatCost(value, lang),
      sub: true,
    })),
    { key: "distance", label: t.distance, value: formatDistance(summary.distanceMeters, lang) },
    { key: "duration", label: t.duration, value: formatDuration(summary.durationSeconds, lang) },
    { key: "vehicles", label: t.vehiclesUsed, value: formatNumber(summary.vehiclesUsed, lang) },
    { key: "performed", label: t.performed, value: formatNumber(summary.performed, lang) },
    { key: "skipped", label: t.skipped, value: formatNumber(summary.skipped.length, lang) },
    { key: "billable", label: t.billable, value: formatNumber(billableShipments, lang) },
  ];
  return (
    <Card data-totals="">
      <CardHeader>
        <CardTitle>{t.totalsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} data-total={row.key}>
                <TableCell className={row.sub ? "pl-6 whitespace-normal" : "whitespace-normal"}>{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">{row.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardDescription data-billing-note="">{t.billingNote}</CardDescription>
        {summary.skipped.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">{t.skippedTitle}</h3>
            <Table data-skipped="">
              <TableHeader>
                <TableRow>
                  <TableHead>{t.skippedShipment}</TableHead>
                  <TableHead>{t.skippedReasons}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.skipped.map((s) => (
                  <TableRow key={s.index}>
                    <TableCell className="whitespace-normal">{shipmentName(s.index, s.label, lang)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {s.reasons.length === 0 ? (
                        t.noReason
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {s.reasons.map((code, i) => (
                            <li key={`${code}-${i}`}>
                              <Reason code={code} lang={lang} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
