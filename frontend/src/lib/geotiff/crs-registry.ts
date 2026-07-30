import proj4 from "proj4";
import { GeoTIFFValidationError } from "./errors";

export interface CRSSpec {
  epsgCode: string;
  displayName: string;
  proj4Def?: string;
  isSupported: boolean;
}

export interface ExtractedCRSInfo {
  detectedRaw: unknown;
  normalizedCrs: string | null;
  isUserDefined: boolean;
  isMissing: boolean;
  detectedCode?: number | string;
}

/**
 * Ensures EPSG:4326 base definition is registered in proj4.
 */
function ensureBaseProjections(): void {
  try {
    if (!proj4.defs("EPSG:4326")) {
      proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
    }
  } catch {
    proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
  }
}

/**
 * Returns a human-readable display name for any supported CRS.
 */
export function getCRSDisplayName(crs: string): string {
  if (crs === "EPSG:4326") return "WGS84 Latitude/Longitude";

  const match = crs.match(/^EPSG:(\d+)$/i);
  if (match) {
    const code = parseInt(match[1]!, 10);
    if (code >= 32601 && code <= 32660) {
      return `WGS 84 / UTM Zone ${code - 32600}N`;
    }
    if (code >= 32701 && code <= 32760) {
      return `WGS 84 / UTM Zone ${code - 32700}S`;
    }
  }

  return crs;
}

/**
 * Safely extracts and normalizes CRS information from GeoTIFF metadata & GeoKeys.
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

  // Check for User-Defined Code 32767
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
 * Dynamically resolves or constructs a proj4 definition for a detected CRS
 * and registers it into proj4 if not already present.
 */
export function resolveAndRegisterCRS(crsInfo: ExtractedCRSInfo): string {
  ensureBaseProjections();

  // Case 1: Missing CRS
  if (crsInfo.isMissing || (!crsInfo.normalizedCrs && !crsInfo.isUserDefined)) {
    throw new GeoTIFFValidationError({
      code: "MISSING_CRS",
      title: "Missing Geographic Reference",
      userMessage: "The selected TIFF does not contain a valid coordinate reference system.",
      detectedCrs: "Missing",
      technicalDetails: "Detected CRS: Missing / Undefined",
    });
  }

  // Case 2: User-Defined Code 32767
  if (crsInfo.isUserDefined || crsInfo.detectedCode === 32767) {
    throw new GeoTIFFValidationError({
      code: "UNSUPPORTED_CRS",
      title: "Unsupported Coordinate Reference System",
      userMessage:
        "The uploaded GeoTIFF uses a user-defined or non-standard CRS code (32767) without inline projection parameters.",
      detectedCrs: "EPSG:32767",
      technicalDetails:
        "Detected CRS: EPSG:32767 | Reason: User-defined projection code without embedded parameters",
    });
  }

  const normalized = crsInfo.normalizedCrs!;

  // Case 3: WGS84 Geographic
  if (normalized === "EPSG:4326" || normalized === "WGS84") {
    return "EPSG:4326";
  }

  // Extract EPSG numeric code if available
  let epsgNum: number | null = null;
  const match = normalized.match(/^EPSG:(\d+)$/i);
  if (match) {
    epsgNum = parseInt(match[1]!, 10);
  } else if (typeof crsInfo.detectedCode === "number") {
    epsgNum = crsInfo.detectedCode;
  }

  // Dynamic UTM Zone Resolution for WGS84
  if (epsgNum !== null) {
    // Northern Hemisphere: EPSG:32601 to EPSG:32660
    if (epsgNum >= 32601 && epsgNum <= 32660) {
      const zone = epsgNum - 32600;
      const proj4Def = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
      proj4.defs(normalized, proj4Def);
      return normalized;
    }

    // Southern Hemisphere: EPSG:32701 to EPSG:32760
    if (epsgNum >= 32701 && epsgNum <= 32760) {
      const zone = epsgNum - 32700;
      const proj4Def = `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;
      proj4.defs(normalized, proj4Def);
      return normalized;
    }
  }

  // Check if proj4 already has a definition registered for this CRS string
  if (proj4.defs(normalized)) {
    return normalized;
  }

  // Inspect raw projection string (e.g. embedded WKT or Proj4 string)
  if (typeof crsInfo.detectedRaw === "string" && crsInfo.detectedRaw.trim()) {
    const rawStr = crsInfo.detectedRaw.trim();
    if (rawStr.startsWith("+proj") || rawStr.startsWith("PROJCS") || rawStr.startsWith("GEOGCS")) {
      try {
        proj4.defs(normalized, rawStr);
        if (proj4.defs(normalized)) {
          return normalized;
        }
      } catch {
        // Fall through to unsupported error
      }
    }
  }

  // If definition could not be resolved or created
  throw new GeoTIFFValidationError({
    code: "UNSUPPORTED_CRS",
    title: "Unsupported Coordinate Reference System",
    userMessage: `BhuDrishti could not resolve a browser projection definition for ${normalized}.`,
    detectedCrs: normalized,
    technicalDetails: `Detected CRS: ${normalized} | Reason: Projection definition not found in browser registry`,
  });
}

/**
 * Validates extracted CRS info by resolving and registering projection.
 */
export function validateGeoTIFFCRS(crsInfo: ExtractedCRSInfo): string {
  return resolveAndRegisterCRS(crsInfo);
}

/**
 * Empty compatibility helper.
 */
export function ensureProjectionsRegistered(): void {
  ensureBaseProjections();
}
