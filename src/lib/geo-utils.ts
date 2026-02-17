import * as turf from '@turf/turf';
import proj4 from 'proj4';

// UTM Zone definitions
const UTM42N = "+proj=utm +zone=42 +datum=WGS84 +units=m +no_defs";
const UTM43N = "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs";
const WGS84 = "EPSG:4326";

export type CRS = 'UTM42N' | 'UTM43N';

// Patwari Standards (Standard: 1 Karam = 5.5 Feet)
const KARAM_TO_FEET = 5.5;
const METERS_PER_FOOT = 0.3048; // International standard
const METERS_PER_KARAM = KARAM_TO_FEET * METERS_PER_FOOT; // 1.6764m
const SQ_METERS_PER_MARLA = 9 * Math.pow(METERS_PER_KARAM, 2); // 25.29285264m²

/**
 * Formats a distance in meters into "Xk - Yft" (Karam and Feet).
 * 1 Karam = 5.5 Feet (1.6764 Meters).
 */
export function formatKaramFeet(meters: number): string {
  const karams = Math.floor(meters / METERS_PER_KARAM + 0.001); // Float epsilon
  const remainingMeters = meters - (karams * METERS_PER_KARAM);
  const remainingFeet = remainingMeters / METERS_PER_FOOT;

  const roundedFeet = Math.round(remainingFeet * 10) / 10;

  if (karams > 0) {
    if (roundedFeet >= 0.1) {
      return `${karams}k - ${roundedFeet.toFixed(1)}ft`;
    }
    return `${karams}k`;
  }
  return `${roundedFeet.toFixed(1)}ft`;
}

/**
 * Converts area in square meters (projected) to Kanal-Marla units.
 * 1 Marla = 9 Sq Karams
 * 1 Kanal = 20 Marlas
 */
export function calculateKanalMarla(areaSqMeters: number): KhasraStats {
  const totalMarlas = areaSqMeters / SQ_METERS_PER_MARLA;
  const kanals = Math.floor(totalMarlas / 20 + 0.0001);
  const remainingMarlas = totalMarlas - (kanals * 20);

  const roundedMarlas = Math.round(remainingMarlas * 100) / 100;
  const areaSqFt = areaSqMeters * (1 / Math.pow(METERS_PER_FOOT, 2));

  let label = '';
  if (kanals > 0) {
    if (roundedMarlas >= 0.01) {
      label = `${kanals} K - ${roundedMarlas.toFixed(2)} M`;
    } else {
      label = `${kanals} Kanal`;
    }
  } else {
    label = `${roundedMarlas.toFixed(2)} Marla`;
  }

  return {
    areaSqFt,
    totalMarlas,
    kanals,
    marlas: remainingMarlas,
    label
  };
}

/**
 * Calculates dimensions using projected coordinates for better accuracy.
 */
export function calculateDimensions(feature: any, crs: CRS): Dimension[] {
  const dimensions: Dimension[] = [];
  const coords = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates[0]
    : feature.geometry.coordinates[0][0];

  const projection = crs === 'UTM42N' ? UTM42N : UTM43N;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];

    // Project points to meters
    const [x1, y1] = proj4(WGS84, projection, p1);
    const [x2, y2] = proj4(WGS84, projection, p2);

    // Euclidean distance in projected space (meters)
    const lengthMeters = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

    const midpoint = turf.midpoint(p1, p2).geometry.coordinates as [number, number];

    dimensions.push({
      point: midpoint,
      lengthMeters,
      label: formatKaramFeet(lengthMeters)
    });
  }

  return dimensions;
}

/**
 * Calculates projected area in square meters.
 */
export function calculateProjectedArea(feature: any, crs: CRS): number {
  const projection = crs === 'UTM42N' ? UTM42N : UTM43N;
  const coords = feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates[0]
    : feature.geometry.coordinates[0][0];

  // Simple polygon area formula in projected space
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = proj4(WGS84, projection, coords[i]);
    const [x2, y2] = proj4(WGS84, projection, coords[i + 1]);
    area += (x1 * y2) - (x2 * y1);
  }
  return Math.abs(area) / 2;
}
