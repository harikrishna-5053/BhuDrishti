import { GeoTIFFValidationError } from "./errors";
import type { RasterBounds } from "./types";

/**
 * Validates raster pixel width and height.
 */
export function validateRasterDimensions(width: unknown, height: unknown): void {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new GeoTIFFValidationError({
      code: "INVALID_RASTER_DIMENSIONS",
      title: "Invalid GeoTIFF",
      userMessage: "The uploaded TIFF contains invalid raster dimensions and cannot be processed.",
    });
  }
}

/**
 * Validates spatial geotransform, origin, pixel resolution, and extent parameters.
 */
export function validateGeotransform(
  georasterObj: Record<string, unknown> | null | undefined,
): void {
  if (!georasterObj) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Invalid Geographic Reference",
      userMessage:
        "The uploaded GeoTIFF does not contain valid geographic positioning information.\n\nPlease upload a properly georeferenced GeoTIFF.",
    });
  }

  const xmin = georasterObj.xmin;
  const ymin = georasterObj.ymin;
  const xmax = georasterObj.xmax;
  const ymax = georasterObj.ymax;
  const pixelWidth = georasterObj.pixelWidth;
  const pixelHeight = georasterObj.pixelHeight;

  const isValidNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);

  if (
    !isValidNumber(xmin) ||
    !isValidNumber(ymin) ||
    !isValidNumber(xmax) ||
    !isValidNumber(ymax) ||
    !isValidNumber(pixelWidth) ||
    !isValidNumber(pixelHeight)
  ) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Invalid Geographic Reference",
      userMessage:
        "The uploaded GeoTIFF does not contain valid geographic positioning information.\n\nPlease upload a properly georeferenced GeoTIFF.",
    });
  }

  if (pixelWidth <= 0 || pixelHeight <= 0) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Invalid Geographic Reference",
      userMessage:
        "The uploaded GeoTIFF contains zero or negative pixel resolution scale.\n\nPlease upload a properly georeferenced GeoTIFF.",
    });
  }

  if (xmin >= xmax || ymin >= ymax) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Invalid Geographic Reference",
      userMessage:
        "The uploaded GeoTIFF contains malformed or inverted geographic boundary extent.\n\nPlease upload a properly georeferenced GeoTIFF.",
    });
  }

  const extentWidth = xmax - xmin;
  const extentHeight = ymax - ymin;

  if (extentWidth <= 0 || extentHeight <= 0) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Invalid Geographic Reference",
      userMessage:
        "The uploaded GeoTIFF contains zero geographic extent area.\n\nPlease upload a properly georeferenced GeoTIFF.",
    });
  }
}

/**
 * Validates native raster source bounds object.
 */
export function validateSourceBounds(bounds: RasterBounds): void {
  const isValidNumber = (v: number) =>
    typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);

  if (
    !isValidNumber(bounds.west) ||
    !isValidNumber(bounds.south) ||
    !isValidNumber(bounds.east) ||
    !isValidNumber(bounds.north) ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    throw new GeoTIFFValidationError({
      code: "INVALID_GEOTRANSFORM",
      title: "Invalid Geographic Reference",
      userMessage: "The calculated source bounds for this GeoTIFF are invalid or non-geographical.",
    });
  }
}

/**
 * Validates transformed WGS84 EPSG:4326 bounds.
 */
export function validateTransformedBounds(bounds: RasterBounds, crs?: string): void {
  const isValidNumber = (v: number) =>
    typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);

  if (
    !isValidNumber(bounds.west) ||
    !isValidNumber(bounds.south) ||
    !isValidNumber(bounds.east) ||
    !isValidNumber(bounds.north) ||
    bounds.west < -180.1 ||
    bounds.east > 180.1 ||
    bounds.south < -90.1 ||
    bounds.north > 90.1 ||
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    const crsDetail = crs ? `Detected CRS: ${crs} | ` : "";
    throw new GeoTIFFValidationError({
      code: "TRANSFORMATION_FAILED",
      title: "Coordinate Transformation Failed",
      userMessage:
        "BhuDrishti could not transform the raster coordinates safely.\n\nPlease verify that the GeoTIFF contains a valid and supported projection.",
      detectedCrs: crs,
      technicalDetails: `${crsDetail}Reason: Transformed geographic bounds out of valid WGS84 range (-180..180, -90..90)`,
    });
  }
}

