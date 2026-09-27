// Shadow Market (T44-c) — utilitaires cartographie : export CSV (BOM UTF-8,
// séparateur « ; », pattern report-csv.ts du projet) et géométrie
// point→polyaxe (projection oblique pour la vue linéaire « Par Axe Routier »).

import type { ShadowPointDTO } from "@/lib/types"

// ---------------------------------------------------------------------------
// Export CSV des points affichés
// ---------------------------------------------------------------------------

const CSV_ESCAPE = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Construit le CSV « ; » des points (BOM ajouté au Blob par l'appelant). */
export function buildPointsCsv(points: ShadowPointDTO[]): string {
  const header = [
    "Code", "Typologie", "Statut", "Gouvernorat", "Délégation", "Cité",
    "Latitude", "Longitude", "Volume (L/j)", "Prix (millimes)", "Perte (DT/mois)",
    "Station la plus proche", "Enseigne station", "Distance (m)",
    "Source", "Rapporteur", "Dernier contrôle", "Notes",
  ].join(";")
  const rows = points.map(p =>
    [
      p.code, p.typologyCode, p.status, p.gouvernorat, p.delegation, p.cite ?? "",
      p.lat.toFixed(5), p.lng.toFixed(5), p.volumeLJ, p.priceMillimes ?? "", Math.round(p.lossTnd),
      p.nearestStation?.name ?? "", p.nearestStation?.brandName ?? "",
      p.nearestStation ? Math.round(p.nearestStation.distanceM) : "",
      p.source, p.reporter, new Date(p.lastCheckAt).toISOString().slice(0, 10), p.notes,
    ].map(CSV_ESCAPE).join(";")
  )
  return [header, ...rows].join("\r\n")
}

/** Télécharge le CSV des points (BOM UTF-8 pour Excel FR). */
export function downloadPointsCsv(points: ShadowPointDTO[], context: string): void {
  if (!points.length) return
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([`\ufeff${buildPointsCsv(points)}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `shadow-points-${context}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Géométrie point → polyaxe routier (projection locale en km)
// ---------------------------------------------------------------------------

export interface PolylineProjection {
  /** Distance cumulée le long de l'axe au point projeté (km). */
  alongKm: number
  /** Écart latéral signé (km) — positif = à gauche de l'axe (est→ouest). */
  lateralKm: number
  /** Distance absolue à l'axe (km). */
  distanceKm: number
}

const KM_PER_DEG_LAT = 110.574
const kmPerDegLng = (lat: number) => 111.320 * Math.cos((lat * Math.PI) / 180)

/**
 * Projette un point (lng, lat) sur une polyligne [lng, lat][] :
 * distance à l'axe + position le long de l'axe (pour la vue linéaire).
 */
export function projectOnPolyline(lng: number, lat: number, segments: [number, number][]): PolylineProjection {
  let best: PolylineProjection = { alongKm: 0, lateralKm: 0, distanceKm: Number.POSITIVE_INFINITY }
  let cumKm = 0
  for (let i = 0; i < segments.length - 1; i++) {
    const [lng1, lat1] = segments[i]
    const [lng2, lat2] = segments[i + 1]
    const midLat = (lat1 + lat2) / 2
    const kx = kmPerDegLng(midLat)
    const ax = (lng1 - lng) * kx
    const ay = (lat1 - lat) * KM_PER_DEG_LAT
    const bx = (lng2 - lng) * kx
    const by = (lat2 - lat) * KM_PER_DEG_LAT
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    // t ∈ [0,1] borné sur le segment
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0
    const px = ax + t * dx // point projeté − point
    const py = ay + t * dy
    const distKm = Math.hypot(px, py)
    if (distKm < best.distanceKm) {
      const segLenKm = Math.hypot(dx, dy)
      best = {
        alongKm: cumKm + t * segLenKm,
        lateralKm: px * dy - py * dx < 0 ? -distKm : distKm, // signe via produit vectoriel
        distanceKm: distKm,
      }
    }
    cumKm += Math.hypot(dx, dy)
  }
  return best
}

/** Longueur totale d'une polyligne (km). */
export function polylineLengthKm(segments: [number, number][]): number {
  let total = 0
  for (let i = 0; i < segments.length - 1; i++) {
    const midLat = (segments[i][1] + segments[i + 1][1]) / 2
    const kx = kmPerDegLng(midLat)
    total += Math.hypot((segments[i + 1][0] - segments[i][0]) * kx, (segments[i + 1][1] - segments[i][1]) * KM_PER_DEG_LAT)
  }
  return total
}
