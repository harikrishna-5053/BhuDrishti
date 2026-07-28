import proj4 from "proj4";
import { GeoTIFFValidationError } from "./errors";

export interface CRSSpec {
  epsgCode: string;
  displayName: string;
  proj4Def?: string;
  isSupported: boolean;
}

/**
 * Centralized Supported CRS Registry for BhuDrishti remote sensing console.
 * Extensible for adding future UTM zones or regional projections.
 */
export const SUPPORTED_CRS_REGISTRY: Record<string, CRSSpec> = {
  "EPSG:4326": {
    epsgCode: "EPSG:4326",
    displayName: "WGS84 Latitude/Longitude",
    proj4Def: "+proj=longlat +datum=WGS84 +no_defs",
    isSupported: true,
  },
  "EPSG:32643": {
    epsgCode: "EPSG:32643",
    displayName: "WGS84 / UTM Zone 43N",
    proj4Def: "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs",
    isSupported: true,
  },
  "EPSG:32644": {
    epsgCode: "EPSG:32644",
    displayName: "WGS84 / UTM Zone 44N",
    proj4Def: "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs",
    isSupported: true,
  },
  "EPSG:32645": {
    epsgCode: "EPSG:32645",
    displayName: "WGS84 / UTM Zone 45N",
    proj4Def: "+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs",
    isSupported: true,
  },
};

let projectionsRegistered = false;

/**
 * Ensures supported proj4 definitions are registered into proj4 registry.
 */
export function ensureProjectionsRegistered(): void {
  if (projectionsRegistered) return;

  for (const [epsg, spec] of Object.entries(SUPPORTED_CRS_REGISTRY)) {
    if (spec.proj4Def) {
      proj4.defs(epsg, spec.proj4Def);
    }
  }

  projectionsRegistered = true;
}

export interface ExtractedCRSInfo {
  detectedRaw: unknown;
  normalizedCrs: string | null;
  isUserDefined: boolean;
  isMissing: boolean;
  detectedCode?: number | string;
}

/**
 * Safely extracts and normalizes CRS information from GeoTIFF metadata & GeoKeys.
 * Does NOT construct invalid EPSG strings such as EPSG:32767.
 */
export function extractCRSInfo(
  georasterProj: unknown,
  geoKeys: Record<string, number | string> | null | undefined,
): ExtractedCRSInfo {
  let rawCode: number | string | null = null;

  // 1. Inspect GeoRaster projection object/property
  if (typeof georasterProj === "number") {
    rawCode = georasterProj;
  } else if (typeof georasterProj === "string" && georasterProj.trim()) {
    const trimmed = georasterProj.trim();
    if (/^\d+$/.test(trimmed)) {
      rawCode = parseInt(trimmed, 10);
    } else if (trimmed.startsWith("EPSG:")) {
      const codePart = trimmed.replace("EPSG:", "").trim();
      if (/^\d+$/.test(codePart)) {
        rawCode = parseInt(codePart, 10);
      } else {
        rawCode = trimmed;
      }
    } else {
      rawCode = trimmed;
    }
  }

  // 2. Inspect GeoKeys from geotiff.js if not found in georaster projection
  if (rawCode === null || rawCode === 0 || rawCode === "0" || rawCode === "undefined") {
    if (geoKeys?.ProjectedCSTypeGeoKey) {
      rawCode = geoKeys.ProjectedCSTypeGeoKey;
    } else if (geoKeys?.GeographicTypeGeoKey) {
      rawCode = geoKeys.GeographicTypeGeoKey;
    }
  }

  // Check for missing CRS
  if (
    rawCode === null ||
    rawCode === 0 ||
    rawCode === "0" ||
    rawCode === "undefined" ||
    rawCode === "EPSG:0"
  ) {
    return {
      detectedRaw: georasterProj,
      normalizedCrs: null,
      isUserDefined: false,
      isMissing: true,
    };
  }

  // Check for User-Defined Code 32767 (or string "32767" / "EPSG:32767")
  if (rawCode === 32767 || rawCode === "32767" || rawCode === "EPSG:32767") {
    return {
      detectedRaw: rawCode,
      normalizedCrs: null,
      isUserDefined: true,
      isMissing: false,
      detectedCode: 32767,
    };
  }

  // Normalize numeric EPSG code
  let normalized: string | null = null;
  if (typeof rawCode === "number") {
    normalized = `EPSG:${rawCode}`;
  } else if (typeof rawCode === "string") {
    normalized = rawCode.startsWith("EPSG:") ? rawCode : `EPSG:${rawCode}`;
  }

  return {
    detectedRaw: rawCode,
    normalizedCrs: normalized,
    isUserDefined: false,
    isMissing: false,
    detectedCode: rawCode,
  };
}

/**
 * Validates extracted CRS info against supported CRS registry.
 * Throws structured GeoTIFFValidationError if invalid or unsupported.
 */
export function validateGeoTIFFCRS(crsInfo: ExtractedCRSInfo): string {
  // Case 1: Missing CRS
  if (crsInfo.isMissing || (!crsInfo.normalizedCrs && !crsInfo.isUserDefined)) {
    throw new GeoTIFFValidationError({
      code: "MISSING_CRS",
      title: "Missing Geographic Reference",
      userMessage:
        "The selected TIFF does not contain a valid coordinate reference system.\n\nPlease upload a georeferenced GeoTIFF.",
    });
  }

  // Case 2: User-Defined Code 32767
  if (crsInfo.isUserDefined || crsInfo.detectedCode === 32767) {
    throw new GeoTIFFValidationError({
      code: "UNSUPPORTED_CRS",
      title: "Unsupported Coordinate Reference System",
      userMessage:
        "The uploaded GeoTIFF uses an undefined or unsupported coordinate reference system.\n\nBhuDrishti cannot safely position this raster on the map.\n\nPlease upload a properly georeferenced GeoTIFF.",
      detectedCrs: "32767",
      technicalDetails: "Detected CRS code: 32767",
    });
  }

  const normalized = crsInfo.normalizedCrs!;

  // Case 3: CRS is not in supported registry
  const spec = SUPPORTED_CRS_REGISTRY[normalized];
  if (!spec || !spec.isSupported) {
    throw new GeoTIFFValidationError({
      code: "UNSUPPORTED_CRS",
      title: "Unsupported Coordinate Reference System",
      userMessage:
        "The uploaded GeoTIFF uses an unsupported or invalid coordinate reference system.\n\nPlease upload a properly georeferenced GeoTIFF.",
      detectedCrs: normalized,
      technicalDetails: `Detected CRS: ${normalized}`,
    });
  }

  // Ensure proj4 definitions are registered for the supported CRS
  ensureProjectionsRegistered();

  return normalized;
}
