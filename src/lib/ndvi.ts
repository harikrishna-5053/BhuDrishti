// Deterministic pseudo-NDVI generator and classification utilities

export type VegClass =
  | "Water"
  | "Bare land"
  | "Sparse vegetation"
  | "Moderate vegetation"
  | "Dense vegetation";

export type ColorRampPreset = "ndvi" | "viridis" | "spectral" | "thermal";

function hash(x: number, y: number, seed = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash(xi, yi, seed);
  const tr = hash(xi + 1, yi, seed);
  const bl = hash(xi, yi + 1, seed);
  const br = hash(xi + 1, yi + 1, seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (
    tl * (1 - u) * (1 - v) +
    tr * u * (1 - v) +
    bl * (1 - u) * v +
    br * u * v
  );
}

export function ndviAt(lat: number, lng: number, year = 2026): number {
  const seed = year - 2020;
  let v = 0;
  let amp = 0.55;
  let freq = 0.8;
  for (let i = 0; i < 5; i++) {
    v += smoothNoise(lng * freq, lat * freq, seed + i) * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  const bias = 0.1 * Math.sin(lat * 0.15) + 0.08 * Math.cos(lng * 0.11);
  const yearBoost = (year - 2024) * 0.06;
  const ndvi = v * 1.1 - 0.25 + bias + yearBoost;
  return Math.max(-0.2, Math.min(0.95, ndvi));
}

export function classify(ndvi: number): VegClass {
  if (ndvi < 0.05) return "Water";
  if (ndvi < 0.2) return "Bare land";
  if (ndvi < 0.4) return "Sparse vegetation";
  if (ndvi < 0.6) return "Moderate vegetation";
  return "Dense vegetation";
}

function interpolateStops(ndvi: number, stops: { v: number; c: [number, number, number] }[]): string {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (ndvi <= b.v) {
      const t = (ndvi - a.v) / (b.v - a.v);
      const r = Math.round(a.c[0]! + (b.c[0]! - a.c[0]!) * t);
      const g = Math.round(a.c[1]! + (b.c[1]! - a.c[1]!) * t);
      const bl = Math.round(a.c[2]! + (b.c[2]! - a.c[2]!) * t);
      return `rgb(${r},${g},${bl})`;
    }
  }
  const last = stops[stops.length - 1]!.c;
  return `rgb(${last[0]},${last[1]},${last[2]})`;
}

export function ndviColor(ndvi: number, preset: ColorRampPreset = "ndvi"): string {
  if (preset === "viridis") {
    const stops: { v: number; c: [number, number, number] }[] = [
      { v: -0.2, c: [68, 1, 84] },
      { v: 0.1, c: [59, 82, 139] },
      { v: 0.4, c: [33, 145, 140] },
      { v: 0.7, c: [94, 201, 98] },
      { v: 0.95, c: [253, 231, 37] },
    ];
    return interpolateStops(ndvi, stops);
  }

  if (preset === "spectral") {
    const stops: { v: number; c: [number, number, number] }[] = [
      { v: -0.2, c: [43, 131, 186] },
      { v: 0.1, c: [171, 221, 164] },
      { v: 0.4, c: [255, 255, 191] },
      { v: 0.7, c: [253, 174, 97] },
      { v: 0.95, c: [215, 25, 28] },
    ];
    return interpolateStops(ndvi, stops);
  }

  if (preset === "thermal") {
    const stops: { v: number; c: [number, number, number] }[] = [
      { v: -0.2, c: [15, 15, 40] },
      { v: 0.1, c: [120, 20, 140] },
      { v: 0.4, c: [220, 40, 100] },
      { v: 0.7, c: [255, 160, 20] },
      { v: 0.95, c: [255, 240, 150] },
    ];
    return interpolateStops(ndvi, stops);
  }

  // Default Standard NDVI palette
  const stops: { v: number; c: [number, number, number] }[] = [
    { v: -0.2, c: [190, 60, 60] },
    { v: 0.05, c: [140, 90, 60] },
    { v: 0.2, c: [170, 130, 70] },
    { v: 0.4, c: [230, 210, 90] },
    { v: 0.6, c: [140, 200, 90] },
    { v: 0.8, c: [40, 130, 60] },
    { v: 0.95, c: [20, 80, 40] },
  ];
  return interpolateStops(ndvi, stops);
}

export function localStats(lat: number, lng: number, year = 2026, radius = 0.4) {
  const samples: number[] = [];
  const step = radius / 12;
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      samples.push(ndviAt(lat + dy, lng + dx, year));
    }
  }
  samples.sort((a, b) => a - b);
  const min = samples[0]!;
  const max = samples[samples.length - 1]!;
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const median = samples[Math.floor(samples.length / 2)]!;
  const variance =
    samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  const std = Math.sqrt(variance);
  const vegPct =
    (samples.filter((v) => v >= 0.4).length / samples.length) * 100;

  const bins = 12;
  const lo = -0.2;
  const hi = 0.95;
  const hist = Array.from({ length: bins }, (_, i) => ({
    bin: lo + ((hi - lo) / bins) * (i + 0.5),
    count: 0,
  }));
  for (const v of samples) {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)),
    );
    hist[idx]!.count++;
  }

  return { min, max, mean, median, std, vegPct, histogram: hist };
}

export function monthlyTimeline(lat: number, lng: number, year: number) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return months.map((m, i) => {
    const seasonal =
      0.18 * Math.sin(((i - 2) / 12) * Math.PI * 2) + 0.02 * (year - 2024);
    const base = ndviAt(lat, lng, year);
    return {
      month: m,
      ndvi: Math.max(-0.1, Math.min(0.95, base * 0.7 + seasonal + 0.15)),
    };
  });
}