import type { FieldIssue, FieldRef } from "./report";
import type { Json } from "./load";
import { isRecord, keyOf } from "./names";

/**
 * Deletes the field a chain names. Returns false when it is not there or is not a plain field or
 * map entry. An array element (`shipments[3]` as the last link) is never spliced out: that would
 * shift the indices of every later issue, and no removable error points at one.
 */
function deleteAt(root: Json, chain: FieldRef): boolean {
  let holder: unknown = root;
  for (let node: FieldRef | undefined = chain; node; node = node.subField) {
    if (!isRecord(holder)) return false;
    const key = keyOf(holder, node.name);
    if (key === undefined) return false;
    const last = node.subField === undefined;
    if (last && node.index === undefined && node.key === undefined) {
      delete holder[key];
      return true;
    }
    let child: unknown = holder[key];
    if (node.index !== undefined) {
      if (!Array.isArray(child)) return false;
      if (last) return false;
      child = child[node.index];
    }
    if (node.key !== undefined) {
      if (!isRecord(child) || !Object.prototype.hasOwnProperty.call(child, node.key)) return false;
      if (last) {
        delete child[node.key];
        return true;
      }
      child = child[node.key];
    }
    holder = child;
  }
  return false;
}

/** A copy of the request with each issue's field deleted. The input is never changed. */
export function stripFields(request: Json, issues: FieldIssue[]): { request: Json; removed: string[] } {
  const copy = structuredClone(request);
  const removed: string[] = [];
  for (const issue of issues) {
    let any = false;
    for (const chain of issue.fields) if (deleteAt(copy, chain)) any = true;
    if (any && !removed.includes(issue.path)) removed.push(issue.path);
  }
  return { request: copy, removed };
}

/**
 * Which removable issues `stripFields` can actually delete from this request, and which it cannot
 * (a chain that does not resolve, or that names an array element). It runs the same deletion on a
 * copy, so the count on the button and what a click deletes always agree.
 */
export function removablePaths(request: Json, issues: FieldIssue[]): { paths: string[]; stuck: FieldIssue[] } {
  const { removed } = stripFields(request, issues);
  return { paths: removed, stuck: issues.filter((issue) => !removed.includes(issue.path)) };
}
