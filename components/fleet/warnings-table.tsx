"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, type Lang } from "@/lib/kit/i18n";
import type { ReportWarning } from "@/lib/scenario/report";
import { TEXT } from "@/lib/text";

/** The API's warnings (accepted but ignored, or changed): code and field, count, message. Used by the check and the solve. */
export function WarningsTable({ warnings, lang }: { warnings: ReportWarning[]; lang: Lang }) {
  const t = TEXT[lang].report;
  return (
    <Table data-warnings="">
      <TableHeader>
        <TableRow>
          <TableHead>{t.code}</TableHead>
          <TableHead>{t.count}</TableHead>
          <TableHead>{t.message}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {warnings.map((w, i) => (
          <TableRow key={`${w.code}-${w.field ?? ""}-${i}`}>
            <TableCell className="whitespace-normal break-all">
              <code>{w.code}</code>
              {w.field ? <code className="block">{w.field}</code> : null}
            </TableCell>
            <TableCell className="tabular-nums">{formatNumber(w.count, lang)}</TableCell>
            <TableCell className="whitespace-normal">{w.message}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
