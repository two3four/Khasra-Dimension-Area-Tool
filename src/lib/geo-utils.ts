import * as turf from '@turf/turf';
import proj4 from 'proj4';

// UTM Zone definitions
const UTM42N = "+proj=utm +zone=42 +datum=WGS84 +units=m +no_defs";
const UTM43N = "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs";
const WGS84 = "EPSG:4326";

export type CRS = 'UTM42N' | 'UTM43N';

// Conversion Constants (Standard: 1 Karam = 5.5 Feet)
const KARAM_TO_FEET = 5.5;
const MARLA_TO_SQ_FT = 272.25; // Standard Marla
const SQ_METER_TO_SQ_FT = 10.7639;

export interface Dimension {
  point: [number, number]; // [lng, lat]
  lengthMeters: number;
  label: string;
}

export interface KhasraStats {
  areaSqFt: number;
  totalMarlas: number;
  kanals: number;
  marlas: number;
  label: string;
}

/**
 * Formats a distance in meters into "Xk - Yft" (Karam and Feet).
 * 1 Karam = 5.5 Feet.
 */
export function formatKaramFeet(meters: number): string {
  const feet = meters * 3.28084;
  const karams = Math.floor(feet / KARAM_TO_FEET);
  const remainingFeet = feet - (karams * KARAM_TO_FEET);

  if (karams > 0) {
    return `${karams}k - ${remainingFeet.toFixed(1)}ft`;
  }
  return `${remainingFeet.toFixed(1)}ft`;
}

/**
 * Converts area in square meters (projected) to Kanal-Marla units.
 * 1 Sq Karam = 30.25 Sq Ft
 * 1 Marla = 272.25 Sq Ft
 * 1 Kanal = 20 Marlas
 */
export function calculateKanalMarla(areaSqMeters: number): KhasraStats {
  // Use accurate projected area conversion
  const areaSqFt = areaSqMeters * SQ_METER_TO_SQ_FT;
  const totalMarlas = areaSqFt / MARLA_TO_SQ_FT;

  const kanals = Math.floor(totalMarlas / 20);
  const remainingMarlas = totalMarlas - (kanals * 20);

  let label = '';
  if (kanals > 0) {
    label = `${kanals} K - ${remainingMarlas.toFixed(2)} M`;
  } else {
    label = `${remainingMarlas.toFixed(2)} Marla`;
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
