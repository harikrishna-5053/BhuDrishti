export type RasterBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type AffineTransform = {
  originX: number;
  originY: number;
  pixelWidth: number;
  pixelHeight: number;
  crs: string; // e.g. "EPSG:4326" or "EPSG:32644"
  projDefinition?: string; // Proj4 string if required
};

export type NDVIRasterHistogramBin = {
  binStart: number;
  binEnd: number;
  binCenter: number;
  count: number;
};

export type NDVIRasterStatistics = {
  minimum: number;
  maximum: number;
  mean: number;
  median: number;
  standardDeviation: number;
  validPixelCount: number;
  noDataPixelCount: number;
  vegetationPixelCount: number;
  vegetationPercentage: number;
  isSampled: boolean;
  histogram: NDVIRasterHistogramBin[];
};

export type LoadedNDVIRaster = {
  id: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  bandCount: number;
  crs: string;
  noDataValue: number | null;
  nativeBounds: RasterBounds;
  geoBounds: RasterBounds; // EPSG:4326 bounds
  affine: AffineTransform;
  values: Float32Array;
  statistics: NDVIRasterStatistics;
  georasterObj?: any;
  loadedAt: string;
};

export type SelectedPixel = {
  lat: number;
  lng: number;
  row: number;
  col: number;
  value: number | null;
  vegClass: string | null;
  isNoData: boolean;
};
