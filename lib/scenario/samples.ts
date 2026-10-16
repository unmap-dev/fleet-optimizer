import fieldService from "@/data/field-service-with-breaks.sample.json";
import lastMile from "@/data/last-mile-deliveries.sample.json";
import pickupDelivery from "@/data/pickup-delivery-courier.sample.json";
import { canonicalise, type Json, type LoadedScenario } from "./load";

export interface Sample {
  id: string;
  /**
   * The file under `data/`, `<id>.sample.json`: byte-identical to the conformance corpus example
   * `<id>.json` (the `.sample.json` name is what the public exporter accepts as sample data).
   */
  file: string;
  title: { en: string; fr: string };
  request: Json;
}

export const SAMPLES: readonly Sample[] = [
  {
    id: "last-mile-deliveries",
    file: "last-mile-deliveries.sample.json",
    title: { en: "Last-mile deliveries", fr: "Livraisons du dernier kilomètre" },
    request: lastMile as Json,
  },
  {
    id: "field-service-with-breaks",
    file: "field-service-with-breaks.sample.json",
    title: { en: "Field service with breaks", fr: "Service sur le terrain avec pauses" },
    request: fieldService as Json,
  },
  {
    id: "pickup-delivery-courier",
    file: "pickup-delivery-courier.sample.json",
    title: { en: "Pickup and delivery courier", fr: "Messager de cueillette et de livraison" },
    request: pickupDelivery as Json,
  },
];

/** A bundled sample as a loaded scenario, or null for an unknown id. */
export function loadSample(id: string): LoadedScenario | null {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) return null;
  return {
    request: canonicalise(sample.request) as Json,
    googleSolution: null,
    source: { kind: "sample", name: sample.file },
  };
}
