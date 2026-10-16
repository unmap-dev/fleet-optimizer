import type { OptimizeToursWarning } from "@unmap/routing";
import type { Json } from "./load";
import { isRecord } from "./names";

/** GMPRO FieldReference: a path into the request as a chain of names, indices and map keys. */
export interface FieldRef {
  name: string;
  index?: number;
  key?: string;
  subField?: FieldRef;
}

export interface FieldIssue {
  /** The chain rendered for people, such as `model.shipments[3].costsPerVehicle`. */
  path: string;
  fields: FieldRef[];
  /** The error's displayName, such as `FIELD_NOT_SUPPORTED_YET`. */
  code: string;
  message: string;
  /** True only for FIELD_NOT_SUPPORTED_YET: the field can be dropped and the rest solved. */
  removable: boolean;
}

export interface ReportWarning {
  code: string;
  field?: string;
  count: number;
  message: string;
}

export interface Report {
  status: "ready" | "needs-changes" | "blocked";
  removable: FieldIssue[];
  blocking: FieldIssue[];
  warnings: ReportWarning[];
}

const REMOVABLE_CODE = "FIELD_NOT_SUPPORTED_YET";

function parseRef(value: unknown): FieldRef | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const ref: FieldRef = { name: value.name };
  if (typeof value.index === "number") ref.index = value.index;
  if (typeof value.key === "string") ref.key = value.key;
  const sub = parseRef(value.subField);
  if (sub) ref.subField = sub;
  return ref;
}

/** Renders a chain as `model.shipments[3].costsPerVehicle`; a map key as `loadLimits["k"]`. */
export function renderPath(ref: FieldRef): string {
  let out = "";
  for (let node: FieldRef | undefined = ref; node; node = node.subField) {
    out += out === "" ? node.name : `.${node.name}`;
    if (node.index !== undefined) out += `[${node.index}]`;
    if (node.key !== undefined) out += `[${JSON.stringify(node.key)}]`;
  }
  return out;
}

function parseIssue(value: unknown): FieldIssue | null {
  if (!isRecord(value)) return null;
  const fields = (Array.isArray(value.fields) ? value.fields : [])
    .map(parseRef)
    .filter((ref): ref is FieldRef => ref !== null);
  const code = typeof value.displayName === "string" ? value.displayName : `CODE_${String(value.code)}`;
  return {
    path: fields.map(renderPath).join(", "),
    fields,
    code,
    message: typeof value.errorMessage === "string" ? value.errorMessage : "",
    removable: code === REMOVABLE_CODE,
  };
}

/**
 * Sorts a VALIDATE_ONLY response body into what can be dropped and what must be fixed.
 * Only FIELD_NOT_SUPPORTED_YET is removable: every other error would change the answer if ignored.
 */
export function buildReport(validateOnlyBody: Json, warnings: OptimizeToursWarning[]): Report {
  const errors = Array.isArray(validateOnlyBody.validationErrors) ? validateOnlyBody.validationErrors : [];
  const removable: FieldIssue[] = [];
  const blocking: FieldIssue[] = [];
  for (const raw of errors) {
    const issue = parseIssue(raw);
    if (!issue) continue;
    (issue.removable ? removable : blocking).push(issue);
  }
  const status = blocking.length > 0 ? "blocked" : removable.length > 0 ? "needs-changes" : "ready";
  return {
    status,
    removable,
    blocking,
    warnings: toReportWarnings(warnings),
  };
}

/** The API's `X-Unmap-Optimize-Warnings` entries as table rows (a missing count is one). */
export function toReportWarnings(warnings: OptimizeToursWarning[]): ReportWarning[] {
  return warnings.map((w) => ({
    code: w.code,
    ...(w.field !== undefined ? { field: w.field } : {}),
    count: w.count ?? 1,
    message: w.message,
  }));
}
