import { fromArrayBuffer } from "geotiff";
import parseGeoRaster from "georaster";
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

interface GeoRasterParsedObject {
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
  values: Float32Array[] | number[][];
  noDataValue?: number | null;
}

interface GeoTIFFImageInterface {
  getWidth: () => number;
  getHeight: () => number;
  fileDirectory?: { ModelTransformation?: number[] };
  getGeoKeys?: () => Record<string, number | string>;
}

/**
 * Validated GeoTIFF Raster Loader for BhuDrishti Console.
 * Validates raster dimensions, GeoKeys, CRS registry, and geotransform BEFORE coordinate transformation.
 * Never calls proj4 with invalid, missing, or user-defined (32767) CRS codes.
 */
export async function readNDVIGeoTIFF(
  file: File,
  logCallback?: GeoTIFFLogCallback,
): Promise<LoadedNDVIRaster> {
  // 1. Validate File Extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "tif" && ext !== "tiff") {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTIFF",
      title: "Invalid File Type",
      userMessage: "The selected file is not a TIFF file. Please select a .tif or .tiff file.",
    });
  }

  if (file.size === 0) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTIFF",
      title: "Empty File",
      userMessage: "The selected file is empty (0 bytes).",
    });
  }

  logCallback?.("INFO", "Reading GeoTIFF metadata...");

  // 2. Read ArrayBuffer
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTIFF",
      title: "File Read Failure",
      userMessage: "Failed to read file contents from browser storage.",
      originalError: err,
    });
  }

  // 3. Low-Level GeoTIFF Parsing via geotiff.js
  let tiffImage: GeoTIFFImageInterface;
  try {
    const tiff = await fromArrayBuffer(arrayBuffer);
    tiffImage = (await tiff.getImage()) as GeoTIFFImageInterface;
  } catch (err) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTIFF",
      title: "Invalid GeoTIFF Structure",
      userMessage: "The GeoTIFF file structure could not be parsed. The file may be corrupt.",
      originalError: err,
    });
  }

  // 4. Validate Dimensions from Image Headers
  const headerWidth = tiffImage.getWidth();
  const headerHeight = tiffImage.getHeight();
  validateRasterDimensions(headerWidth, headerHeight);
  logCallback?.("INFO", `Raster dimensions detected: ${headerWidth} × ${headerHeight}`);

  // 5. Check for unsupported rotation vectors
  const modelTransformation = tiffImage.fileDirectory?.ModelTransformation;
  if (modelTransformation && (modelTransformation[1] !== 0 || modelTransformation[4] !== 0)) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Unsupported Raster Orientation",
      userMessage:
        "The selected GeoTIFF contains rotated or skewed projection vectors. Only north-up rasters are currently supported.",
    });
  }

  // 6. Parse GeoRaster Object for Band Values & Positioning
  let georasterObj: GeoRasterParsedObject;
  try {
    georasterObj = (await parseGeoRaster(arrayBuffer)) as GeoRasterParsedObject;
  } catch (err) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTIFF",
      title: "Raster Band Unpack Failure",
      userMessage: "GeoRaster parser failed to unpack raster bands and metadata.",
      originalError: err,
    });
  }

  if (!georasterObj || !georasterObj.numberOfRasters || georasterObj.numberOfRasters < 1) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTIFF",
      title: "Empty Raster Bands",
      userMessage: "The raster contains no readable bands.",
    });
  }

  validateRasterDimensions(georasterObj.width, georasterObj.height);

  // 7. Extract & Validate CRS BEFORE any Coordinate Transformation
  const geoKeys = tiffImage.getGeoKeys ? tiffImage.getGeoKeys() : null;
  const crsInfo = extractCRSInfo(georasterObj.projection, geoKeys);

  let validatedCrs: string;
  try {
    validatedCrs = validateGeoTIFFCRS(crsInfo);
    logCallback?.("INFO", `CRS detected: ${validatedCrs}`);
  } catch (err) {
    if (crsInfo.detectedCode === 32767 || crsInfo.isUserDefined) {
      logCallback?.("WARN", `CRS code detected: 32767`);
      logCallback?.("ERROR", `Validation failed: Unsupported CRS.`);
    } else if (crsInfo.isMissing) {
      logCallback?.("ERROR", `Validation failed: Missing CRS.`);
    } else {
      if (crsInfo.normalizedCrs) {
        logCallback?.("INFO", `CRS detected: ${crsInfo.normalizedCrs}`);
      }
      logCallback?.("ERROR", `Validation failed: Unsupported CRS.`);
    }
    throw err;
  }

  // 8. Validate Spatial Geotransform & Extent
  logCallback?.("INFO", "Validating geographic transform...");
  try {
    validateGeotransform(georasterObj as unknown as Record<string, unknown>);
    logCallback?.("INFO", "Geographic transform is valid.");
  } catch (err) {
    logCallback?.("ERROR", "Validation failed: Invalid geographic transform.");
    throw err;
  }

  // 9. Compute & Validate Source Bounds
  const nativeBounds: RasterBounds = {
    west: georasterObj.xmin,
    south: georasterObj.ymin,
    east: georasterObj.xmax,
    north: georasterObj.ymax,
  };
  validateSourceBounds(nativeBounds);

  // 10. Perform Safe Bounds Transformation to EPSG:4326
  let geoBounds: RasterBounds;
  if (validatedCrs === "EPSG:4326") {
    logCallback?.("INFO", "CRS transformation not required.");
    geoBounds = { ...nativeBounds };
  } else {
    logCallback?.("INFO", `Transforming bounds from ${validatedCrs} to EPSG:4326...`);
    try {
      const samplePoints: [number, number][] = [
        [nativeBounds.west, nativeBounds.south],
        [nativeBounds.east, nativeBounds.north],
        [nativeBounds.west, nativeBounds.north],
        [nativeBounds.east, nativeBounds.south],
        [(nativeBounds.west + nativeBounds.east) / 2, (nativeBounds.south + nativeBounds.north) / 2],
        [(nativeBounds.west + nativeBounds.east) / 2, nativeBounds.south],
        [(nativeBounds.west + nativeBounds.east) / 2, nativeBounds.north],
        [nativeBounds.west, (nativeBounds.south + nativeBounds.north) / 2],
        [nativeBounds.east, (nativeBounds.south + nativeBounds.north) / 2],
      ];

      const transformed: [number, number][] = [];
      for (const [x, y] of samplePoints) {
        const res = proj4(validatedCrs, "EPSG:4326", [x, y]);
        const lon = res[0];
        const lat = res[1];

        if (
          typeof lon !== "number" ||
          typeof lat !== "number" ||
          !Number.isFinite(lon) ||
          !Number.isFinite(lat) ||
          Number.isNaN(lon) ||
          Number.isNaN(lat)
        ) {
          throw new Error(`Transformation returned non-finite coordinate [${lon}, ${lat}]`);
        }
        transformed.push([lon, lat]);
      }

      const lons = transformed.map((p) => p[0]);
      const lats = transformed.map((p) => p[1]);

      geoBounds = {
        west: Math.min(...lons),
        south: Math.min(...lats),
        east: Math.max(...lons),
        north: Math.max(...lats),
      };
    } catch (err) {
      logCallback?.(
        "ERROR",
        `Validation failed: Transformation from ${validatedCrs} to EPSG:4326 failed.`,
      );
      throw new GeoTIFFValidationError({
        code: "TRANSFORMATION_FAILED",
        title: "Coordinate Transformation Failed",
        userMessage: `BhuDrishti could not transform coordinates from ${validatedCrs} to EPSG:4326 safely.`,
        detectedCrs: validatedCrs,
        technicalDetails: `Detected CRS: ${validatedCrs} | Reason: ${err instanceof Error ? err.message : String(err)}`,
        originalError: err,
      });
    }
  }

  validateTransformedBounds(geoBounds, validatedCrs);


  // 11. Extract & Normalize Band Pixel Values to [-1.0, +1.0]
  const numberOfRasters = georasterObj.numberOfRasters || 1;
  const totalPixels = georasterObj.width * georasterObj.height;
  const valuesFloat32 = new Float32Array(totalPixels);
  const rawNoData = georasterObj.noDataValue !== undefined ? georasterObj.noDataValue : null;

  // Helper to extract a single band array into a flat Float32Array
  const extractFlatBand = (bandIdx: number): Float32Array => {
    const rawBand = georasterObj.values[bandIdx];
    const flat = new Float32Array(totalPixels);
    if (!rawBand) return flat;

    if (rawBand instanceof Float32Array) {
      return rawBand;
    } else if (Array.isArray(rawBand)) {
      let offset = 0;
      for (let r = 0; r < rawBand.length; r++) {
        const row = rawBand[r] as unknown as ArrayLike<number>;
        if (row && row.length) {
          flat.set(row, offset);
          offset += row.length;
        }
      }
    } else {
      flat.set(rawBand as ArrayLike<number>);
    }
    return flat;
  };

  const b0 = extractFlatBand(0);

  if (numberOfRasters >= 3) {
    // Multi-band composite (e.g. RGB or False-Color Sentinel-2 NDVI export)
    const b1 = extractFlatBand(1);
    const b2 = extractFlatBand(2);

    // Determine pixel value scale (e.g. 0..255, 0..65535, or 0..1)
    let maxPixelVal = 0;
    const sampleLimit = Math.min(totalPixels, 10000);
    for (let i = 0; i < sampleLimit; i++) {
      if (b0[i]! > maxPixelVal) maxPixelVal = b0[i]!;
      if (b1[i]! > maxPixelVal) maxPixelVal = b1[i]!;
      if (b2[i]! > maxPixelVal) maxPixelVal = b2[i]!;
    }

    const scaleFactor = maxPixelVal > 1.0 ? (maxPixelVal > 255 ? 65535.0 : 255.0) : 1.0;

    // Detect if imagery is False-Color NIR (Band 0 = NIR, Band 1 = Red) or True Color / Heatmap
    let rSum = 0;
    let gSum = 0;
    let count = 0;
    for (let i = 0; i < sampleLimit; i++) {
      if (b0[i]! > 0 || b1[i]! > 0 || b2[i]! > 0) {
        rSum += b0[i]!;
        gSum += b1[i]!;
        count++;
      }
    }
    const isFalseColorNIR = count > 0 && rSum > gSum;

    for (let i = 0; i < totalPixels; i++) {
      const r = b0[i]! / scaleFactor;
      const g = b1[i]! / scaleFactor;
      const b = b2[i]! / scaleFactor;

      // Background / NoData check
      if ((r === 0 && g === 0 && b === 0) || (rawNoData !== null && b0[i] === rawNoData)) {
        valuesFloat32[i] = -9999;
        continue;
      }

      let indexVal: number;
      if (isFalseColorNIR) {
        // NIR is in Band 0 (Red channel), Red is in Band 1
        const denom = r + g;
        indexVal = denom > 1e-5 ? (r - g) / denom : 0;
      } else {
        // Visual RGB heatmap: Green channel dominates vegetation
        const denom = g + r;
        indexVal = denom > 1e-5 ? (g - r) / denom : 0;
      }

      valuesFloat32[i] = Math.max(-1.0, Math.min(1.0, indexVal));
    }
  } else {
    // Single-Band or Dual-Band Raster
    let minVal = Infinity;
    let maxVal = -Infinity;
    const sampleLimit = Math.min(totalPixels, 10000);
    for (let i = 0; i < sampleLimit; i++) {
      const v = b0[i]!;
      if (isNaN(v) || (rawNoData !== null && Math.abs(v - rawNoData) < 1e-4) || v === -9999)
        continue;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }

    const isScaledInt16 = maxVal > 1.5 && maxVal <= 10000 && minVal >= -10000;
    const isUint8 = maxVal > 1.5 && maxVal <= 255 && minVal >= 0;

    for (let i = 0; i < totalPixels; i++) {
      const v = b0[i]!;
      if (isNaN(v) || (rawNoData !== null && Math.abs(v - rawNoData) < 1e-4) || v === -9999) {
        valuesFloat32[i] = -9999;
        continue;
      }

      let normalized: number;
      if (isScaledInt16) {
        normalized = v / 10000.0;
      } else if (isUint8) {
        normalized = (v / 255.0) * 2.0 - 1.0;
      } else {
        normalized = v;
      }

      valuesFloat32[i] = Math.max(-1.0, Math.min(1.0, normalized));
    }
  }

  const noDataValue = georasterObj.noDataValue !== undefined ? georasterObj.noDataValue : null;

  // 12. Calculate Statistics
  const statistics = calculateNDVIRasterStatistics(valuesFloat32, noDataValue);

  const affine: AffineTransform = {
    originX: georasterObj.xmin,
    originY: georasterObj.ymax,
    pixelWidth: georasterObj.pixelWidth,
    pixelHeight: georasterObj.pixelHeight,
    crs: validatedCrs,
  };

  logCallback?.("SUCCESS", "Raster loaded successfully.");

  return {
    id: `geotiff-${Date.now()}`,
    fileName: file.name,
    fileSize: file.size,
    fileType: "GeoTIFF (.tif)",
    dataType: "Float32 (32-bit Float)",
    width: georasterObj.width,
    height: georasterObj.height,
    bandCount: georasterObj.numberOfRasters,
    crs: validatedCrs,
    noDataValue,
    nativeBounds,
    geoBounds,
    affine,
    values: valuesFloat32,
    statistics,
    georasterObj,
    loadedAt: new Date().toLocaleTimeString("en-GB"),
  };
}
