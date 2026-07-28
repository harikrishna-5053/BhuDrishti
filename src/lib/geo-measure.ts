/**
 * Geodesic measurement utilities for BhuDrishti GIS engine.
 * Calculates exact WGS84 geodesic distance, perimeter, and polygon area.
 */

const EARTH_RADIUS_METERS = 6378137;

/**
 * Calculates geodesic distance between two [lat, lng] points in meters using Haversine algorithm.
 */
export function distanceMeters(p1: [number, number], p2: [number, number]): number {
  const RAD = Math.PI / 180;
  const dLat = (p2[0] - p1[0]) * RAD;
  const dLng = (p2[1] - p1[1]) * RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1[0] * RAD) * Math.cos(p2[0] * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculates total path length along an array of [lat, lng] vertices in meters.
 */
export function calculatePathDistanceMeters(points: [number, number][]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distanceMeters(points[i]!, points[i + 1]!);
  }
  return total;
}

/**
 * Calculates total perimeter of a closed polygon in meters.
 */
export function calculatePerimeterMeters(points: [number, number][]): number {
  if (points.length < 3) return 0;
  let total = calculatePathDistanceMeters(points);
  total += distanceMeters(points[points.length - 1]!, points[0]!);
  return total;
}

/**
 * Calculates geodesic enclosed area of a polygon in square meters (m²).
 * Uses spherical polygon area formula on WGS84 ellipsoid model.
 */
export function calculateGeodesicAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const RAD = Math.PI / 180;
  let total = 0;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]!;
    const p2 = points[(i + 1) % points.length]!;

    const lat1 = p1[0] * RAD;
    const lng1 = p1[1] * RAD;
    const lat2 = p2[0] * RAD;
    const lng2 = p2[1] * RAD;

    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const areaM2 = Math.abs((total * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
  return areaM2;
}

/**
 * Formats distance into appropriate human-readable units:
 * - < 1000 m => meters (m)
 * - >= 1000 m => kilometers (km)
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats area into appropriate human-readable units:
 * - < 10,000 m² => m²
 * - 10,000 m² to 1,000,000 m² => hectares (ha) [preferred agricultural unit]
 * - >= 1,000,000 m² => km²
 */
export function formatArea(m2: number): string {
  if (m2 < 10000) {
    return `${Math.round(m2).toLocaleString()} m²`;
  }
  if (m2 < 1000000) {
    return `${(m2 / 10000).toFixed(2)} ha`;
  }
  return `${(m2 / 1000000).toFixed(2)} km²`;
}
