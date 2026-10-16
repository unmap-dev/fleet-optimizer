import { describe, expect, it } from "vitest";
import { decodePolyline } from "../lib/plan/polyline";

describe("decodePolyline", () => {
  it("decodes Google's documented example, as [lng, lat]", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("honours precision 6 with exact coordinates", () => {
    // The same three points as the precision 5 example, encoded with six decimals.
    expect(decodePolyline("_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI", 6)).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("gives an empty line for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
