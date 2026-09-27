// GET /api/shadow/impact/trend?gouvernorat= — tendance 12 mois (T44)
// Série mensuelle nationale ; si un gouvernorat est fourni, la série est
// re-scalée au poids du gouvernorat (part des points actifs).
import { NextRequest, NextResponse } from "next/server"
import { getDataset } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gov = req.nextUrl.searchParams.get("gouvernorat")?.trim() || null
  const ds = await getDataset()

  let monthly = ds.monthly
  if (gov) {
    const govPoints = ds.points.filter(p => p.gouvernorat === gov)
    if (govPoints.length === 0) {
      return NextResponse.json({ error: `Aucun point informel recensé dans « ${gov} »` }, { status: 404 })
    }
    // Approximation : re-scale au poids du gouvernorat sur les points actifs
    const weight = govPoints.length / (ds.totals.points || 1)
    monthly = ds.monthly.map(m => ({
      ...m,
      activePoints: Math.max(0, Math.round(m.activePoints * weight)),
      newPoints: Math.max(0, Math.round(m.newPoints * weight)),
      closedPoints: Math.max(0, Math.round(m.closedPoints * weight)),
      estLossTnd: Math.max(0, Math.round(m.estLossTnd * weight)),
    }))
  }

  return NextResponse.json({ monthly })
}
