import type { Json } from "./load";

/** `useGeodesicDistances` as `use_geodesic_distances`. The API accepts either spelling in a request. */
export function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The elements of `value` that are objects; anything that is not an array gives an empty list. */
export function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** The key under which `obj` holds the field `name`: camelCase first, then snake_case, else undefined. */
export function keyOf(obj: Json, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(obj, name)) return name;
  const snake = snakeCase(name);
  if (snake !== name && Object.prototype.hasOwnProperty.call(obj, snake)) return snake;
  return undefined;
}

/** The value of the field `name` in `obj`, whichever spelling the request used. */
export function field(obj: unknown, name: string): unknown {
  if (!isRecord(obj)) return undefined;
  const key = keyOf(obj, name);
  return key === undefined ? undefined : obj[key];
}

/** Deletes the field `name` in both spellings, so a later write cannot collide with it. */
export function deleteField(obj: Json, name: string): void {
  delete obj[name];
  delete obj[snakeCase(name)];
}
