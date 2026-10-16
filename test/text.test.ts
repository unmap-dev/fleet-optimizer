import { describe, expect, it } from "vitest";
import { TEXT } from "../lib/text";

const EM_DASH = String.fromCharCode(0x2014);

type Tree = { [key: string]: string | Tree };

/** Every path to a string, e.g. `kinds.point`; nested objects are walked. */
function paths(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : paths(value, `${prefix}${key}.`),
  );
}

function strings(tree: Tree): string[] {
  return Object.values(tree).flatMap((value) => (typeof value === "string" ? [value] : strings(value)));
}

describe("TEXT", () => {
  it("has the same keys in English and French, recursively", () => {
    expect(paths(TEXT.fr).sort()).toEqual(paths(TEXT.en).sort());
  });

  it("has no empty string and no em dash", () => {
    for (const lang of ["en", "fr"] as const) {
      for (const value of strings(TEXT[lang])) {
        expect(value.length).toBeGreaterThan(0);
        expect(value).not.toContain(EM_DASH);
      }
    }
  });
});
