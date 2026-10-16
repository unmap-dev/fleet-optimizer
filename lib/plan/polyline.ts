/**
 * Decodes a Google encoded polyline (the format in `routePolyline.points`) into `[lng, lat]`
 * pairs, the order GeoJSON and MapLibre use. `precision` is the number of decimal digits the
 * encoder kept: 5 for Google's routes, 6 for some other engines.
 */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result += (byte & 0x1f) * 2 ** shift;
      shift += 5;
    } while (byte >= 0x20);
    return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    out.push([lng / factor, lat / factor]);
  }
  return out;
}
