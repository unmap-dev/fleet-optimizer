import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { TEXT } from "@/lib/text";

/**
 * A vehicle's colour, the same in every view: the theme's `--chart-1..5`, cycled by vehicle index.
 * A CSS value for DOM elements; the map resolves the same tokens itself (`chartRamp`).
 */
export function vehicleColour(vehicleIndex: number): string {
  return `var(--chart-${(vehicleIndex % 5) + 1})`;
}

/** The request's label, else "Vehicle N" (1-based, so `model.vehicles[0]` is Vehicle 1). */
export function vehicleName(vehicleIndex: number, label: string | undefined, lang: Lang): string {
  return label ? label : format(TEXT[lang].results.vehicle, { n: formatNumber(vehicleIndex + 1, lang) });
}

/** The shipment's label, else "Shipment N" (1-based, so `model.shipments[0]` is Shipment 1). */
export function shipmentName(index: number, label: string | undefined, lang: Lang): string {
  return label ? label : format(TEXT[lang].results.shipment, { n: formatNumber(index + 1, lang) });
}

/**
 * Epoch seconds as `HH:MM` in UTC. The request carries no time zone, so the timeline shows the
 * file's own clock and says so rather than guessing where the fleet is.
 */
export function clock(epochSeconds: number): string {
  const d = new Date(Math.round(epochSeconds) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** A cost: two decimals in the visitor's locale. GMPRO costs carry no currency. */
export function formatCost(value: number, lang: Lang): string {
  return formatNumber(value, lang, 2);
}
