// GET /api/shadow/impact/station?code= — impact détaillé sur une station (T44)
// Points informels dans le rayon de cannibalisation (distance, volume capté),
// perte mensuelle, part du trafic captée, stations voisines comparées.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { haversineKm } from "@/lib/geo"
import { getDataset, pointDTO, captureFactor, levelForLoss } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim()
  if (!code) return NextResponse.json({ error: "Paramètre code requis" }, { status: 400 })

  const station = await db.station.findUnique({ where: { code }, include: { brand: true } })
  if (!station) return NextResponse.json({ error: "Station introuvable" }, { status: 404 })

  const ds = await getDataset()
  const radiusM = ds.config.cannibRadiusM
  const margin = ds.config.marginTndPerL

  // Points dans le rayon, triés par distance
  const withDist = ds.points
    .map(p => {
      const distanceM = haversineKm(station.lat, station.lng, p.lat, p.lng) * 1000
      return { p, distanceM }
    })
    .filter(x => x.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)

  const points = withDist.map(x => ({
    ...pointDTO(x.p, x.p.lossTnd, x.p.nearest),
    distanceM: Math.round(x.distanceM),
    capturedLJ: Math.round(x.p.volumeLJ * captureFactor(x.distanceM, radiusM)),
  }))
  const volumeStolenLJ = Math.round(
    withDist.reduce((s, x) => s + x.p.volumeLJ * captureFactor(x.distanceM, radiusM), 0),
  )
  const lossTnd = Math.round(
    withDist.reduce((s, x) => s + x.p.lossTnd * captureFactor(x.distanceM, radiusM), 0),
  )
  const denominator = station.traffic * 8
  const capturedPct = denominator > 0 ? Math.round((volumeStolenLJ / denominator) * 1000) / 10 : 0

  // 5 stations les plus proches avec leur propre niveau de menace
  const nearbyStations = ds.stations
    .filter(s => s.code !== station.code)
    .map(s => ({ s, km: haversineKm(station.lat, station.lng, s.lat, s.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5)
    .map(({ s }) => ({
      code: s.code, name: s.name, brandName: s.brandName, brandColor: s.brandColor,
      lossTnd: s.lossTnd, points: s.points,
    }))

  return NextResponse.json({
    station: {
      code: station.code, name: station.name,
      brandSlug: station.brand?.slug ?? "independants",
      brandName: station.brand?.name ?? "Indépendants",
      brandColor: station.brand?.color ?? "#64748b",
      gouvernorat: station.gouvernorat, delegation: station.delegation,
      lat: station.lat, lng: station.lng, traffic: station.traffic, status: station.status,
    },
    points,
    lossTnd,
    volumeStolenLJ,
    capturedPct,
    level: levelForLoss(lossTnd, ds.config),
    nearbyStations,
    config: ds.config,
  })
}
