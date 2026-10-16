import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSample, SAMPLES } from "../lib/scenario/samples";

const data = join(__dirname, "..", "data");
const corpus = join(__dirname, "..", "..", "..", "packages", "optimize-conformance", "corpus", "examples");

describe("bundled samples", () => {
  it("has one sample per data file", () => {
    expect(SAMPLES.map((s) => s.file).sort()).toEqual(readdirSync(data).filter((f) => f.endsWith(".json")).sort());
  });

  // The corpus lives in the monorepo only; a public clone has no packages/ directory.
  describe.skipIf(!existsSync(corpus))("conformance corpus", () => {
    for (const sample of SAMPLES) {
      it(`${sample.file} is byte-identical to the conformance corpus example ${sample.id}.json`, () => {
        expect(sample.file).toBe(`${sample.id}.sample.json`);
        expect(readFileSync(join(data, sample.file)).equals(readFileSync(join(corpus, `${sample.id}.json`)))).toBe(true);
      });
    }
  });

  for (const sample of SAMPLES) {

    it(`${sample.id} loads as a request with a title in both languages`, () => {
      const loaded = loadSample(sample.id);
      expect(loaded?.request).toHaveProperty("model");
      expect(loaded?.source).toEqual({ kind: "sample", name: sample.file });
      expect(sample.title.en.length).toBeGreaterThan(0);
      expect(sample.title.fr.length).toBeGreaterThan(0);
    });
  }

  it("returns null for an unknown id", () => {
    expect(loadSample("nope")).toBeNull();
  });
});
