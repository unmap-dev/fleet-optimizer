"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/kit/i18n";
import { fleetRoutingZip, responseJson } from "@/lib/plan/export";
import type { Json } from "@/lib/scenario/load";
import { TEXT } from "@/lib/text";

export const RESPONSE_FILE = "fleet-optimizer-response.json";
export const ZIP_FILE = "fleet-optimizer-plan.zip";

/** Saves bytes as a file, the way a browser saves a download. Called from a click handler. */
function save(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The two downloads: Unmap's `OptimizeToursResponse` as JSON, and a ZIP the Fleet Routing App
 * opens (the request as solved, labelled with any removed fields, and the response).
 */
export function DownloadMenu({ request, response, removed, lang }: { request: Json; response: Json; removed: string[]; lang: Lang }) {
  const t = TEXT[lang].results;
  return (
    <div role="group" aria-label={t.downloadTitle} className="flex flex-wrap gap-2" data-downloads="">
      <Button size="sm" variant="outline" data-download="response" onClick={() => save(responseJson(response), "application/json", RESPONSE_FILE)}>
        <DownloadIcon />
        {t.downloadResponse}
      </Button>
      <Button
        size="sm"
        variant="outline"
        data-download="zip"
        onClick={() => save(fleetRoutingZip(request, response, removed) as Uint8Array<ArrayBuffer>, "application/zip", ZIP_FILE)}
      >
        <DownloadIcon />
        {t.downloadZip}
      </Button>
    </div>
  );
}
