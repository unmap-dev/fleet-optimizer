"use client";

import { useId, useRef, useState } from "react";
import { AlertCircleIcon, FileCheckIcon, FileUpIcon, LockIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { ProvenanceBadge } from "@/lib/kit/provenance-badge";
import { overCaps } from "@/lib/scenario/limits";
import type { LoadedScenario, ScenarioLoadReason } from "@/lib/scenario/load";
import { SAMPLES } from "@/lib/scenario/samples";
import { TEXT } from "@/lib/text";

/** Why a file was refused: a load reason, or a solution.json that is not a solution. */
export type LoadProblem = ScenarioLoadReason | "not-solution";

/**
 * Where the scenario comes from: a dropped or picked `.json` / `.zip`, a bundled sample, and a
 * separate input for Google's `solution.json`. Files are read here; nothing is sent from this panel.
 */
export function LoadPanel({
  scenario,
  reading,
  problem,
  lang,
  onFile,
  onSample,
  onSolution,
}: {
  scenario: LoadedScenario | null;
  reading: boolean;
  problem: LoadProblem | null;
  lang: Lang;
  onFile: (file: File) => void;
  onSample: (id: string) => void;
  onSolution: (file: File) => void;
}) {
  const t = TEXT[lang];
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const solutionInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const request = scenario?.request ?? null;
  const counts = request ? overCaps(request, {}) : null;
  const sample = scenario?.source.kind === "sample" ? SAMPLES.find((s) => s.file === scenario.source.name) : undefined;

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3" data-load-panel="">
      <h2 id={`${id}-title`} className="text-sm font-medium">
        {t.load.title}
      </h2>
      {/* The browser's own file control reads "Choose File" in the OS language; a Button opens it
          instead, so the panel speaks the page's language. */}
      <input
        ref={fileInput}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-file-input="scenario"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
      <input
        ref={solutionInput}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-file-input="solution"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onSolution(file);
        }}
      />
      <Empty
        className="border"
        data-drop-zone=""
        data-dragging={dragging ? "" : undefined}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">{reading ? <Spinner /> : <FileUpIcon />}</EmptyMedia>
          <EmptyTitle>{reading ? t.load.reading : dragging ? t.load.dropActive : t.load.drop}</EmptyTitle>
          {/* Once a scenario is open the formats are known; the zone shrinks to make room for the report. */}
          {request ? null : <EmptyDescription>{t.load.formats}</EmptyDescription>}
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" disabled={reading} onClick={() => fileInput.current?.click()}>
            <FileUpIcon />
            {request ? t.load.chooseAnother : t.load.choose}
          </Button>
        </EmptyContent>
      </Empty>
      {problem ? (
        <Alert variant="destructive" data-load-error={problem}>
          <AlertCircleIcon />
          <AlertDescription>{t.load.errors[problem]}</AlertDescription>
        </Alert>
      ) : null}
      {scenario ? (
        <Card size="sm" data-scenario={scenario.source.kind}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {sample ? <ProvenanceBadge kind="sample" lang={lang} /> : <Badge variant="secondary">{t.load.fileBadge}</Badge>}
              <span className="min-w-0 flex-1 truncate font-medium" title={scenario.source.name}>
                {sample ? sample.title[lang] : scenario.source.name}
              </span>
            </div>
            {counts ? (
              <p className="text-xs text-muted-foreground tabular-nums" data-counts="">
                {format(t.load.counts, { shipments: formatNumber(counts.shipments, lang), vehicles: formatNumber(counts.vehicles, lang) })}
              </p>
            ) : null}
            {scenario.googleSolution ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-google-solution="">
                <FileCheckIcon className="size-3.5" />
                {request ? t.load.solutionLoaded : t.load.solutionWaiting}
              </p>
            ) : null}
            {request ? (
              <Button size="sm" variant="outline" className="self-start" disabled={reading} onClick={() => solutionInput.current?.click()}>
                {scenario.googleSolution ? t.load.replaceSolution : t.load.addSolution}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">{t.load.intro}</p>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">{t.load.samplesTitle}</h3>
        <div className="flex flex-wrap gap-2" data-samples="">
          {SAMPLES.map((s) => (
            <Button key={s.id} size="sm" variant="outline" disabled={reading} data-sample={s.id} onClick={() => onSample(s.id)}>
              {s.title[lang]}
            </Button>
          ))}
        </div>
      </div>
      <Alert data-privacy="">
        <LockIcon />
        <AlertDescription>{t.privacy}</AlertDescription>
      </Alert>
      <p className="text-xs text-muted-foreground" data-affiliation="">
        {t.affiliation}
      </p>
    </section>
  );
}
