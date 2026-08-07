import { fromBlob } from "geotiff";
import proj4 from "proj4";

import type { LoadedNDVIRaster, RasterBounds, AffineTransform } from "./types";

import { calculateNDVIRasterStatistics } from "./calculate-raster-statistics";
import { GeoTIFFValidationError } from "./errors";
import { extractCRSInfo, validateGeoTIFFCRS } from "./crs-registry";

import {
  validateRasterDimensions,
  validateGeotransform,
  validateSourceBounds,
  validateTransformedBounds,
} from "./validators";

import type { LogLevel } from "@/lib/types";

export type GeoTIFFLogCallback = (level: LogLevel, msg: string) => void;

/* ============================================================
   CONFIGURATION
   ============================================================ */

const FULL_RES_PIXEL_LIMIT = 20_000_000;

/*
 * Medium rasters can still be downsampled directly
 * when they do not have internal overviews.
 *
 * This keeps normal Sentinel-2 tile viewing working.
 */
const DIRECT_DOWNSAMPLE_PIXEL_LIMIT = 250_000_000;

/*
 * Maximum dimension for browser visualization.
 */
const MAX_PREVIEW_DIMENSION = 4096;

/*
 * Maximum number of raster values kept in browser memory.
 */
const MAX_PREVIEW_PIXELS = 12_000_000;

const DEFAULT_NODATA = -9999.0;

/* ============================================================
   INTERNAL TYPES
   ============================================================ */

interface GeoTIFFImageInterface {
  getWidth(): number;

  getHeight(): number;

  getBoundingBox?(): [number, number, number, number];

  getGeoKeys?(): Record<string, number | string>;

  getGDALNoData?(): number | null;

  getSamplesPerPixel?(): number;

  readRasters(options?: {
    samples?: number[];
    width?: number;
    height?: number;
    resampleMethod?: string;
    interleave?: boolean;
  }): Promise<unknown>;

  fileDirectory?: {
    ModelTransformation?: number[];
    GDAL_NODATA?: string | number;
    SamplesPerPixel?: number;
  };
}

interface FastGeoRasterObject {
  width: number;

  height: number;

  numberOfRasters: number;

  xmin: number;

  ymin: number;

  xmax: number;

  ymax: number;

  pixelWidth: number;

  pixelHeight: number;

  projection: unknown;

  values: Array<Array<Float32Array>>;

  noDataValue: number;
}

/* ============================================================
   ERROR HELPER
   ============================================================ */

function createValidationError(
  title: string,
  userMessage: string,
  originalError?: unknown,
): GeoTIFFValidationError {
  return new GeoTIFFValidationError({
    code: "INVALID_GEOTIFF",
    title,
    userMessage,
    originalError,
  });
}

/* ============================================================
   PREVIEW SIZE
   ============================================================ */

function calculatePreviewSize(
  width: number,
  height: number,
): {
  width: number;
  height: number;
} {
  const scaleByDimension = Math.min(
    1,
    MAX_PREVIEW_DIMENSION / width,
    MAX_PREVIEW_DIMENSION / height,
  );

  const totalPixels = width * height;

  const scaleByPixels = Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / totalPixels));

  const scale = Math.min(scaleByDimension, scaleByPixels);

  return {
    width: Math.max(1, Math.round(width * scale)),

    height: Math.max(1, Math.round(height * scale)),
  };
}

/* ============================================================
   FLAT BAND -> ROWS
   ============================================================ */

function flatBandToRows(flat: Float32Array, width: number, height: number): Array<Float32Array> {
  const rows = new Array<Float32Array>(height);

  for (let row = 0; row < height; row++) {
    const start = row * width;

    rows[row] = flat.subarray(start, start + width);
  }

  return rows;
}

/* ============================================================
   NODATA
   ============================================================ */

function getNoDataValue(image: GeoTIFFImageInterface): number {
  try {
    if (image.getGDALNoData) {
      const value = image.getGDALNoData();

      if (value !== null && value !== undefined && Number.isFinite(value)) {
        return Number(value);
      }
    }
  } catch {
    // Continue with metadata fallback.
  }

  const raw = image.fileDirectory?.GDAL_NODATA;

  if (raw !== undefined && raw !== null) {
    const parsed = Number(raw);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return DEFAULT_NODATA;
}

/* ============================================================
   BOUNDS
   ============================================================ */

function getImageBounds(image: GeoTIFFImageInterface): RasterBounds {
  if (!image.getBoundingBox) {
    throw createValidationError(
      "Missing GeoTIFF Bounds",
      "The selected GeoTIFF does not provide readable geographic bounds.",
    );
  }

  const bbox = image.getBoundingBox();

  if (!bbox || bbox.length !== 4) {
    throw createValidationError(
      "Invalid GeoTIFF Bounds",
      "The selected GeoTIFF has invalid geographic bounds.",
    );
  }

  const [x1, y1, x2, y2] = bbox;

  const bounds: RasterBounds = {
    west: Math.min(x1, x2),
    south: Math.min(y1, y2),
    east: Math.max(x1, x2),
    north: Math.max(y1, y2),
  };

  validateSourceBounds(bounds);

  return bounds;
}

/* ============================================================
   RASTER BAND EXTRACTION
   ============================================================ */

function extractSingleBand(rasterResult: unknown): Float32Array {
  const rasters = rasterResult as ArrayLike<ArrayLike<number>>;

  const rawBand = rasters?.[0];

  if (!rawBand) {
    throw createValidationError("Raster Read Failure", "The NDVI raster band could not be read.");
  }

  if (rawBand instanceof Float32Array) {
    return rawBand;
  }

  return Float32Array.from(rawBand);
}

/* ============================================================
   NDVI VALIDATION
   ============================================================ */

function normalizeNDVIBand(input: Float32Array, noDataValue: number): Float32Array {
  const output = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) {
    const value = input[i]!;

    const isNoData =
      !Number.isFinite(value) || value === DEFAULT_NODATA || Math.abs(value - noDataValue) < 1e-5;

    if (isNoData) {
      output[i] = DEFAULT_NODATA;
      continue;
    }

    /*
     * Only genuine NDVI values are accepted.
     * No RGB -> pseudo-NDVI conversion.
     */
    if (value < -1.0 || value > 1.0) {
      output[i] = DEFAULT_NODATA;
      continue;
    }

    output[i] = value;
  }

  return output;
}

/* ============================================================
   CRS BOUNDS TRANSFORMATION
   ============================================================ */

function transformBoundsToWGS84(nativeBounds: RasterBounds, validatedCrs: string): RasterBounds {
  if (validatedCrs === "EPSG:4326") {
    return {
      ...nativeBounds,
    };
  }

  const points: [number, number][] = [
    [nativeBounds.west, nativeBounds.south],

    [nativeBounds.east, nativeBounds.north],

    [nativeBounds.west, nativeBounds.north],

    [nativeBounds.east, nativeBounds.south],

    [(nativeBounds.west + nativeBounds.east) / 2, nativeBounds.south],

    [(nativeBounds.west + nativeBounds.east) / 2, nativeBounds.north],

    [nativeBounds.west, (nativeBounds.south + nativeBounds.north) / 2],

    [nativeBounds.east, (nativeBounds.south + nativeBounds.north) / 2],

    [(nativeBounds.west + nativeBounds.east) / 2, (nativeBounds.south + nativeBounds.north) / 2],
  ];

  const transformed = points.map(([x, y]) => {
    const result = proj4(validatedCrs, "EPSG:4326", [x, y]);

    const lon = result[0];
    const lat = result[1];

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error(`Transformation returned non-finite coordinate [${lon}, ${lat}]`);
    }

    return [lon, lat] as [number, number];
  });

  const longitudes = transformed.map((point) => point[0]);

  const latitudes = transformed.map((point) => point[1]);

  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

/* ============================================================
   MAIN GEOTIFF LOADER
   ============================================================ */

export async function readNDVIGeoTIFF(
  file: File,
  logCallback?: GeoTIFFLogCallback,
): Promise<LoadedNDVIRaster> {
  /* ----------------------------------------------------------
     1. VALIDATE FILE
     ---------------------------------------------------------- */

  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext !== "tif" && ext !== "tiff") {
    throw createValidationError(
      "Invalid File Type",
      "The selected file is not a TIFF file. Please select a .tif or .tiff file.",
    );
  }

  if (file.size === 0) {
    throw createValidationError("Empty File", "The selected file is empty (0 bytes).");
  }

  const fileSizeMB = file.size / (1024 * 1024);

  logCallback?.("INFO", `Reading local GeoTIFF: ${file.name} (${fileSizeMB.toFixed(1)} MB)`);

  logCallback?.("INFO", "Reading GeoTIFF metadata...");

  /* ----------------------------------------------------------
     2. OPEN TIFF USING BLOB RANDOM ACCESS
     ---------------------------------------------------------- */

  let tiff: any;

  try {
    tiff = await fromBlob(file);
  } catch (err) {
    throw createValidationError("GeoTIFF Open Failure", "The GeoTIFF could not be opened.", err);
  }

  /* ----------------------------------------------------------
     3. READ BASE IMAGE
     ---------------------------------------------------------- */

  let baseImage: GeoTIFFImageInterface;

  try {
    baseImage = (await tiff.getImage(0)) as GeoTIFFImageInterface;
  } catch (err) {
    throw createValidationError(
      "Invalid GeoTIFF Structure",
      "The GeoTIFF image structure could not be read.",
      err,
    );
  }

  const sourceWidth = baseImage.getWidth();

  const sourceHeight = baseImage.getHeight();

  const sourcePixels = sourceWidth * sourceHeight;

  validateRasterDimensions(sourceWidth, sourceHeight);

  logCallback?.("INFO", `Source raster dimensions: ${sourceWidth} × ${sourceHeight}`);

  /* ----------------------------------------------------------
     4. ROTATION CHECK
     ---------------------------------------------------------- */

  const modelTransformation = baseImage.fileDirectory?.ModelTransformation;

  if (modelTransformation && (modelTransformation[1] !== 0 || modelTransformation[4] !== 0)) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Unsupported Raster Orientation",
      userMessage:
        "The selected GeoTIFF contains rotated or skewed projection vectors. Only north-up rasters are currently supported.",
    });
  }

  /* ----------------------------------------------------------
     5. REQUIRE SINGLE-BAND NDVI
     ---------------------------------------------------------- */

  const samplesPerPixel = baseImage.getSamplesPerPixel
    ? baseImage.getSamplesPerPixel()
    : (baseImage.fileDirectory?.SamplesPerPixel ?? 1);

  if (samplesPerPixel !== 1) {
    throw createValidationError(
      "Unsupported Raster",
      `BhuDrishti Local NDVI Viewer requires a single-band NDVI GeoTIFF. This file contains ${samplesPerPixel} bands.`,
    );
  }

  /* ----------------------------------------------------------
     6. SOURCE BOUNDS
     ---------------------------------------------------------- */

  const nativeBounds = getImageBounds(baseImage);

  /* ----------------------------------------------------------
     7. CRS
     ---------------------------------------------------------- */

  const geoKeys = baseImage.getGeoKeys ? baseImage.getGeoKeys() : {};

  const projectionCandidate = geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey ?? null;

  const crsInfo = extractCRSInfo(projectionCandidate, geoKeys);

  let validatedCrs: string;

  try {
    validatedCrs = validateGeoTIFFCRS(crsInfo);

    logCallback?.("INFO", `CRS detected: ${validatedCrs}`);
  } catch (err) {
    if (crsInfo.detectedCode === 32767 || crsInfo.isUserDefined) {
      logCallback?.("WARN", "CRS code detected: 32767");
    }

    logCallback?.("ERROR", "Validation failed: Unsupported or missing CRS.");

    throw err;
  }

  /* ----------------------------------------------------------
     8. WGS84 BOUNDS
     ---------------------------------------------------------- */

  let geoBounds: RasterBounds;

  try {
    if (validatedCrs === "EPSG:4326") {
      logCallback?.("INFO", "CRS transformation not required.");
    } else {
      logCallback?.("INFO", `Transforming bounds from ${validatedCrs} to EPSG:4326...`);
    }

    geoBounds = transformBoundsToWGS84(nativeBounds, validatedCrs);

    validateTransformedBounds(geoBounds, validatedCrs);
  } catch (err) {
    if (err instanceof GeoTIFFValidationError) {
      throw err;
    }

    throw new GeoTIFFValidationError({
      code: "TRANSFORMATION_FAILED",
      title: "Coordinate Transformation Failed",
      userMessage: `BhuDrishti could not transform coordinates from ${validatedCrs} to EPSG:4326 safely.`,
      detectedCrs: validatedCrs,
      technicalDetails: err instanceof Error ? err.message : String(err),
      originalError: err,
    });
  }

  /* ----------------------------------------------------------
     9. DECIDE FULL RESOLUTION OR PREVIEW
     ---------------------------------------------------------- */

  const previewTarget = calculatePreviewSize(sourceWidth, sourceHeight);

  const needsPreview = sourcePixels > FULL_RES_PIXEL_LIMIT;

  if (needsPreview) {
    logCallback?.(
      "WARN",
      `Large raster detected (${sourceWidth} × ${sourceHeight}). Fast preview mode enabled.`,
    );

    logCallback?.("INFO", `Visualization target: ${previewTarget.width} × ${previewTarget.height}`);
  } else {
    logCallback?.("INFO", "Raster is small enough for full-resolution loading.");
  }

  /* ----------------------------------------------------------
     10. FIND BEST INTERNAL OVERVIEW
     ---------------------------------------------------------- */

  let selectedImage = baseImage;

  let selectedImageIndex = 0;

  let readWidth = sourceWidth;

  let readHeight = sourceHeight;

  let useDirectDownsample = false;

  if (needsPreview) {
    let imageCount = 1;

    try {
      imageCount = await tiff.getImageCount();

      logCallback?.("INFO", `GeoTIFF image/overview levels detected: ${imageCount}`);
    } catch (err) {
      logCallback?.(
        "WARN",
        `Could not inspect internal overviews: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let bestImage: GeoTIFFImageInterface | null = null;

    let bestIndex = -1;

    let bestPixelCount = -1;

    for (let index = 1; index < imageCount; index++) {
      try {
        const overview = (await tiff.getImage(index)) as GeoTIFFImageInterface;

        const overviewWidth = overview.getWidth();

        const overviewHeight = overview.getHeight();

        const overviewPixels = overviewWidth * overviewHeight;

        logCallback?.("INFO", `Overview ${index}: ${overviewWidth} × ${overviewHeight}`);

        /*
         * Choose the highest-resolution overview
         * which is still safe for browser memory.
         */

        if (
          overviewWidth <= MAX_PREVIEW_DIMENSION &&
          overviewHeight <= MAX_PREVIEW_DIMENSION &&
          overviewPixels <= MAX_PREVIEW_PIXELS &&
          overviewPixels > bestPixelCount
        ) {
          bestImage = overview;

          bestIndex = index;

          bestPixelCount = overviewPixels;
        }
      } catch (err) {
        logCallback?.(
          "WARN",
          `Could not inspect overview ${index}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    /* --------------------------------------------------------
       INTERNAL OVERVIEW FOUND
       -------------------------------------------------------- */

    if (bestImage !== null && bestIndex > 0) {
      selectedImage = bestImage;

      selectedImageIndex = bestIndex;

      readWidth = selectedImage.getWidth();

      readHeight = selectedImage.getHeight();

      logCallback?.(
        "SUCCESS",
        `Using internal overview ${selectedImageIndex}: ${readWidth} × ${readHeight}`,
      );
    }

    /* --------------------------------------------------------
       MEDIUM RASTER WITHOUT OVERVIEW
       -------------------------------------------------------- */
    else if (sourcePixels <= DIRECT_DOWNSAMPLE_PIXEL_LIMIT) {
      selectedImage = baseImage;

      selectedImageIndex = 0;

      readWidth = previewTarget.width;

      readHeight = previewTarget.height;

      useDirectDownsample = true;

      logCallback?.(
        "WARN",
        "No suitable internal overview found. Using browser downsampling for this medium-size raster.",
      );
    }

    /* --------------------------------------------------------
       HUGE TIFF WITHOUT OVERVIEW
       -------------------------------------------------------- */
    else {
      throw createValidationError(
        "Large Raster Requires Overviews",
        "This GeoTIFF is too large for direct browser decoding and no usable internal overview was found. Create GeoTIFF overviews before loading it.",
      );
    }
  }

  /* ----------------------------------------------------------
     11. READ RASTER
     ---------------------------------------------------------- */

  let rasterResult: unknown;

  try {
    if (useDirectDownsample) {
      /*
       * Medium raster without overview.
       */

      rasterResult = await selectedImage.readRasters({
        samples: [0],
        width: readWidth,
        height: readHeight,
        resampleMethod: "nearest",
        interleave: false,
      });
    } else {
      /*
       * Full-resolution small raster OR
       * actual internal overview.
       *
       * For the large mosaic do NOT provide
       * width/height here.
       */

      rasterResult = await selectedImage.readRasters({
        samples: [0],
        interleave: false,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logCallback?.(
      "ERROR",
      `Raster read failed on image level ${selectedImageIndex}: ${errorMessage}`,
    );

    throw createValidationError(
      "Raster Band Read Failure",
      `The NDVI raster values could not be read: ${errorMessage}`,
      err,
    );
  }

  /* ----------------------------------------------------------
     12. EXTRACT NDVI BAND
     ---------------------------------------------------------- */

  const rawBand = extractSingleBand(rasterResult);

  const expectedPixels = readWidth * readHeight;

  if (rawBand.length !== expectedPixels) {
    throw createValidationError(
      "Raster Size Mismatch",
      `Expected ${expectedPixels} raster values but received ${rawBand.length}.`,
    );
  }

  /* ----------------------------------------------------------
     13. NODATA + NDVI VALIDATION
     ---------------------------------------------------------- */

  const sourceNoDataValue = getNoDataValue(baseImage);

  const valuesFloat32 = normalizeNDVIBand(rawBand, sourceNoDataValue);

  /* ----------------------------------------------------------
     14. PREVIEW GEOREFERENCING
     ---------------------------------------------------------- */

  const rasterWidth = readWidth;

  const rasterHeight = readHeight;

  const pixelWidth = (nativeBounds.east - nativeBounds.west) / rasterWidth;

  const pixelHeight = (nativeBounds.north - nativeBounds.south) / rasterHeight;

  /* ----------------------------------------------------------
     15. PREPARE VALUES FOR GEORASTER LAYER
     ---------------------------------------------------------- */

  const rows = flatBandToRows(valuesFloat32, rasterWidth, rasterHeight);

  const epsgCode = Number(validatedCrs.replace("EPSG:", ""));

  const georasterObj: FastGeoRasterObject = {
    width: rasterWidth,

    height: rasterHeight,

    numberOfRasters: 1,

    xmin: nativeBounds.west,

    ymin: nativeBounds.south,

    xmax: nativeBounds.east,

    ymax: nativeBounds.north,

    pixelWidth,

    pixelHeight,

    projection: Number.isFinite(epsgCode) ? epsgCode : validatedCrs,

    values: [rows],

    noDataValue: DEFAULT_NODATA,
  };

  /* ----------------------------------------------------------
     16. VALIDATE GEOREFERENCING
     ---------------------------------------------------------- */

  logCallback?.("INFO", "Validating geographic transform...");

  try {
    validateGeotransform(georasterObj as unknown as Record<string, unknown>);

    logCallback?.("INFO", "Geographic transform is valid.");
  } catch (err) {
    logCallback?.("ERROR", "Validation failed: Invalid geographic transform.");

    throw err;
  }

  /* ----------------------------------------------------------
     17. STATISTICS
     ---------------------------------------------------------- */

  const statistics = calculateNDVIRasterStatistics(valuesFloat32, DEFAULT_NODATA);

  /* ----------------------------------------------------------
     18. AFFINE TRANSFORM
     ---------------------------------------------------------- */

  const affine: AffineTransform = {
    originX: nativeBounds.west,

    originY: nativeBounds.north,

    pixelWidth,

    pixelHeight,

    crs: validatedCrs,
  };

  /* ----------------------------------------------------------
     19. COMPLETE
     ---------------------------------------------------------- */

  if (needsPreview) {
    logCallback?.(
      "SUCCESS",
      `Raster preview loaded successfully (${rasterWidth} × ${rasterHeight} from ${sourceWidth} × ${sourceHeight}).`,
    );
  } else {
    logCallback?.("SUCCESS", "Raster loaded successfully.");
  }

  return {
    id: `geotiff-${Date.now()}`,

    fileName: file.name,

    fileSize: file.size,

    fileType: needsPreview ? "GeoTIFF (.tif) — Fast Preview" : "GeoTIFF (.tif)",

    dataType: "Float32 (32-bit Float)",

    width: rasterWidth,

    height: rasterHeight,

    bandCount: 1,

    crs: validatedCrs,

    noDataValue: DEFAULT_NODATA,

    nativeBounds,

    geoBounds,

    affine,

    values: valuesFloat32,

    statistics,

    georasterObj: georasterObj as any,

    loadedAt: new Date().toLocaleTimeString("en-GB"),
  };
}
