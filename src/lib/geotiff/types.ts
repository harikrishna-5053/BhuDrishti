/**
 * Core GeoTIFF Data Models & Interfaces for BhuDrishti
 */

export interface RasterBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface AffineTransform {
  originX: number;
  originY: number;
  pixelWidth: number;
  pixelHeight: number;
  crs: string;
  skewX?: number;
  skewY?: number;
}

export interface SelectedPixelInfo {
  lat: number;
  lng: number;
  row: number;
  col: number;
  value: number | null;
  vegClass: string;
  isNoData: boolean;
}

export type SelectedPixel = SelectedPixelInfo;

export interface NDVIRasterHistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
}

export interface NDVIRasterStatistics {
  minimum: number;
  maximum: number;
  mean: number;
  median?: number;
  stdDev: number;
  standardDeviation?: number;
  isSampled?: boolean;
  validPixelCount: number;
  noDataPixelCount: number;
  histogram: NDVIRasterHistogramBin[];
  vegetationPercentage: number;
}

export interface LoadedNDVIRaster {
  id: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  bandCount: number;
  crs: string;
  noDataValue: number | null;
  nativeBounds: RasterBounds;
  geoBounds: RasterBounds;
  affine: AffineTransform;
  values: Float32Array;
  statistics: NDVIRasterStatistics;
  georasterObj: unknown;
  loadedAt: string;
}
