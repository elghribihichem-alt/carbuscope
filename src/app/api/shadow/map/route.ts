// GET /api/shadow/map — données cartographiques du marché parallèle (T44)
// Points actifs (nationaux), stations menacées (avec perte/level), heatmap
// gouvernorats, zones rouges (grille 1,5 km), axes routiers, typologies, config.
// Scope BRAND : les points restent nationaux, seules les stations annotées
// sont celles de l'enseigne.
import { NextRequest, NextResponse } from "next/server"
import {
  getDataset, resolveScope, pointDTO, computeRedZones, govLossesForBrand,
} from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const scope = await resolveScope(req)
  const ds = await getDataset()

  const brandSlug = scope.scope === "BRAND" ? scope.brandSlug : null

  // Points informels actifs — nationaux (y compris pour une enseigne)
  const points = ds.points.map(p => pointDTO(p, p.lossTnd, p.nearest))

  // Stations menacées (≥ 1 point dans le rayon) — BRAND : ses stations seulement
  const stations = ds.stations
    .filter(s => s.points > 0 && (!brandSlug || s.brandSlug === brandSlug))
    .map(s => ({
      code: s.code, name: s.name, brandSlug: s.brandSlug, brandName: s.brandName,
      brandColor: s.brandColor, gouvernorat: s.gouvernorat, delegation: s.delegation,
      lat: s.lat, lng: s.lng, points: s.points, lossTnd: s.lossTnd, level: s.level,
    }))

  const govHeat = brandSlug ? govLossesForBrand(ds, brandSlug) : ds.govNational
  const redZones = computeRedZones(ds.points, ds.config)

  return NextResponse.json({
    scope: scope.scope,
    points,
    stations,
    govHeat,
    redZones,
    roads: ds.roads,
    typologies: ds.typologies,
    config: ds.config,
  })
}
