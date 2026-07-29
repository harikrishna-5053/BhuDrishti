/**
 * Structured Application Errors for GeoTIFF Validation in BhuDrishti.
 * Replaces raw parser/proj4 stack traces with user-friendly application errors.
 */

export type GeoTIFFErrorCode =
  | "MISSING_CRS"
  | "UNSUPPORTED_CRS"
  | "INVALID_GEOTRANSFORM"
  | "INVALID_RASTER_DIMENSIONS"
  | "TRANSFORMATION_FAILED"
  | "INVALID_GEOTIFF";

export interface GeoTIFFValidationErrorOptions {
  code: GeoTIFFErrorCode;
  title: string;
  userMessage: string;
  detectedCrs?: string;
  technicalDetails?: string;
  originalError?: unknown;
}

export class GeoTIFFValidationError extends Error {
  readonly code: GeoTIFFErrorCode;
  readonly title: string;
  readonly userMessage: string;
  readonly detectedCrs?: string;
  readonly technicalDetails?: string;
  readonly originalError?: unknown;

  constructor(options: GeoTIFFValidationErrorOptions) {
    super(options.userMessage);
    this.name = "GeoTIFFValidationError";
    this.code = options.code;
    this.title = options.title;
    this.userMessage = options.userMessage;
    this.detectedCrs = options.detectedCrs;
    this.technicalDetails = options.technicalDetails;
    this.originalError = options.originalError;

    // Preserve prototype chain in ES5/ES6 transpilation
    Object.setPrototypeOf(this, GeoTIFFValidationError.prototype);
  }
}
