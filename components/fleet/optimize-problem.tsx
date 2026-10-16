"use client";

import { AlertCircleIcon, RotateCwIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QUOTA_CODES, type OptimizeProblem } from "@/hooks/optimize-error";
import { ApiProblemAlert } from "@/lib/kit/api-problem";
import { describeError } from "@/lib/kit/errors";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { KIT_TEXT } from "@/lib/kit/strings";
import { TEXT } from "@/lib/text";

/**
 * Whether a retry is offered: what the kit calls retryable (0, 429, 502, 503) plus a 504. The app
 * draws its own button for all of them, so the words say what happens ("Check again", "Solve
 * again"), and the kit itself is not edited.
 */
function canRetry(error: unknown, lang: Lang): boolean {
  const problem = describeError(error, lang);
  return problem.retryable || problem.status === 504;
}

/** A wait as people say it: seconds under 90, then about N minutes, then about N hours. */
export function waitText(seconds: number | undefined, lang: Lang): string {
  const t = TEXT[lang].problem;
  if (seconds === undefined || seconds <= 1) return t.rateLater;
  if (seconds < 90) return format(t.rateSeconds, { n: formatNumber(Math.round(seconds), lang) });
  if (seconds < 90 * 60) return format(t.rateMinutes, { n: formatNumber(Math.round(seconds / 60), lang) });
  return format(t.rateHours, { n: formatNumber(Math.round(seconds / 3600), lang) });
}

/**
 * A failed check or solve, said where the answer would have been. `roadHint` adds the
 * straight-line suggestion: a road solve outside the graph comes back as an error, not a plan.
 */
export function OptimizeProblemAlert({
  problem,
  lang,
  onRetry,
  retryLabel,
  roadHint = false,
}: {
  problem: OptimizeProblem;
  lang: Lang;
  onRetry?: () => void;
  /** The retry button's words: "Check again" for the check, "Solve again" for the solve. */
  retryLabel?: string;
  roadHint?: boolean;
}) {
  const t = TEXT[lang].problem;
  const retry = onRetry ? (
    <Button variant="outline" size="sm" onClick={onRetry} data-retry="">
      <RotateCwIcon />
      {retryLabel ?? KIT_TEXT[lang].retry}
    </Button>
  ) : null;
  if (problem.kind === "rate-limited") {
    // A spent allowance does not come back in a minute: the honest next step is the visitor's own key.
    if (problem.code !== undefined && QUOTA_CODES.includes(problem.code)) {
      return (
        <Alert variant="destructive" data-problem="quota" data-code={problem.code}>
          <AlertCircleIcon />
          <AlertTitle>{t.quotaTitle}</AlertTitle>
          <AlertDescription>{t.quota}</AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive" data-problem="rate-limited">
        <AlertCircleIcon />
        <AlertTitle>{t.rateTitle}</AlertTitle>
        <AlertDescription>{waitText(problem.retryAfterSeconds, lang)}</AlertDescription>
        {retry ? <AlertAction>{retry}</AlertAction> : null}
      </Alert>
    );
  }
  if (problem.kind === "infeasible") {
    const r = TEXT[lang].report;
    return (
      <Alert variant="destructive" data-problem="infeasible">
        <AlertCircleIcon />
        <AlertTitle>{t.infeasibleTitle}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>{t.infeasible}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{r.path}</TableHead>
                <TableHead>{r.code}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problem.violations.map((v, i) => (
                <TableRow key={`${v.subject}-${i}`}>
                  <TableCell>
                    <code>{v.subject}</code>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <code>{v.type}</code>
                    {v.description ? <span className="block">{v.description}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ApiProblemAlert error={problem.error} lang={lang} />
      {retry && canRetry(problem.error, lang) ? <div>{retry}</div> : null}
      {roadHint ? (
        <Alert data-road-hint="">
          <AlertDescription>{t.roadHint}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
