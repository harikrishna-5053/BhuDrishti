export function formatCoord(value: number, kind: "lat" | "lng"): string {
  const direction = kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";

  return `${Math.abs(value).toFixed(4)}° ${direction}`;
}
