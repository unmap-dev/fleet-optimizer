import type { Json } from "@/lib/scenario/load";

/** JSON with every object's keys sorted, so two requests that differ only in key order agree. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * A stable key for a request: FNV-1a (32-bit) over the canonical JSON, with the length appended so
 * a collision needs the same length too. It names "this exact request" so an answer is never
 * shown against a different one. It is not a security hash.
 */
export function requestKey(request: Json): string {
  const text = canonicalJson(request);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}-${text.length.toString(16)}`;
}
