import { fromArrayBuffer } from "geotiff";
import parseGeoRaster from "georaster";
import proj4 from "proj4";
import type { LoadedNDVIRaster, RasterBounds, AffineTransform } from "./types";
import { calculateNDVIRasterStatistics } from "./calculate-raster-statistics";

// Register standard UTM projections commonly used across India (UTM Zones 42N to 46N)
for (let zone = 42; zone <= 46; zone++) {
  const epsg = `EPSG:326${zone}`;
  proj4.defs(epsg, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`);
}

export async function readNDVIGeoTIFF(file: File): Promise<LoadedNDVIRaster> {
  // Check file extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "tif" && ext !== "tiff") {
    throw new Error("The selected file is not a TIFF file. Please select a .tif or .tiff file.");
  }

  if (file.size === 0) {
    throw new Error("The selected file is empty (0 bytes).");
  }

  // Read ArrayBuffer
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error("Failed to read file contents from browser storage.");
  }

  // 1. Parse with geotiff.js for rotation & low-level tag checks
  let tiffImage: any;
  try {
    const tiff = await fromArrayBuffer(arrayBuffer);
    tiffImage = await tiff.getImage();
  } catch (err) {
    throw new Error("The GeoTIFF file structure could not be parsed. The file may be corrupt.");
  }

  // Check for rotation / skew parameters in ModelTransformation
  const modelTransformation = tiffImage.fileDirectory?.ModelTransformation;
  if (modelTransformation && (modelTransformation[1] !== 0 || modelTransformation[4] !== 0)) {
    throw new Error("The selected GeoTIFF contains rotated or skewed projection vectors. Only north-up rasters are currently supported.");
  }

  // 2. Parse GeoRaster object
  let georasterObj: any;
  try {
    georasterObj = await parseGeoRaster(arrayBuffer);
  } catch (err) {
    throw new Error("GeoRaster parser failed to unpack raster bands and metadata.");
  }

  if (!georasterObj || !georasterObj.numberOfRasters || georasterObj.numberOfRasters < 1) {
    throw new Error("The raster contains no readable bands.");
  }

  if (!georasterObj.width || !georasterObj.height) {
    throw new Error("The raster has invalid spatial dimensions (0x0).");
  }

  // Validate geotransform parameters
  const originX = georasterObj.xmin;
  const originY = georasterObj.ymax;
  const pixelWidth = georasterObj.pixelWidth;
  const pixelHeight = georasterObj.pixelHeight;

  if (
    originX === undefined ||
    originY === undefined ||
    !pixelWidth ||
    !pixelHeight ||
    isNaN(originX) ||
    isNaN(originY)
  ) {
    throw new Error("This TIFF does not contain geospatial referencing. Please select a valid GeoTIFF.");
  }

  // Resolve CRS
  let crsString: string | null = null;
  const proj = georasterObj.projection;

  if (typeof proj === "number") {
    crsString = `EPSG:${proj}`;
  } else if (typeof proj === "string" && proj.trim()) {
    crsString = proj.startsWith("EPSG:") ? proj : `EPSG:${proj}`;
  } else {
    // Try geoKeys lookup from geotiff.js
    const geoKeys = tiffImage.getGeoKeys();
    if (geoKeys?.ProjectedCSTypeGeoKey) {
      crsString = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
    } else if (geoKeys?.GeographicTypeGeoKey) {
      crsString = `EPSG:${geoKeys.GeographicTypeGeoKey}`;
    }
  }

  if (!crsString || crsString === "EPSG:0" || crsString === "EPSG:undefined") {
    throw new Error("The raster coordinate reference system (CRS) could not be identified.");
  }

  // Extract raw band values
  const rawValues = georasterObj.values[0];
  let valuesFloat32: Float32Array;

  if (rawValues instanceof Float32Array) {
    valuesFloat32 = rawValues;
  } else if (Array.isArray(rawValues)) {
    // Flatten 2D array if returned as rows
    const flatLength = georasterObj.width * georasterObj.height;
    valuesFloat32 = new Float32Array(flatLength);
    let offset = 0;
    for (let r = 0; r < rawValues.length; r++) {
      const row = rawValues[r];
      valuesFloat32.set(row, offset);
      offset += row.length;
    }
  } else {
    valuesFloat32 = new Float32Array(rawValues);
  }

  const noDataValue = georasterObj.noDataValue !== undefined ? georasterObj.noDataValue : null;

  // Compute Native Bounds
  const nativeBounds: RasterBounds = {
    west: georasterObj.xmin,
    south: georasterObj.ymin,
    east: georasterObj.xmax,
    north: georasterObj.ymax,
  };

  // Compute Geographic EPSG:4326 Bounds
  let geoBounds: RasterBounds;
  if (crsString === "EPSG:4326" || crsString === "EPSG:4326") {
    geoBounds = { ...nativeBounds };
  } else {
    try {
      // Transform corners using proj4
      const sw = proj4(crsString, "EPSG:4326", [nativeBounds.west, nativeBounds.south]);
      const ne = proj4(crsString, "EPSG:4326", [nativeBounds.east, nativeBounds.north]);
      const nw = proj4(crsString, "EPSG:4326", [nativeBounds.west, nativeBounds.north]);
      const se = proj4(crsString, "EPSG:4326", [nativeBounds.east, nativeBounds.south]);

      geoBounds = {
        west: Math.min(sw[0], nw[0]),
        south: Math.min(sw[1], se[1]),
        east: Math.max(ne[0], se[0]),
        north: Math.max(ne[1], nw[1]),
      };
    } catch (err) {
      throw new Error(`Failed to transform coordinates from ${crsString} to EPSG:4326.`);
    }
  }

  const affine: AffineTransform = {
    originX,
    originY,
    pixelWidth,
    pixelHeight,
    crs: crsString,
  };

  // Calculate statistics
  const statistics = calculateNDVIRasterStatistics(valuesFloat32, noDataValue);

  return {
    id: `geotiff-${Date.now()}`,
    fileName: file.name,
    fileSize: file.size,
    width: georasterObj.width,
    height: georasterObj.height,
    bandCount: georasterObj.numberOfRasters,
    crs: crsString,
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
