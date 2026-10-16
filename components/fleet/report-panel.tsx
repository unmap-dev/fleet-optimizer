"use client";

import { useId } from "react";
import { ScissorsIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CheckState } from "@/hooks/use-check";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import type { FieldIssue } from "@/lib/scenario/report";
import { TEXT } from "@/lib/text";
import { OptimizeProblemAlert } from "./optimize-problem";
import { WarningsTable } from "./warnings-table";

const STATUS_VARIANT = { ready: "secondary", "needs-changes": "outline", blocked: "destructive" } as const;

function IssueTable({ issues, lang, kind }: { issues: FieldIssue[]; lang: Lang; kind: "blocking" | "removable" }) {
  const t = TEXT[lang].report;
  return (
    <Table data-issues={kind}>
      <TableHeader>
        <TableRow>
          <TableHead>{t.path}</TableHead>
          <TableHead>{t.code}</TableHead>
          <TableHead>{t.message}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((issue, i) => (
          <TableRow key={`${issue.path}-${issue.code}-${i}`}>
            <TableCell className="whitespace-normal break-all">
              <code>{issue.path}</code>
            </TableCell>
            <TableCell>
              <code>{issue.code}</code>
            </TableCell>
            <TableCell className="whitespace-normal">
              {issue.message}
              {t.hints[issue.code] ? (
                <span className="block text-muted-foreground" data-hint={issue.code}>
                  {t.hints[issue.code]}
                </span>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The compatibility report: the API's own `VALIDATE_ONLY` answer, sorted into what must change in
 * the file and what can be dropped. Once fields are dropped, `removed` names them for good.
 */
export function ReportPanel({
  state,
  removed,
  strippable,
  lang,
  onRemove,
  onRetry,
}: {
  state: CheckState;
  removed: string[];
  /** What a click on "Remove" can delete (`removablePaths`), and the removable issues it cannot. */
  strippable: { paths: string[]; stuck: FieldIssue[] } | null;
  lang: Lang;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const t = TEXT[lang].report;
  const id = useId();
  const report = state.status === "ok" ? state.report : null;
  const n = strippable?.paths.length ?? 0;
  const stuck = strippable?.stuck ?? [];
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3" data-report-panel="">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          {t.title}
        </h2>
        {report ? (
          <Badge variant={STATUS_VARIANT[report.status]} data-status={report.status}>
            {t.status[report.status]}
          </Badge>
        ) : null}
      </div>
      {removed.length > 0 ? (
        <Alert data-solved-without="">
          <ScissorsIcon />
          <AlertDescription>{format(t.solvedWithout, { paths: removed.join(", ") })}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-checking="">
          <Spinner />
          {t.checking}
        </p>
      ) : null}
      {state.status === "error" ? <OptimizeProblemAlert problem={state.problem} lang={lang} onRetry={onRetry} retryLabel={t.checkAgain} /> : null}
      {report ? (
        <>
          <p className="text-sm text-muted-foreground">
            {report.status === "ready" ? t.ready : report.status === "blocked" ? t.blocked : t.needsChanges}
          </p>
          {report.blocking.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{t.blockingTitle}</h3>
              <IssueTable issues={report.blocking} lang={lang} kind="blocking" />
            </div>
          ) : null}
          {report.removable.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{t.removableTitle}</h3>
              <IssueTable issues={report.removable} lang={lang} kind="removable" />
              {n > 0 ? (
                <Button size="sm" variant="secondary" className="self-start" disabled={report.status === "blocked"} onClick={onRemove} data-remove="">
                  <ScissorsIcon />
                  {n === 1 ? t.removeOne : format(t.remove, { n: formatNumber(n, lang) })}
                </Button>
              ) : null}
              {stuck.length > 0 ? (
                <Alert data-stuck="">
                  <AlertDescription>{format(t.stuck, { paths: stuck.map((issue) => issue.path).join(", ") })}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
          {report.warnings.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">{t.warningsTitle}</h3>
              <WarningsTable warnings={report.warnings} lang={lang} />
            </div>
          ) : null}
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">{t.free}</p>
    </section>
  );
}
