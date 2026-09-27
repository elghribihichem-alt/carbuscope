// POST /api/shadow/impact/simulation — simulation « what-if » prix (T44)
// Baisse du prix officiel de X millimes/L → réduction de l'écart informel :
// élasticité de report ≈ 0,12 pt de volume informel en moins par millime
// (10 millimes ≈ 1,2 pt), plafonnée à 65 %. Progression sur les semaines.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getDataset } from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const priceCutMillimes = Number(body.priceCutMillimes)
  if (!Number.isFinite(priceCutMillimes) || priceCutMillimes < 10 || priceCutMillimes > 800) {
    return NextResponse.json({ error: "Baisse de prix requise (10–800 millimes/L)" }, { status: 400 })
  }
  const weeks = Number(body.weeks)
  const W = Number.isFinite(weeks) ? Math.min(52, Math.max(4, Math.round(weeks))) : 12

  const gouvernorat = body.gouvernorat ? String(body.gouvernorat).trim() : null
  const stationCode = body.stationCode ? String(body.stationCode).trim() : null

  const ds = await getDataset()

  // --- Périmètre de la simulation ---
  let scopeLabel = "National"
  let basePoints = ds.totals.points
  let baseVolume = ds.totals.volumeLJ
  let baseLoss = ds.totals.lossTnd

  if (stationCode) {
    const station = await db.station.findUnique({ where: { code: stationCode } })
    if (!station) return NextResponse.json({ error: "Station introuvable" }, { status: 404 })
    const threat = ds.stations.find(s => s.code === stationCode)
    scopeLabel = station.name
    basePoints = threat?.points ?? 0
    baseVolume = threat?.volumeStolenLJ ?? 0
    baseLoss = threat?.lossTnd ?? 0
  } else if (gouvernorat) {
    const pts = ds.points.filter(p => p.gouvernorat === gouvernorat)
    if (pts.length === 0) {
      return NextResponse.json({ error: `Aucun point informel recensé dans « ${gouvernorat} »` }, { status: 404 })
    }
    scopeLabel = gouvernorat
    basePoints = pts.length
    baseVolume = pts.reduce((s, p) => s + p.volumeLJ, 0)
    baseLoss = Math.round(pts.reduce((s, p) => s + p.lossTnd, 0))
  }

  // --- Modèle : 10 millimes de baisse ≈ 1,2 pt de volume informel en moins ---
  const maxReductionPct = Math.min(65, priceCutMillimes * 0.12)
  const curve: { week: number; baselineTnd: number; projectedTnd: number }[] = []
  let recovered = 0
  for (let w = 1; w <= W; w++) {
    const ramp = Math.min(1, w / W) // montée en charge progressive
    const projected = Math.round(baseLoss * (1 - (maxReductionPct / 100) * ramp))
    curve.push({ week: w, baselineTnd: baseLoss, projectedTnd: projected })
    recovered += (baseLoss - projected) * (7 / 30.4)
  }

  const factor = 1 - maxReductionPct / 100
  return NextResponse.json({
    baseline: { lossTnd: baseLoss, points: basePoints, volumeLJ: baseVolume },
    projected: {
      lossTnd: Math.round(baseLoss * factor),
      points: Math.round(basePoints * (1 - (maxReductionPct / 100) * 0.5)),
      volumeLJ: Math.round(baseVolume * factor),
      recoveredTnd: Math.round(recovered),
    },
    curve,
    assumptions: {
      elasticity: 0.12, // pt de volume informel en moins par millime de baisse
      informalSensitivity: 65, // plafond de report (%)
      priceCutMillimes: Math.round(priceCutMillimes),
      note: `Une baisse de ${Math.round(priceCutMillimes)} millimes/L du prix officiel réduit l'écart informel : −${maxReductionPct.toFixed(1)} pt de volume informel à terme (élasticité 1,2 pt / 10 millimes, plafond 65 %). Effet progressif sur ${W} semaines.`,
    },
    scopeLabel,
  })
}
