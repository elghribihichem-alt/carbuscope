// GET/POST /api/shadow/reports — rapports mensuels du marché parallèle (T44)
// GET ?month= : synthèse du mois (série mensuelle + KPIs live), top menaces,
// pertes par gouvernorat, recommandations générées, enseignes, exports.
// POST : génère une entrée Report (modèle Report, type « SHADOW »).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import {
  getDataset, resolveScope, monthLabel, fmtTnd, computeRedZones,
  govLossesForBrand, topThreatsFor,
} from "@/app/api/shadow/_lib"
import type { ShadowBrandLossDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

const FORMATS = ["PDF", "Excel", "CSV"]

export async function GET(req: NextRequest) {
  const scope = await resolveScope(req)
  const ds = await getDataset()
  const brandSlug = scope.scope === "BRAND" ? scope.brandSlug : null

  const monthParam = req.nextUrl.searchParams.get("month")?.trim()
  if (monthParam && !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ error: "Format de mois invalide (AAAA-MM attendu)" }, { status: 400 })
  }
  const month = monthParam ?? ds.monthly[ds.monthly.length - 1]?.month
  if (!month) return NextResponse.json({ error: "Aucune statistique mensuelle disponible" }, { status: 404 })

  const stat = await db.shadowMonthlyStat.findUnique({ where: { month } })
  if (!stat) return NextResponse.json({ error: `Aucune statistique pour ${month}` }, { status: 404 })

  const [pendingValidation, realReports] = await Promise.all([
    db.shadowPoint.count({ where: { status: { in: ["BRUT", "VERIFIE"] } } }),
    db.report.findMany({ where: { type: "SHADOW" }, orderBy: { createdAt: "desc" }, take: 6 }),
  ])

  // Perte du périmètre pour le mois demandé (lentille BRAND : re-scalée au
  // poids actuel de l'enseigne dans la perte nationale).
  const brandAgg = brandSlug ? ds.brandAgg.get(brandSlug) : null
  const brandShare = brandAgg && ds.totals.lossTnd > 0 ? brandAgg.lossTnd / ds.totals.lossTnd : 1
  const estLossTnd = Math.round(stat.estLossTnd * brandShare)

  const govLosses = brandSlug ? govLossesForBrand(ds, brandSlug) : ds.govNational
  const topThreats = topThreatsFor(ds, brandSlug, 10)

  // --- Recommandations générées (FR, contextuelles) ---
  const recommendations: string[] = []
  const redZones = computeRedZones(ds.points, ds.config)
  const worstZone = redZones[0]
  if (worstZone) {
    recommendations.push(
      `Zone rouge prioritaire : ${worstZone.label} (${worstZone.gouvernorat}) — ${worstZone.points} points actifs et ${fmtTnd(worstZone.lossTnd)} DT/mois de perte estimée. Programmer un passage conjoint douanes / brigade sous 15 jours.`,
    )
  }
  const brandInfo = new Map<string, { name: string }>()
  for (const s of ds.stations) brandInfo.set(s.brandSlug, { name: s.brandName })
  const topBrand = [...ds.brandAgg.values()].sort((a, b) => b.lossTnd - a.lossTnd)[0]
  if (topBrand) {
    recommendations.push(
      `${brandInfo.get(topBrand.brandSlug)?.name ?? topBrand.brandSlug} est l'enseigne la plus touchée : ${fmtTnd(topBrand.lossTnd)} DT/mois de marge perdue sur ${topBrand.stationsThreatened} stations menacées — concentrer la surveillance sur les points à moins de 500 m.`,
    )
  }
  const topGov = ds.govNational[0]
  if (topGov && ds.totals.points > 0) {
    recommendations.push(
      `${topGov.gouvernorat} concentre ${Math.round((topGov.points / ds.totals.points) * 100)} % des points informels recensés (${topGov.points} points) : étendre le recensement aux délégations limitrophes.`,
    )
  }
  const cut40 = Math.min(65, 40 * 0.12)
  recommendations.push(
    `Action prix : une baisse de 40 millimes/L du prix officiel réduirait d'environ ${cut40.toFixed(1)} % le volume informel, soit ~${fmtTnd((ds.totals.lossTnd * cut40) / 100)} DT/mois de perte évitée (voir simulateur).`,
  )
  if (pendingValidation > 0) {
    recommendations.push(
      `${pendingValidation} signalements en attente de validation (BRUT / VERIFIE) : prioriser les BRUT de plus de 7 jours pour assainir la file.`,
    )
  }

  // --- Pertes par enseigne (lentille scope) ---
  const allBrandsLoss = [...ds.brandAgg.values()].reduce((s, b) => s + b.lossTnd, 0) || 1
  const allBrands: ShadowBrandLossDTO[] = [...ds.brandAgg.values()]
    .map(b => ({
      brandSlug: b.brandSlug,
      brandName: brandInfo.get(b.brandSlug)?.name ?? b.brandSlug,
      brandColor: ds.stations.find(s => s.brandSlug === b.brandSlug)?.brandColor ?? "#64748b",
      lossTnd: Math.round(b.lossTnd),
      stationsThreatened: b.stationsThreatened,
      points: b.pointLoss.size,
      sharePct: Math.round((b.lossTnd / allBrandsLoss) * 1000) / 10,
    }))
    .sort((a, b) => b.lossTnd - a.lossTnd)
  const brands = brandSlug ? allBrands.filter(b => b.brandSlug === brandSlug) : allBrands

  // --- Exports : rapports réellement générés + entrées simulées cohérentes ---
  const realExports = realReports.map(r => ({
    id: r.id, name: r.name, format: r.format, sizeKb: r.sizeKb,
    createdAt: r.createdAt.toISOString(), scope: r.scope,
  }))
  const coveredMonths = new Set(realReports.map(r => r.period))
  const synthMonths = ds.monthly
    .slice(-5)
    .filter(m => m.month !== month && !coveredMonths.has(m.month))
    .slice(-5)
  const synthExports = synthMonths.map((m, i) => ({
    id: `shadow-export-${m.month}`,
    name: `Rapport mensuel — ${m.label}`,
    format: FORMATS[i % FORMATS.length],
    sizeKb: 1200 + ((Number(m.month.slice(5)) * 137) % 2400),
    createdAt: new Date(`${m.month}-28T12:00:00.000Z`).toISOString(),
    scope: "National",
  }))
  const exports = [...realExports, ...synthExports].slice(0, 6)

  const summary = {
    activePoints: stat.activePoints,
    estLossTnd,
    stationsThreatened: brandAgg ? brandAgg.stationsThreatened : ds.totals.stationsThreatened,
    newPoints: stat.newPoints,
    neutralized: stat.closedPoints,
    pendingValidation,
    topGouvernorat: ds.govNational[0]?.gouvernorat ?? "",
  }

  return NextResponse.json({
    month,
    monthLabel: monthLabel(month),
    generatedAt: new Date().toISOString(),
    summary,
    topThreats,
    govLosses,
    recommendations: recommendations.slice(0, 5),
    brands,
    exports,
  })
}

export async function POST(req: NextRequest) {
  const scope = await resolveScope(req)
  const ds = await getDataset()
  const month = ds.monthly[ds.monthly.length - 1]?.month
  if (!month) return NextResponse.json({ error: "Aucune statistique mensuelle disponible" }, { status: 404 })

  const session = await getSessionUser()
  const report = await db.report.create({
    data: {
      // Modèle Report existant — type « SHADOW » (module marché parallèle)
      name: `Rapport mensuel Shadow Market — ${monthLabel(month)}`,
      type: "SHADOW",
      period: month,
      scope: scope.scopeLabel,
      format: "PDF",
      generatedBy: session?.name ?? "Plateforme",
      sizeKb: 1200 + Math.floor(Math.random() * 2400),
    },
  })
  return NextResponse.json({ ok: true, id: report.id }, { status: 201 })
}
