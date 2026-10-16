"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { useCheck } from "@/hooks/use-check";
import { useSolve } from "@/hooks/use-solve";
import { AppHeader } from "@/lib/kit/app-header";
import { API_KEY } from "@/lib/kit/config";
import type { Lang } from "@/lib/kit/i18n";
import { MissingKey } from "@/lib/kit/missing-key";
import { useLang } from "@/lib/kit/use-lang";
import { MANIFEST } from "@/lib/manifest";
import { requestKey } from "@/lib/request-key";
import { capsFromEnv, overCaps } from "@/lib/scenario/limits";
import { loadFile, ScenarioLoadError, type Json, type LoadedScenario } from "@/lib/scenario/load";
import { loadSample } from "@/lib/scenario/samples";
import { applySettings, defaultSettings, stopsOutsideCanada, usesMatrices, type SolveSettings } from "@/lib/scenario/settings";
import { removablePaths, stripFields } from "@/lib/scenario/strip";
import { LoadPanel, type LoadProblem } from "./load-panel";
import { ReportPanel } from "./report-panel";
import { Results } from "./results";
import { SettingsPanel, type SolveBlock } from "./settings-panel";

/** The request with unsupported fields deleted, and the paths that were deleted. */
interface Stripped {
  request: Json;
  removed: string[];
}

/**
 * Fleet Optimizer: load a scenario, check it (free), optionally drop the fields Unmap cannot model
 * yet, adjust the solve settings, solve. Each step is derived from the one above it, so loading a
 * new file resets everything below it: `empty → loaded → checked → (stripped) → solving → solved`.
 */
function Workspace({ lang }: { lang: Lang }) {
  const [scenario, setScenario] = useState<LoadedScenario | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [stripped, setStripped] = useState<Stripped | null>(null);
  const [settings, setSettings] = useState<SolveSettings | null>(null);
  /** Bumped on each load so the settings inputs start again from the new file's defaults. */
  const [generation, setGeneration] = useState(0);
  /** Ignores a slow read that a later load has overtaken. */
  const loadSeq = useRef(0);
  /** The stripped request whose check, once ready, solves straight away ("Remove N fields and solve"). */
  const solveAfterCheck = useRef<string | null>(null);
  /**
   * Whether a settings input holds a value that cannot be used (a timeout of 0, a speed under
   * 1 km/h). The panel owns the text and reports here, so the Solve button and the auto-solve
   * after "Remove N fields and solve" both stay off while it is true.
   */
  const [settingsInvalid, setSettingsInvalid] = useState(false);

  const caps = useMemo(() => capsFromEnv(), []);
  const original = scenario?.request ?? null;
  const checkRequest = stripped?.request ?? original;
  const matrices = useMemo(() => (original ? usesMatrices(original) : false), [original]);
  const outside = useMemo(() => (original && !matrices ? stopsOutsideCanada(original) : 0), [original, matrices]);
  const counts = useMemo(() => (checkRequest ? overCaps(checkRequest, caps) : null), [checkRequest, caps]);
  const solveRequest = useMemo(() => {
    if (!checkRequest || !settings) return null;
    // Road travel ends at the border: a stop outside Canada forces straight lines whatever was picked.
    return applySettings(checkRequest, outside > 0 ? { ...settings, travel: "straight" } : settings);
  }, [checkRequest, settings, outside]);

  const { state: checkState, check, reset: resetCheck } = useCheck(checkRequest);
  const { state: solveState, solve, reset: resetSolve } = useSolve(solveRequest);
  const report = checkState.status === "ok" ? checkState.report : null;
  // What "Remove N fields" can delete, so the count on the button is what a click removes.
  const strippable = useMemo(() => (checkRequest && report ? removablePaths(checkRequest, report.removable) : null), [checkRequest, report]);

  const block: SolveBlock | null = counts?.over
    ? "over"
    : !report
      ? checkState.status === "error"
        ? "check-failed"
        : "check"
      : report.status === "blocked"
        ? "blocked"
        : report.status === "needs-changes"
          ? "removal"
          : null;

  useEffect(() => {
    if (checkState.status !== "ok" && checkState.status !== "error") return;
    if (solveAfterCheck.current !== checkState.key) return;
    solveAfterCheck.current = null;
    if (block === null && !settingsInvalid && solveRequest) solve(solveRequest);
  }, [checkState, block, settingsInvalid, solveRequest, solve]);

  const accept = useCallback(
    /** `fromFile`: only a file the visitor opened picks up a waiting solution.json, never a sample. */
    (loaded: LoadedScenario, fromFile: boolean) => {
      // A solution.json on its own attaches to the request already open, and a request that
      // arrives after a lone solution.json picks it up: either way the pair is compared.
      if (loaded.request === null && scenario?.request) {
        setScenario({ ...scenario, googleSolution: loaded.googleSolution });
        setProblem(null);
        return;
      }
      const pending = fromFile && scenario && scenario.request === null ? scenario.googleSolution : null;
      const next = loaded.request && !loaded.googleSolution && pending ? { ...loaded, googleSolution: pending } : loaded;
      // A new scenario cancels whatever is in flight for the old one, so a hidden run spends nothing.
      resetCheck();
      resetSolve();
      setScenario(next);
      setProblem(null);
      setStripped(null);
      setSettings(next.request ? defaultSettings(next.request) : null);
      setGeneration((g) => g + 1);
      setSettingsInvalid(false);
      solveAfterCheck.current = null;
      // The check is free, so it runs once on every load.
      if (next.request) check(next.request);
    },
    [scenario, check, resetCheck, resetSolve],
  );

  const onFile = useCallback(
    async (file: File) => {
      const seq = ++loadSeq.current;
      setReading(true);
      try {
        const loaded = await loadFile(file);
        if (seq === loadSeq.current) accept(loaded, true);
      } catch (error) {
        if (seq === loadSeq.current) setProblem(error instanceof ScenarioLoadError ? error.reason : "unreadable");
      } finally {
        if (seq === loadSeq.current) setReading(false);
      }
    },
    [accept],
  );

  // A file dropped anywhere on the page opens like one dropped on the drop zone. Without this the
  // browser would navigate to the raw file and the plan on screen would be lost. A drop the zone
  // already handled arrives here with defaultPrevented set and is left alone.
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  }, [onFile]);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      const handled = e.defaultPrevented;
      e.preventDefault();
      if (handled) return;
      const file = e.dataTransfer?.files[0];
      if (file) void onFileRef.current(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const onSolution = useCallback(
    async (file: File) => {
      if (!scenario?.request) return;
      const seq = ++loadSeq.current;
      setReading(true);
      try {
        const loaded = await loadFile(file);
        if (seq !== loadSeq.current) return;
        if (!loaded.googleSolution) setProblem("not-solution");
        else {
          setScenario({ ...scenario, googleSolution: loaded.googleSolution });
          setProblem(null);
        }
      } catch (error) {
        if (seq !== loadSeq.current) return;
        const reason = error instanceof ScenarioLoadError ? error.reason : "unreadable";
        setProblem(reason === "unknown-shape" || reason === "no-scenario" ? "not-solution" : reason);
      } finally {
        if (seq === loadSeq.current) setReading(false);
      }
    },
    [scenario],
  );

  const onSample = useCallback(
    (id: string) => {
      loadSeq.current++;
      setReading(false);
      const loaded = loadSample(id);
      if (loaded) accept(loaded, false);
    },
    [accept],
  );

  const onRemove = useCallback(() => {
    if (!checkRequest || !report) return;
    const result = stripFields(checkRequest, report.removable);
    // Nothing could be deleted: re-checking the same request would only repeat the same report.
    if (result.removed.length === 0) return;
    resetCheck();
    resetSolve();
    const removed = [...(stripped?.removed ?? [])];
    for (const path of result.removed) if (!removed.includes(path)) removed.push(path);
    setStripped({ request: result.request, removed });
    // The report on screen is always the API's own answer, so the stripped request is checked again.
    solveAfterCheck.current = requestKey(result.request);
    check(result.request);
  }, [checkRequest, report, stripped, check, resetCheck, resetSolve]);

  // A changed setting is a different request: the solve in flight for the old one is cancelled
  // (not left to run hidden and spend the key's quota), and the plan on screen goes with it.
  const onSettings = useCallback(
    (next: SolveSettings) => {
      resetSolve();
      setSettings(next);
    },
    [resetSolve],
  );

  const removed = stripped?.removed ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <aside className="flex flex-col gap-4 p-3 lg:w-[460px] lg:flex-none lg:overflow-y-auto lg:border-r">
        <LoadPanel
          scenario={scenario}
          reading={reading}
          problem={problem}
          lang={lang}
          onFile={(file) => void onFile(file)}
          onSample={onSample}
          onSolution={(file) => void onSolution(file)}
        />
        {checkRequest ? (
          <>
            <Separator />
            <ReportPanel
              state={checkState}
              removed={removed}
              strippable={strippable}
              lang={lang}
              onRemove={onRemove}
              onRetry={() => check(checkRequest)}
            />
          </>
        ) : null}
        {checkRequest && settings && counts ? (
          <>
            <Separator />
            <SettingsPanel
              key={generation}
              settings={outside > 0 ? { ...settings, travel: "straight" } : settings}
              onChange={onSettings}
              onValidity={setSettingsInvalid}
              matrices={matrices}
              outside={outside}
              counts={counts}
              caps={caps}
              block={block}
              solveState={solveState}
              lang={lang}
              onSolve={() => {
                if (solveRequest && block === null && !settingsInvalid) solve(solveRequest);
              }}
            />
          </>
        ) : null}
      </aside>
      <main className="flex min-h-[50dvh] flex-col p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-results-slot="">
        <Results
          state={solveState}
          removed={removed}
          solved={solveRequest}
          original={original}
          googleSolution={scenario?.googleSolution ?? null}
          lang={lang}
        />
      </main>
    </div>
  );
}

/** Fleet Optimizer: the header, then the workspace, or the missing-key state when there is no key. */
export function FleetApp() {
  const [lang, setLang] = useLang();
  const hasKey = !!API_KEY;
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader manifest={MANIFEST} lang={lang} onLang={setLang} />
      {hasKey ? (
        <Workspace lang={lang} />
      ) : (
        <main className="min-h-0 flex-1">
          <MissingKey lang={lang} />
        </main>
      )}
    </div>
  );
}
