// CarbuScope — Géométrie : projection Tunisie, distances, sélections

export const MAP_W = 520
export const MAP_H = 1000
export const MAP_PAD = 26

export const TUNISIA = { minLng: 7.3, maxLng: 11.85, minLat: 29.95, maxLat: 37.42 }

/** Projection équirectangulaire corrigée (Tunisie) → coordonnées SVG */
export function project(lng: number, lat: number): { x: number; y: number } {
  const x = MAP_PAD + ((lng - TUNISIA.minLng) / (TUNISIA.maxLng - TUNISIA.minLng)) * (MAP_W - 2 * MAP_PAD)
  const y = MAP_PAD + ((TUNISIA.maxLat - lat) / (TUNISIA.maxLat - TUNISIA.minLat)) * (MAP_H - 2 * MAP_PAD)
  return { x, y }
}

export function unproject(x: number, y: number): { lng: number; lat: number } {
  const lng = TUNISIA.minLng + ((x - MAP_PAD) / (MAP_W - 2 * MAP_PAD)) * (TUNISIA.maxLng - TUNISIA.minLng)
  const lat = TUNISIA.maxLat - ((y - MAP_PAD) / (MAP_H - 2 * MAP_PAD)) * (TUNISIA.maxLat - TUNISIA.minLat)
  return { lng, lat }
}

const R = 6371
const rad = (d: number) => (d * Math.PI) / 180

/** Distance haversine en km */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** km → rayon en unités SVG (approximation locale) */
export function kmToSvgUnits(km: number): number {
  const pxPerDegLat = (MAP_H - 2 * MAP_PAD) / (TUNISIA.maxLat - TUNISIA.minLat)
  return (km / 111) * pxPerDegLat
}

export function svgUnitsToKm(units: number): number {
  const pxPerDegLat = (MAP_H - 2 * MAP_PAD) / (TUNISIA.maxLat - TUNISIA.minLat)
  return (units / pxPerDegLat) * 111
}

/** Test point dans polygone (ray casting), points au format [lng, lat] */
export function pointInPolygon(lng: number, lat: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonAreaKm2(polygon: [number, number][]): number {
  // approximation : projection locale autour du centroïde
  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  const kx = Math.cos(rad(cy)) * 111
  const ky = 111
  let area = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    area += (xi - cx) * kx * ((yj - cy) * ky) - (xj - cx) * kx * ((yi - cy) * ky)
  }
  return Math.abs(area / 2)
}
