import * as turf from '@turf/turf';

export interface Dimension {
  point: [number, number]; // [lng, lat]
  length: number;
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
 * Converts area in square meters to Kanal-Marla units.
 * Using the logic from the original ArcMap script:
 * 1 Sq Karam = 30.25 Sq Ft
 * 1 Marla = 272.25 Sq Ft
 * 1 Kanal = 20 Marlas
 * 
 * Note: If the input area is in Square Meters (typical for GeoJSON), 
 * we first convert to Sq Ft.
 */
export function calculateKanalMarla(areaSqMeters: number): KhasraStats {
  // 1 square meter = 10.7639 square feet
  const areaSqFt = areaSqMeters * 10.7639;
  const totalMarlas = areaSqFt / 272.25;
  
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
 * Calculates dimensions (lengths and midpoints) for each segment of a polygon.
 */
export function calculateDimensions(feature: any): Dimension[] {
  const dimensions: Dimension[] = [];
  const coords = feature.geometry.type === 'Polygon' 
    ? feature.geometry.coordinates[0] 
    : feature.geometry.coordinates[0][0];

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    
    // Calculate length in meters (using turf for accuracy with lat/lng)
    const line = turf.lineString([p1, p2]);
    const lengthMeters = turf.length(line, { units: 'meters' });
    
    // Convert meters to 'Karams' if needed, but here we just show length in a readable format.
    // The user's script showed length_val directly from math.hypot.
    // In many local revenue maps, units are indeed Karams.
    // For now, we'll provide meters and raw units if possible.
    
    const midpoint = turf.midpoint(p1, p2).geometry.coordinates as [number, number];
    
    dimensions.push({
      point: midpoint,
      length: lengthMeters,
      label: lengthMeters.toFixed(2)
    });
  }
  
  return dimensions;
}
