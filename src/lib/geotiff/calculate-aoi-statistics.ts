import type { LoadedNDVIRaster } from "./types";
import proj4 from "proj4";

export interface AOIStatsResult {
  polygonPoints: [number, number][]; // [lat, lng]
  areaHectares: number;
  areaAcres: number;
  pixelCount: number;
  minimum: number;
  maximum: number;
  mean: number;
  median: number;
  vegetationPercentage: number;
}

// Geodesic Polygon Area Calculation (in m²)
export function calculatePolygonAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const radius = 6378137; // Earth radius in meters
  let area = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;

    const lat1 = (p1[0] * Math.PI) / 180;
    const lng1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const lng2 = (p2[1] * Math.PI) / 180;

    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = (Math.abs(area) * radius * radius) / 2;
  return area;
}

// Point in Polygon Winding Number Test
export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const x = point[1]; // lng
  const y = point[0]; // lat
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![1];
    const yi = polygon[i]![0];
    const xj = polygon[j]![1];
    const yj = polygon[j]![0];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

// Calculate clipped statistics inside drawn AOI polygon
export function calculateAOIStatistics(
  raster: LoadedNDVIRaster,
  polygonPoints: [number, number][],
): AOIStatsResult | null {
  if (!raster || polygonPoints.length < 3) return null;

  const areaM2 = calculatePolygonAreaM2(polygonPoints);
  const areaHectares = areaM2 / 10000;
  const areaAcres = areaHectares * 2.47105;

  const { values, width, height, affine, noDataValue } = raster;
  const sampledValues: number[] = [];

  // Determine bounding box of polygon in lat/lng
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const pt of polygonPoints) {
    if (pt[0] < minLat) minLat = pt[0];
    if (pt[0] > maxLat) maxLat = pt[0];
    if (pt[1] < minLng) minLng = pt[1];
    if (pt[1] > maxLng) maxLng = pt[1];
  }

  // Iterate over raster cells within bounding box
  for (let row = 0; row < height; row++) {
    const projY = affine.originY - (row + 0.5) * affine.pixelHeight;

    for (let col = 0; col < width; col++) {
      const projX = affine.originX + (col + 0.5) * affine.pixelWidth;

      let lng = projX;
      let lat = projY;

      if (affine.crs !== "EPSG:4326") {
        try {
          const res = proj4(affine.crs, "EPSG:4326", [projX, projY]);
          lng = res[0];
          lat = res[1];
        } catch {
          continue;
        }
      }

      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;

      if (isPointInPolygon([lat, lng], polygonPoints)) {
        const idx = row * width + col;
        const v = values[idx];

        if (v === undefined || isNaN(v) || !isFinite(v)) continue;
        if (noDataValue !== null && Math.abs(v - noDataValue) < 1e-4) continue;
        if (Math.abs(v - -9999) < 1e-4) continue;
        if (v < -1.0 || v > 1.0) continue;

        sampledValues.push(v);
      }
    }
  }

  if (sampledValues.length === 0) {
    return {
      polygonPoints,
      areaHectares: Number(areaHectares.toFixed(2)),
      areaAcres: Number(areaAcres.toFixed(2)),
      pixelCount: 0,
      minimum: 0,
      maximum: 0,
      mean: 0,
      median: 0,
      vegetationPercentage: 0,
    };
  }

  sampledValues.sort((a, b) => a - b);
  const min = sampledValues[0]!;
  const max = sampledValues[sampledValues.length - 1]!;
  const mean = sampledValues.reduce((s, v) => s + v, 0) / sampledValues.length;
  const median = sampledValues[Math.floor(sampledValues.length / 2)]!;
  const vegCount = sampledValues.filter((v) => v >= 0.4).length;
  const vegetationPercentage = (vegCount / sampledValues.length) * 100;

  return {
    polygonPoints,
    areaHectares: Number(areaHectares.toFixed(2)),
    areaAcres: Number(areaAcres.toFixed(2)),
    pixelCount: sampledValues.length,
    minimum: Number(min.toFixed(3)),
    maximum: Number(max.toFixed(3)),
    mean: Number(mean.toFixed(3)),
    median: Number(median.toFixed(3)),
    vegetationPercentage: Number(vegetationPercentage.toFixed(1)),
  };
}
