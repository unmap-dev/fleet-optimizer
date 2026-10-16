"use client";

import { useMemo } from "react";
import { RouteIcon, ScissorsIcon, TimerIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { SolveState } from "@/hooks/use-solve";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { summarisePlan } from "@/lib/plan/summary";
import type { Json } from "@/lib/scenario/load";
import { toReportWarnings } from "@/lib/scenario/report";
import { TEXT } from "@/lib/text";
import { Comparison } from "./comparison";
import { DownloadMenu } from "./download-menu";
import { ResultMap } from "./result-map";
import { Timeline } from "./timeline";
import { Totals } from "./totals";
import { WarningsTable } from "./warnings-table";

export interface ResultsProps {
  state: SolveState;
  /** Paths deleted from the request before solving; every view says so when there are any. */
  removed: string[];
  /** The request as solved (stripped, settings applied): what the ZIP's scenario.json holds. */
  solved: Json | null;
  /** The request as loaded, before any strip: Google's solution.json answers this one. */
  original: Json | null;
  googleSolution: Json | null;
  lang: Lang;
}

/** The solved plan: map, timeline, totals, the comparison when a solution.json is loaded, downloads. */
export function Results({ state, removed, solved, original, googleSolution, lang }: ResultsProps) {
  const t = TEXT[lang].results;
  const google = useMemo(
    () => (original && googleSolution ? summarisePlan(original, googleSolution) : null),
    [original, googleSolution],
  );

  if (state.status === "loading") {
    return (
      <Empty data-results="solving">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>{t.solvingTitle}</EmptyTitle>
          <EmptyDescription>{t.solvingBody}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (state.status !== "ok") {
    return (
      <Empty data-results="empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RouteIcon />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.emptyBody}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const summary = state.summary;
  return (
    <div className="flex flex-col gap-4" data-results="solved">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">{t.planTitle}</h2>
        {solved ? <DownloadMenu request={solved} response={state.response} removed={removed} lang={lang} /> : null}
      </div>
      {removed.length > 0 ? (
        <Alert>
          <ScissorsIcon />
          <AlertDescription data-results-without="">{format(TEXT[lang].report.solvedWithout, { paths: removed.join(", ") })}</AlertDescription>
        </Alert>
      ) : null}
      {state.timeoutClamped && state.clampedTimeoutSeconds !== null ? (
        <Alert data-timeout-clamped="">
          <TimerIcon />
          <AlertDescription>{format(t.timeoutClamped, { n: formatNumber(state.clampedTimeoutSeconds, lang) })}</AlertDescription>
        </Alert>
      ) : null}
      {state.warnings.length > 0 ? (
        <section className="flex flex-col gap-1.5" data-solve-warnings="">
          <h3 className="text-xs font-medium text-muted-foreground">{t.warningsTitle}</h3>
          <WarningsTable warnings={toReportWarnings(state.warnings)} lang={lang} />
        </section>
      ) : null}
      <ResultMap summary={summary} lang={lang} />
      <Timeline rows={summary.rows} lang={lang} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Totals summary={summary} billableShipments={state.billableShipments} lang={lang} />
        {google ? <Comparison unmap={summary} google={google} removed={removed} lang={lang} /> : null}
      </div>
    </div>
  );
}
