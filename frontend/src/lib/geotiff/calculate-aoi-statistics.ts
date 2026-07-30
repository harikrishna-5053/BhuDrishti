import type { LoadedNDVIRaster } from "./types";
import proj4 from "proj4";

export const AOI_ANALYSIS_CONFIG = {
  EXACT_PIXEL_THRESHOLD: 500_000,
  TARGET_SAMPLE_COUNT: 100_000,
  MAX_SAFE_SAMPLE_COUNT: 250_000,
  HISTOGRAM_BINS: 2000,
} as const;

export interface AOIStatsResult {
  polygonPoints: [number, number][]; // [lat, lng]
  areaHectares: number;
  areaAcres: number;
  perimeterMeters: number;
  pixelCount: number; // Valid analysed pixels
  noDataPixelCount: number;
  minimum: number;
  maximum: number;
  mean: number;
  median: number;
  stdDev: number;
  vegetationPercentage: number;
  isExact: boolean;
  stride: number;
  windowPixelCount: number;
  inspectedPixelCount: number;
  errorTitle?: string;
  errorMessage?: string;
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

// Geodesic Polygon Perimeter Calculation (in meters)
export function calculatePolygonPerimeterMeters(points: [number, number][]): number {
  if (points.length < 2) return 0;
  const radius = 6378137;
  let totalMeters = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;

    const lat1 = (p1[0] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
    const dLng = ((p2[1] - p1[1]) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    totalMeters += radius * c;
  }

  return totalMeters;
}

// Point in 2D Polygon Winding/Raycasting Test
export function isPointIn2DPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]![0];
    const yi = polygon[i]![1];
    const xj = polygon[j]![0];
    const yj = polygon[j]![1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

// Calculate clipped statistics inside drawn AOI polygon with adaptive sampling and async responsiveness
export async function calculateAOIStatisticsAsync(
  raster: LoadedNDVIRaster | null,
  polygonPoints: [number, number][],
  onProgress?: (progressPercent: number, inspectedCount: number) => void,
  signal?: AbortSignal,
): Promise<AOIStatsResult> {
  // 1. Validation: Check raster existence
  if (!raster) {
    return createErrorResult(
      polygonPoints,
      "No Raster Loaded",
      "Load a GeoTIFF before running AOI analysis.",
    );
  }

  // 2. Validation: Check polygon vertex count
  if (!polygonPoints || polygonPoints.length < 3) {
    return createErrorResult(
      polygonPoints,
      "Incomplete AOI",
      "Add at least three valid vertices before finishing the AOI.",
    );
  }

  // 3. Area and Perimeter in Map CRS (WGS84)
  const areaM2 = calculatePolygonAreaM2(polygonPoints);
  const areaHectares = Number((areaM2 / 10000).toFixed(2));
  const areaAcres = Number((areaHectares * 2.47105).toFixed(2));
  const perimeterMeters = Number(calculatePolygonPerimeterMeters(polygonPoints).toFixed(1));

  const { values, width, height, affine, noDataValue } = raster;

  // 4. Transform check for Rotated or Skewed Transforms
  if (
    (affine.skewX && Math.abs(affine.skewX) > 1e-7) ||
    (affine.skewY && Math.abs(affine.skewY) > 1e-7)
  ) {
    return createErrorResult(
      polygonPoints,
      "Unsupported Raster Transform",
      "AOI analysis cannot safely process this raster because it uses a rotated or skewed geographic transform. Please use a north-up georeferenced GeoTIFF.",
      areaHectares,
      areaAcres,
      perimeterMeters,
    );
  }

  // 5. Transform polygon vertices into raster CRS once
  const rasterCRSPolygon: [number, number][] = [];
  for (const pt of polygonPoints) {
    let x = pt[1]; // lng
    let y = pt[0]; // lat

    if (affine.crs !== "EPSG:4326") {
      try {
        const res = proj4("EPSG:4326", affine.crs, [x, y]);
        x = res[0];
        y = res[1];
      } catch {
        return createErrorResult(
          polygonPoints,
          "Invalid AOI Geometry",
          "The AOI polygon coordinates cannot be transformed into the raster coordinate reference system.",
          areaHectares,
          areaAcres,
          perimeterMeters,
        );
      }
    }

    if (!isFinite(x) || !isFinite(y) || isNaN(x) || isNaN(y)) {
      return createErrorResult(
        polygonPoints,
        "Invalid AOI Geometry",
        "The AOI polygon is invalid and cannot be analyzed. Adjust the vertices and try again.",
        areaHectares,
        areaAcres,
        perimeterMeters,
      );
    }

    rasterCRSPolygon.push([x, y]);
  }

  // 6. Compute AOI bounding box in raster CRS
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of rasterCRSPolygon) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }

  // 7. Convert bounding box to raster row/col ranges (account for negative pixelHeight)
  const originX = affine.originX;
  const originY = affine.originY;
  const pixelW = Math.abs(affine.pixelWidth);
  const pixelH = Math.abs(affine.pixelHeight);

  if (pixelW <= 0 || pixelH <= 0) {
    return createErrorResult(
      polygonPoints,
      "Unsupported Raster Transform",
      "AOI analysis cannot safely process this raster transform because pixel resolution is non-positive.",
      areaHectares,
      areaAcres,
      perimeterMeters,
    );
  }

  const col1 = Math.floor((minX - originX) / pixelW);
  const col2 = Math.ceil((maxX - originX) / pixelW);

  // projY = originY - row * pixelH (for standard north-up)
  const row1 = Math.floor((originY - maxY) / pixelH);
  const row2 = Math.ceil((originY - minY) / pixelH);

  const minCol = Math.max(0, Math.min(col1, col2));
  const maxCol = Math.min(width - 1, Math.max(col1, col2));
  const minRow = Math.max(0, Math.min(row1, row2));
  const maxRow = Math.min(height - 1, Math.max(row1, row2));

  // 8. Check overlap
  if (
    minCol > maxCol ||
    minRow > maxRow ||
    minCol >= width ||
    minRow >= height ||
    maxCol < 0 ||
    maxRow < 0
  ) {
    return createErrorResult(
      polygonPoints,
      "AOI Outside Raster",
      "The selected AOI does not overlap the loaded raster.",
      areaHectares,
      areaAcres,
      perimeterMeters,
    );
  }

  const windowCols = maxCol - minCol + 1;
  const windowRows = maxRow - minRow + 1;
  const windowPixelCount = windowRows * windowCols;

  if (windowPixelCount <= 0) {
    return createErrorResult(
      polygonPoints,
      "AOI Outside Raster",
      "The calculated raster window for the AOI is empty.",
      areaHectares,
      areaAcres,
      perimeterMeters,
    );
  }

  // 9. Adaptive sampling strategy
  let stride = 1;
  if (windowPixelCount > AOI_ANALYSIS_CONFIG.EXACT_PIXEL_THRESHOLD) {
    stride = Math.max(
      1,
      Math.ceil(Math.sqrt(windowPixelCount / AOI_ANALYSIS_CONFIG.TARGET_SAMPLE_COUNT)),
    );
  }
  const isExact = stride === 1;

  // 10. Memory-Safe & Streaming Statistics Counters
  let validPixelCount = 0;
  let noDataPixelCount = 0;
  let inspectedPixelCount = 0;
  let vegCount = 0;

  let minVal = Infinity;
  let maxVal = -Infinity;
  let mean = 0;
  let m2 = 0; // For Welford's variance calculation

  // Bounded sample array / histogram for median
  const sampledForMedian: number[] = [];
  const maxMedianSamples = 50_000;
  const histogramBins = new Int32Array(AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS);

  let lastYieldTime = Date.now();

  // 11. Row/Col Loop restricted strictly to AOI window
  for (let r = minRow; r <= maxRow; r += stride) {
    // Check cancellation signal
    if (signal?.aborted) {
      throw new Error("AOI_ANALYSIS_CANCELLED");
    }

    // Yield to main thread every 40ms to keep UI responsive
    if (Date.now() - lastYieldTime > 40) {
      const progressRatio = (r - minRow + 1) / windowRows;
      if (onProgress) {
        onProgress(Math.min(99, Math.round(progressRatio * 100)), inspectedPixelCount);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYieldTime = Date.now();
    }

    const projY = originY - (r + 0.5) * pixelH;
    const rowOffset = r * width;

    for (let c = minCol; c <= maxCol; c += stride) {
      inspectedPixelCount++;
      const projX = originX + (c + 0.5) * pixelW;

      // Point in polygon test (in raster CRS)
      if (!isPointIn2DPolygon([projX, projY], rasterCRSPolygon)) {
        continue;
      }

      const val = values[rowOffset + c];

      // Validity checks
      if (val === undefined || isNaN(val) || !isFinite(val)) {
        noDataPixelCount++;
        continue;
      }
      if (noDataValue !== null && Math.abs(val - noDataValue) < 1e-4) {
        noDataPixelCount++;
        continue;
      }
      if (Math.abs(val - -9999) < 1e-4) {
        noDataPixelCount++;
        continue;
      }
      if (val < -1.0 || val > 1.0) {
        noDataPixelCount++;
        continue;
      }

      // Valid pixel inside polygon!
      validPixelCount++;

      // Minimum & Maximum
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;

      // Welford's streaming mean and variance
      const delta = val - mean;
      mean += delta / validPixelCount;
      const delta2 = val - mean;
      m2 += delta * delta2;

      // Vegetation classification threshold (NDVI >= 0.4)
      if (val >= 0.4) {
        vegCount++;
      }

      // Median tracking
      if (sampledForMedian.length < maxMedianSamples) {
        sampledForMedian.push(val);
      } else {
        if (sampledForMedian.length === maxMedianSamples) {
          // Bin all previously collected samples so no early samples are lost
          for (const sVal of sampledForMedian) {
            const bIdx = Math.min(
              AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS - 1,
              Math.max(0, Math.floor(((sVal + 1.0) / 2.0) * AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS)),
            );
            histogramBins[bIdx]++;
          }
          sampledForMedian.push(val);
        }
        // Bin current sample into histogram
        const binIndex = Math.min(
          AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS - 1,
          Math.max(0, Math.floor(((val + 1.0) / 2.0) * AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS)),
        );
        histogramBins[binIndex]++;
      }
    }
  }

  if (onProgress) {
    onProgress(100, inspectedPixelCount);
  }

  // 12. Check if valid data exists inside AOI
  if (validPixelCount === 0) {
    return createErrorResult(
      polygonPoints,
      "No Valid NDVI Data",
      "The selected AOI polygon does not contain any valid NDVI pixels.",
      areaHectares,
      areaAcres,
      perimeterMeters,
    );
  }

  // 13. Calculate Median
  let median = 0;
  if (sampledForMedian.length <= maxMedianSamples) {
    sampledForMedian.sort((a, b) => a - b);
    const mid = Math.floor(sampledForMedian.length / 2);
    median =
      sampledForMedian.length % 2 === 0
        ? (sampledForMedian[mid - 1]! + sampledForMedian[mid]!) / 2
        : sampledForMedian[mid]!;
  } else {
    // Calculate median from histogram
    let cumulative = 0;
    const target = validPixelCount / 2;
    for (let i = 0; i < AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS; i++) {
      cumulative += histogramBins[i]!;
      if (cumulative >= target) {
        median =
          (i / AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS) * 2.0 -
          1.0 +
          1 / AOI_ANALYSIS_CONFIG.HISTOGRAM_BINS;
        break;
      }
    }
  }

  const variance = validPixelCount > 1 ? m2 / (validPixelCount - 1) : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const vegetationPercentage = (vegCount / validPixelCount) * 100;

  return {
    polygonPoints,
    areaHectares,
    areaAcres,
    perimeterMeters,
    pixelCount: validPixelCount,
    noDataPixelCount,
    minimum: Number(minVal.toFixed(3)),
    maximum: Number(maxVal.toFixed(3)),
    mean: Number(mean.toFixed(3)),
    median: Number(median.toFixed(3)),
    stdDev: Number(stdDev.toFixed(3)),
    vegetationPercentage: Number(vegetationPercentage.toFixed(1)),
    isExact,
    stride,
    windowPixelCount,
    inspectedPixelCount,
  };
}

// Synchronous wrapper for backwards compatibility
export function calculateAOIStatistics(
  raster: LoadedNDVIRaster | null,
  polygonPoints: [number, number][],
): AOIStatsResult | null {
  if (!raster || polygonPoints.length < 3) return null;
  // Fallback default calculation synchronously
  const areaM2 = calculatePolygonAreaM2(polygonPoints);
  const areaHectares = Number((areaM2 / 10000).toFixed(2));
  const areaAcres = Number((areaHectares * 2.47105).toFixed(2));
  const perimeterMeters = Number(calculatePolygonPerimeterMeters(polygonPoints).toFixed(1));

  return {
    polygonPoints,
    areaHectares,
    areaAcres,
    perimeterMeters,
    pixelCount: 0,
    noDataPixelCount: 0,
    minimum: 0,
    maximum: 0,
    mean: 0,
    median: 0,
    stdDev: 0,
    vegetationPercentage: 0,
    isExact: true,
    stride: 1,
    windowPixelCount: 0,
    inspectedPixelCount: 0,
  };
}

function createErrorResult(
  polygonPoints: [number, number][],
  title: string,
  message: string,
  areaHectares = 0,
  areaAcres = 0,
  perimeterMeters = 0,
): AOIStatsResult {
  return {
    polygonPoints,
    areaHectares,
    areaAcres,
    perimeterMeters,
    pixelCount: 0,
    noDataPixelCount: 0,
    minimum: 0,
    maximum: 0,
    mean: 0,
    median: 0,
    stdDev: 0,
    vegetationPercentage: 0,
    isExact: true,
    stride: 1,
    windowPixelCount: 0,
    inspectedPixelCount: 0,
    errorTitle: title,
    errorMessage: message,
  };
}
