// GET/POST /api/shadow/points — recensement des points informels (T44)
// GET : filtres status / typology / gouvernorat / active / search + pagination.
// POST : signalement d'un nouveau point → statut BRUT + update APPARITION +
// alerte NEW_POINTS si le point est à moins de notifyRadiusM d'une station.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import {
  getDataset, invalidateShadowCache, nearestStationFor, nextShadowCode,
  pointDTO, pointLossTnd, captureFactor,
} from "@/app/api/shadow/_lib"

export const dynamic = "force-dynamic"

const list = (v: string | null) =>
  v?.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) ?? []

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const status = list(sp.get("status"))
  const typology = list(sp.get("typology") ?? sp.get("typologyCode"))
  const gouvernorat = sp.get("gouvernorat")?.trim() || undefined
  const activeParam = sp.get("active")
  const search = sp.get("search")?.trim() || undefined
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 200))
  const offset = Math.max(0, Number(sp.get("offset")) || 0)

  const where: Record<string, unknown> = {}
  if (status.length) where.status = status.length === 1 ? status[0] : { in: status }
  if (typology.length) where.typologyCode = typology.length === 1 ? typology[0] : { in: typology }
  if (gouvernorat) where.gouvernorat = gouvernorat
  if (activeParam === "true" || activeParam === "false") where.active = activeParam === "true"
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { cite: { contains: search } },
      { delegation: { contains: search } },
      { notes: { contains: search } },
      { reporter: { contains: search } },
      { gouvernorat: { contains: search } },
    ]
  }

  const ds = await getDataset()
  const [rows, total] = await Promise.all([
    db.shadowPoint.findMany({ where, orderBy: { firstSeenAt: "desc" }, take: limit, skip: offset }),
    db.shadowPoint.count({ where }),
  ])

  // Enrichissement : perte + station la plus proche (dataset pour les points
  // effectifs, calcul à la volée sinon).
  const byId = new Map(ds.points.map(p => [p.id, p]))
  const points = rows.map(r => {
    const eff = byId.get(r.id)
    if (eff) return pointDTO(eff, eff.lossTnd, eff.nearest)
    return pointDTO(r, pointLossTnd(r.volumeLJ, ds.config.marginTndPerL), nearestStationFor(r.lat, r.lng, ds))
  })

  return NextResponse.json({ points, total, typologies: ds.typologies })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }

  const typologyCode = String(body.typologyCode ?? "").trim().toUpperCase()
  const gouvernorat = String(body.gouvernorat ?? "").trim()
  const delegation = String(body.delegation ?? "").trim()
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  const volumeLJ = Number(body.volumeLJ)

  const ds = await getDataset()
  const typo = ds.typologies.find(t => t.code === typologyCode)
  if (!typo || !typo.active) return NextResponse.json({ error: "Typologie inconnue ou inactive" }, { status: 400 })
  if (!gouvernorat || !delegation) return NextResponse.json({ error: "Gouvernorat et délégation requis" }, { status: 400 })
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 29 || lat > 38 || lng < 7 || lng > 12.5) {
    return NextResponse.json({ error: "Coordonnées invalides (Tunisie)" }, { status: 400 })
  }
  if (!Number.isFinite(volumeLJ) || volumeLJ < 0 || volumeLJ > 100000) {
    return NextResponse.json({ error: "Volume L/j invalide (0–100 000)" }, { status: 400 })
  }
  const priceMillimes = body.priceMillimes === null || body.priceMillimes === undefined
    ? null
    : Number(body.priceMillimes)
  if (priceMillimes !== null && (!Number.isFinite(priceMillimes) || priceMillimes < 0 || priceMillimes > 5000)) {
    return NextResponse.json({ error: "Prix en millimes invalide" }, { status: 400 })
  }

  const session = await getSessionUser()
  const reporter = String(body.reporter ?? "").trim() || session?.name || "équipe plateforme"
  const source = ["AGENT", "CONTROLEUR", "AUDIT", "CONTRIBUTION"].includes(String(body.source))
    ? String(body.source)
    : "AGENT"

  const nearest = nearestStationFor(lat, lng, ds)
  const existingCodes = await db.shadowPoint.findMany({ select: { code: true } })
  const code = nextShadowCode(existingCodes)

  const point = await db.shadowPoint.create({
    data: {
      code, typologyCode, status: "BRUT", gouvernorat, delegation,
      cite: body.cite ? String(body.cite).slice(0, 120) : null,
      lat, lng, volumeLJ: Math.round(volumeLJ), priceMillimes: priceMillimes === null ? null : Math.round(priceMillimes),
      photoUrl: body.photoUrl ? String(body.photoUrl) : null,
      notes: String(body.notes ?? "").slice(0, 500),
      source, reporter, brandThreat: nearest?.brandSlug ?? null,
      firstSeenAt: new Date(), lastCheckAt: new Date(), active: true,
    },
  })

  // Update « APPARITION »
  await db.shadowPointUpdate.create({
    data: {
      pointId: point.id, kind: "APPARITION", oldValue: null,
      newValue: `${typo.label} — ${gouvernorat}`, author: reporter, date: new Date(),
    },
  })

  // Alerte NEW_POINTS : point à moins de notifyRadiusM d'une station
  let alert: { id: string } | null = null
  const cfg = ds.config
  if (cfg.notifyActive && nearest && nearest.distanceM <= cfg.notifyRadiusM) {
    const capture = captureFactor(nearest.distanceM, cfg.cannibRadiusM)
    const loss = Math.round(pointLossTnd(volumeLJ, cfg.marginTndPerL) * capture)
    alert = await db.shadowAlert.create({
      data: {
        severity: loss >= cfg.lossOrangeTnd ? "CRITICAL" : "MEDIUM",
        kind: "NEW_POINTS",
        title: `${gouvernorat} : nouveau point à ${nearest.distanceM} m de la station ${nearest.name}`,
        detail: `Nouveau point informel (${typo.label}, ~${Math.round(volumeLJ)} L/j) signalé à ${nearest.distanceM} m de la station ${nearest.name} (${nearest.brandName}). Perte estimée sur la station : ~${loss.toLocaleString("fr-FR")} DT/mois.`,
        zone: gouvernorat, stationCode: nearest.code, stationName: nearest.name,
        lossTnd: loss, date: new Date(), read: false,
      },
    })
  }

  invalidateShadowCache()

  return NextResponse.json(
    { point: pointDTO(point, pointLossTnd(point.volumeLJ, cfg.marginTndPerL), nearest), alert },
    { status: 201 },
  )
}
