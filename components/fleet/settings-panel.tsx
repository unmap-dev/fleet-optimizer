"use client";

import { useEffect, useId, useState } from "react";
import { GlobeIcon, PlayIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SolveState } from "@/hooks/use-solve";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import type { Caps } from "@/lib/scenario/limits";
import type { SolveSettings } from "@/lib/scenario/settings";
import { TEXT } from "@/lib/text";
import { OptimizeProblemAlert } from "./optimize-problem";

/**
 * Why solve is off: the check is not done, the check failed, the report is blocked, fields await
 * removal, or the scenario is over caps.
 */
export type SolveBlock = "check" | "check-failed" | "blocked" | "removal" | "over";

const KMH_PER_MPS = 3.6;

function positive(raw: string): number | undefined {
  const n = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function limitsText(caps: Caps, lang: Lang): string {
  const t = TEXT[lang].settings;
  const parts: string[] = [];
  if (caps.maxShipments !== undefined) parts.push(format(t.limitShipments, { n: formatNumber(caps.maxShipments, lang) }));
  if (caps.maxVehicles !== undefined) parts.push(format(t.limitVehicles, { n: formatNumber(caps.maxVehicles, lang) }));
  return parts.join(` ${t.and} `);
}

/**
 * The settings applied on top of the file before solving, and the Solve button. Remount it (a new
 * `key`) when a new file loads so the inputs start from that file's defaults.
 */
export function SettingsPanel({
  settings,
  onChange,
  onValidity,
  matrices,
  outside,
  counts,
  caps,
  block,
  solveState,
  lang,
  onSolve,
}: {
  settings: SolveSettings;
  onChange: (settings: SolveSettings) => void;
  /** Told whenever the inputs become valid or invalid; the workspace gates every solve on it. */
  onValidity?: (invalid: boolean) => void;
  /** The request carries its own travel matrices: no travel choice is offered. */
  matrices: boolean;
  /** Stops outside Canada; any forces straight-line travel. */
  outside: number;
  counts: { shipments: number; vehicles: number; over: boolean };
  caps: Caps;
  block: SolveBlock | null;
  solveState: SolveState;
  lang: Lang;
  onSolve: () => void;
}) {
  const t = TEXT[lang].settings;
  const id = useId();
  const [timeout, setTimeoutText] = useState(settings.timeoutSeconds !== undefined ? String(settings.timeoutSeconds) : "");
  const [speed, setSpeedText] = useState(String(Math.round(settings.metersPerSecond * KMH_PER_MPS)));
  const solving = solveState.status === "loading";
  // An empty timeout keeps the file's own; anything else must be a number of seconds, 1 or more.
  const timeoutInvalid = timeout.trim() !== "" && (positive(timeout) ?? 0) < 1;
  const speedInvalid = !matrices && settings.travel === "straight" && (positive(speed) ?? 0) < 1;
  const invalid = timeoutInvalid || speedInvalid;
  useEffect(() => {
    onValidity?.(invalid);
  }, [invalid, onValidity]);
  const searchItems = [
    { value: "file", label: t.searchModes.file },
    { value: "RETURN_FAST", label: t.searchModes.RETURN_FAST },
    { value: "CONSUME_ALL_AVAILABLE_TIME", label: t.searchModes.CONSUME_ALL_AVAILABLE_TIME },
  ];
  const waits: Record<SolveBlock, string> = {
    check: t.waitCheck,
    "check-failed": t.waitCheckFailed,
    blocked: t.waitBlocked,
    removal: t.waitRemoval,
    over: t.waitOver,
  };
  const wait = block !== null ? waits[block] : invalid ? t.waitInvalid : null;

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3" data-settings-panel="">
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          {t.title}
        </h2>
        <p className="text-xs text-muted-foreground">{t.intro}</p>
      </div>
      <FieldGroup>
        <Field data-invalid={timeoutInvalid || undefined}>
          <FieldLabel htmlFor={`${id}-timeout`}>{t.timeout}</FieldLabel>
          <Input
            id={`${id}-timeout`}
            aria-invalid={timeoutInvalid || undefined}
            aria-describedby={timeoutInvalid ? `${id}-timeout-error` : undefined}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={timeout}
            onChange={(e) => {
              const raw = e.currentTarget.value;
              setTimeoutText(raw);
              const n = positive(raw);
              const next = { ...settings };
              if (n === undefined) delete next.timeoutSeconds;
              else next.timeoutSeconds = Math.round(n);
              onChange(next);
            }}
          />
          <FieldDescription>{t.timeoutHint}</FieldDescription>
          {timeoutInvalid ? (
            <FieldError id={`${id}-timeout-error`} data-invalid-timeout="">
              {t.timeoutInvalid}
            </FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-search`}>{t.searchMode}</FieldLabel>
          <Select
            items={searchItems}
            value={settings.searchMode ?? "file"}
            onValueChange={(value) => {
              const next = { ...settings };
              if (value === "RETURN_FAST" || value === "CONSUME_ALL_AVAILABLE_TIME") next.searchMode = value;
              else delete next.searchMode;
              onChange(next);
            }}
          >
            <SelectTrigger id={`${id}-search`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {searchItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {matrices ? (
          <Alert data-matrices="">
            <GlobeIcon />
            <AlertDescription>{t.matrices}</AlertDescription>
          </Alert>
        ) : (
          <>
            <Field>
              <FieldLabel id={`${id}-travel`}>{t.travel}</FieldLabel>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                aria-labelledby={`${id}-travel`}
                value={[settings.travel]}
                onValueChange={(v) => {
                  const travel = v[0];
                  if (travel === "road" || travel === "straight") onChange({ ...settings, travel });
                }}
                data-travel={settings.travel}
              >
                <ToggleGroupItem value="road" disabled={outside > 0}>
                  {t.road}
                </ToggleGroupItem>
                <ToggleGroupItem value="straight">{t.straight}</ToggleGroupItem>
              </ToggleGroup>
              {settings.travel === "road" ? <FieldDescription>{t.roadHint}</FieldDescription> : null}
            </Field>
            {outside > 0 ? (
              <Alert data-outside-canada={outside}>
                <GlobeIcon />
                <AlertTitle>{t.outsideTitle}</AlertTitle>
                <AlertDescription>{outside === 1 ? t.outsideOne : format(t.outside, { n: formatNumber(outside, lang) })}</AlertDescription>
              </Alert>
            ) : null}
            {settings.travel === "straight" ? (
              <Field data-invalid={speedInvalid || undefined}>
                <FieldLabel htmlFor={`${id}-speed`}>{t.speed}</FieldLabel>
                <Input
                  id={`${id}-speed`}
                  aria-invalid={speedInvalid || undefined}
                  aria-describedby={speedInvalid ? `${id}-speed-error` : undefined}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={speed}
                  onChange={(e) => {
                    const raw = e.currentTarget.value;
                    setSpeedText(raw);
                    const kmh = positive(raw);
                    if (kmh !== undefined && kmh >= 1) onChange({ ...settings, metersPerSecond: kmh / KMH_PER_MPS });
                  }}
                />
                {speedInvalid ? (
                  <FieldError id={`${id}-speed-error`} data-invalid-speed="">
                    {t.speedInvalid}
                  </FieldError>
                ) : null}
              </Field>
            ) : null}
          </>
        )}
      </FieldGroup>
      {counts.over ? (
        <Alert variant="destructive" data-over-caps="">
          <TriangleAlertIcon />
          <AlertTitle>{t.overTitle}</AlertTitle>
          <AlertDescription>
            <p>
              {format(t.over, {
                shipments: formatNumber(counts.shipments, lang),
                vehicles: formatNumber(counts.vehicles, lang),
                limits: limitsText(caps, lang),
              })}
            </p>
            <p>{t.cloneHint}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Button className="self-start" disabled={block !== null || invalid || solving} onClick={onSolve} data-solve="">
          {solving ? <Spinner /> : <PlayIcon />}
          {solving ? t.solving : solveState.status === "ok" ? t.solveAgain : t.solve}
        </Button>
        {wait ? (
          <p className="text-xs text-muted-foreground" data-solve-wait={block ?? "invalid"}>
            {wait}
          </p>
        ) : null}
      </div>
      {solveState.status === "error" ? (
        <OptimizeProblemAlert
          problem={solveState.problem}
          lang={lang}
          onRetry={block === null && !invalid ? onSolve : undefined}
          retryLabel={t.solveAgain}
          roadHint={!matrices && settings.travel === "road"}
        />
      ) : null}
    </section>
  );
}
