import type { NDVIRasterStatistics, NDVIRasterHistogramBin } from "./types";

const LARGE_RASTER_PIXEL_THRESHOLD = 5_000_000;
const HISTOGRAM_BIN_COUNT = 25;
const MIN_NDVI = -1.0;
const MAX_NDVI = 1.0;

export function calculateNDVIRasterStatistics(
  values: Float32Array,
  noDataValue: number | null,
  vegThreshold = 0.20
): NDVIRasterStatistics {
  const totalPixels = values.length;
  const isSampled = totalPixels > LARGE_RASTER_PIXEL_THRESHOLD;
  const stride = isSampled ? Math.ceil(totalPixels / 2_000_000) : 1;

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let validCount = 0;
  let noDataCount = 0;
  let vegCount = 0;

  // Initialize histogram bins [-1.0 to 1.0]
  const binWidth = (MAX_NDVI - MIN_NDVI) / HISTOGRAM_BIN_COUNT;
  const histogramCounts = new Uint32Array(HISTOGRAM_BIN_COUNT);

  // Fallback no-data values to filter out
  const isNoData = (v: number) => {
    if (isNaN(v) || !isFinite(v)) return true;
    if (noDataValue !== null && Math.abs(v - noDataValue) < 1e-4) return true;
    if (Math.abs(v - -9999) < 1e-4) return true;
    if (v < -1.0 || v > 1.0) return true; // Outside valid NDVI range
    return false;
  };

  // Pass 1: Min, Max, Sum, Counts, Histogram
  for (let i = 0; i < totalPixels; i += stride) {
    const val = values[i]!;
    if (isNoData(val)) {
      noDataCount++;
      continue;
    }

    validCount++;
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;

    if (val >= vegThreshold) {
      vegCount++;
    }

    // Bin index computation
    const binIdx = Math.min(
      HISTOGRAM_BIN_COUNT - 1,
      Math.max(0, Math.floor((val - MIN_NDVI) / binWidth))
    );
    histogramCounts[binIdx]!++;
  }

  if (validCount === 0) {
    // Edge case: empty or fully no-data raster
    return {
      minimum: 0,
      maximum: 0,
      mean: 0,
      median: 0,
      standardDeviation: 0,
      validPixelCount: 0,
      noDataPixelCount: totalPixels,
      vegetationPixelCount: 0,
      vegetationPercentage: 0,
      isSampled,
      histogram: Array.from({ length: HISTOGRAM_BIN_COUNT }, (_, i) => ({
        binStart: MIN_NDVI + i * binWidth,
        binEnd: MIN_NDVI + (i + 1) * binWidth,
        binCenter: MIN_NDVI + (i + 0.5) * binWidth,
        count: 0,
      })),
    };
  }

  const mean = sum / validCount;

  // Pass 2: Variance & Standard Deviation
  let sqDiffSum = 0;
  for (let i = 0; i < totalPixels; i += stride) {
    const val = values[i]!;
    if (isNoData(val)) continue;
    sqDiffSum += (val - mean) ** 2;
  }
  const variance = sqDiffSum / validCount;
  const standardDeviation = Math.sqrt(variance);

  // Approximate Median via Histogram to avoid sorting large array
  const medianTarget = Math.floor(validCount / 2);
  let accumulated = 0;
  let median = mean;
  for (let i = 0; i < HISTOGRAM_BIN_COUNT; i++) {
    accumulated += histogramCounts[i]!;
    if (accumulated >= medianTarget) {
      median = MIN_NDVI + (i + 0.5) * binWidth;
      break;
    }
  }

  // Format histogram output
  const histogram: NDVIRasterHistogramBin[] = [];
  for (let i = 0; i < HISTOGRAM_BIN_COUNT; i++) {
    const start = MIN_NDVI + i * binWidth;
    const end = MIN_NDVI + (i + 1) * binWidth;
    histogram.push({
      binStart: start,
      binEnd: end,
      binCenter: start + binWidth / 2,
      count: histogramCounts[i]!,
    });
  }

  const vegPercentage = (vegCount / validCount) * 100;

  return {
    minimum: Number(min.toFixed(4)),
    maximum: Number(max.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    standardDeviation: Number(standardDeviation.toFixed(4)),
    validPixelCount: isSampled ? validCount * stride : validCount,
    noDataPixelCount: isSampled ? noDataCount * stride : noDataCount,
    vegetationPixelCount: isSampled ? vegCount * stride : vegCount,
    vegetationPercentage: Number(vegPercentage.toFixed(1)),
    isSampled,
    histogram,
  };
}
