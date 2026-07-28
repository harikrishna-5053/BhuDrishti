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
      const sw = proj4(validatedCrs, "EPSG:4326", [nativeBounds.west, nativeBounds.south]);
      const ne = proj4(validatedCrs, "EPSG:4326", [nativeBounds.east, nativeBounds.north]);
      const nw = proj4(validatedCrs, "EPSG:4326", [nativeBounds.west, nativeBounds.north]);
      const se = proj4(validatedCrs, "EPSG:4326", [nativeBounds.east, nativeBounds.south]);

      geoBounds = {
        west: Math.min(sw[0], nw[0]),
        south: Math.min(sw[1], se[1]),
        east: Math.max(ne[0], se[0]),
        north: Math.max(ne[1], nw[1]),
      };
    } catch (err) {
      logCallback?.(
        "ERROR",
        `Validation failed: Transformation from ${validatedCrs} to EPSG:4326 failed.`,
      );
      throw new GeoTIFFValidationError({
        code: "TRANSFORMATION_FAILED",
        title: "Coordinate Transformation Failed",
        userMessage:
          "BhuDrishti could not transform the raster coordinates safely.\n\nPlease verify that the GeoTIFF contains a valid and supported projection.",
        originalError: err,
      });
    }
  }

  validateTransformedBounds(geoBounds);

  // 11. Extract Band Pixel Values
  const rawValues = georasterObj.values[0];
  let valuesFloat32: Float32Array;

  if (rawValues instanceof Float32Array) {
    valuesFloat32 = rawValues;
  } else if (Array.isArray(rawValues)) {
    const flatLength = georasterObj.width * georasterObj.height;
    valuesFloat32 = new Float32Array(flatLength);
    let offset = 0;
    for (let r = 0; r < rawValues.length; r++) {
      const row = rawValues[r] as unknown as number[];
      valuesFloat32.set(row, offset);
      offset += row.length;
    }
  } else {
    valuesFloat32 = new Float32Array(rawValues as ArrayLike<number>);
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
