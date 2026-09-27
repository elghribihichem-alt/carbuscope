// GET /api/shadow/impact/region — impact régional & par enseigne (T44)
// Gouvernorats (lentille scope), pertes par enseigne (part de la cannibalisation),
// total national pour comparaison.
import { NextRequest, NextResponse } from "next/server"
import { getDataset, resolveScope, govLossesForBrand } from "@/app/api/shadow/_lib"
import type { ShadowBrandLossDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const scope = await resolveScope(req)
  const ds = await getDataset()

  const brandSlug = scope.scope === "BRAND" ? scope.brandSlug : null
  const gouvernorats = brandSlug ? govLossesForBrand(ds, brandSlug) : ds.govNational

  // Pertes par enseigne (cannibalisation de leurs stations)
  const brandInfo = new Map<string, { name: string; color: string }>()
  for (const s of ds.stations) brandInfo.set(s.brandSlug, { name: s.brandName, color: s.brandColor })
  const allBrandsLoss = [...ds.brandAgg.values()].reduce((s, b) => s + b.lossTnd, 0) || 1
  const allBrands: ShadowBrandLossDTO[] = [...ds.brandAgg.values()]
    .map(b => ({
      brandSlug: b.brandSlug,
      brandName: brandInfo.get(b.brandSlug)?.name ?? b.brandSlug,
      brandColor: brandInfo.get(b.brandSlug)?.color ?? "#64748b",
      lossTnd: Math.round(b.lossTnd),
      stationsThreatened: b.stationsThreatened,
      points: b.pointLoss.size,
      sharePct: Math.round((b.lossTnd / allBrandsLoss) * 1000) / 10,
    }))
    .sort((a, b) => b.lossTnd - a.lossTnd)
  const brands = brandSlug ? allBrands.filter(b => b.brandSlug === brandSlug) : allBrands

  // Total : toujours national (comparaison), les points informels sont nationaux
  return NextResponse.json({
    gouvernorats,
    brands,
    total: {
      points: ds.totals.points,
      lossTnd: ds.totals.lossTnd,
      stationsThreatened: ds.totals.stationsThreatened,
      volumeLJ: ds.totals.volumeLJ,
    },
  })
}
