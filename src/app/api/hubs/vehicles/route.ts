import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T55-C-a — GET /api/hubs/vehicles : base clients TMP enrichie (hub, compte
// d'interventions, dernier service, conversions, badge d'alerte dérivé côté
// serveur). Filtres SQL : brand (join MobilityHub.brandSlug), hubId, q
// (recherche plaque/marque/modèle, insensible). Le filtre « alertes » est
// affiné en mémoire APRÈS jointures (l'alerte est une dérivation documentée —
// impossible en SQL pur avec Prisma).
//
// Dérivation V1 des alertes (honnête, documentée dans l'UI) :
//   • VIDANGE_DUE — dernière vidange > 180 j, OU jamais de vidange alors que
//     km > 15 000, OU lastVisit null / > 180 j (véhicule perdu de vue).
//     (Le km au moment de la dernière vidange n'est pas historisé —
//     l'intervalle « 10 000 km » ne peut pas être reconstitué.)
//   • LOYALTY_NEAR — ≥ 180 points : la récompense « Or » est atteinte.

const DAY_MS = 24 * 3600 * 1000

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const brand = sp.get("brand") || null
  const hubId = sp.get("hubId") || null
  const q = (sp.get("q") || "").trim()
  const alertes = sp.get("alertes") === "true"
  const limitRaw = Number(sp.get("limit"))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.round(limitRaw)) : 200

  // Clause where SQL : périmètre enseigne/hub + recherche plaque/marque.
  const where: Record<string, unknown> = {}
  const hubClause: Record<string, unknown> = {}
  if (brand) hubClause.brandSlug = brand
  if (hubId) hubClause.id = hubId
  if (Object.keys(hubClause).length) where.hub = hubClause
  if (q) {
    where.OR = [
      { plate: { contains: q } },
      { brand: { contains: q } },
      { model: { contains: q } },
    ]
  }

  const vehicles = await db.hubVehicle.findMany({
    where,
    orderBy: [{ lastVisit: "desc" }, { plate: "asc" }],
    include: {
      hub: { select: { code: true, name: true, gouvernorat: true, brandSlug: true } },
      // Jointures nécessaires à la dérivation des alertes et à l'enrichissement
      // (compteur, dernier service, dernière vidange) — ~500 interventions au
      // total en base, l'agrégation mémoire reste donc sur un petit ensemble.
      interventions: { select: { serviceType: true, createdAt: true } },
      _count: { select: { conversions: true } },
    },
  })

  const now = Date.now()
  const d180 = now - 180 * DAY_MS

  const enriched = vehicles.map(v => {
    const lastVidange = v.interventions
      .filter(i => i.serviceType === "VIDANGE")
      .reduce<number | null>((acc, i) => (acc === null || i.createdAt.getTime() > acc ? i.createdAt.getTime() : acc), null)
    const lastService = v.interventions
      .reduce<number | null>((acc, i) => (acc === null || i.createdAt.getTime() > acc ? i.createdAt.getTime() : acc), null)
    const lastVisitMs = v.lastVisit ? v.lastVisit.getTime() : null

    // Dérivation documentée (voir en-tête) — priorité VIDANGE_DUE > LOYALTY_NEAR.
    // Libellé : « jamais revenu » (aucune visite), « vidange jamais faite »
    // (km > 15 000 sans aucune vidange), sinon « vidange due » (> 180 j).
    // sinceDays = jours depuis la dernière vidange connue, sinon depuis la
    // dernière visite — le point de départ réel du dépassement.
    let alert: { type: string; label: string; sinceDays?: number } | null = null
    const daysSince = (ms: number) => Math.floor((now - ms) / DAY_MS)
    const lastVisitOverdue = lastVisitMs === null || lastVisitMs < d180
    const noVidangeEver = lastVidange === null && v.km > 15000
    const vidangeOverdue = lastVidange !== null && lastVidange < d180
    if (lastVisitOverdue || noVidangeEver || vidangeOverdue) {
      alert = {
        type: "VIDANGE_DUE",
        label: lastVisitMs === null ? "jamais revenu" : noVidangeEver ? "vidange jamais faite" : "vidange due",
        sinceDays: lastVidange !== null
          ? daysSince(lastVidange)
          : lastVisitMs !== null ? daysSince(lastVisitMs) : undefined,
      }
    } else if (v.loyaltyPoints >= 180) {
      alert = { type: "LOYALTY_NEAR", label: "récompense atteinte" }
    }

    return {
      id: v.id,
      plate: v.plate,
      brand: v.brand,
      model: v.model,
      km: v.km,
      loyaltyPoints: v.loyaltyPoints,
      lastVisit: v.lastVisit?.toISOString() ?? null,
      hub: { code: v.hub.code, name: v.hub.name, gouvernorat: v.hub.gouvernorat, brandSlug: v.hub.brandSlug },
      interventionCount: v.interventions.length,
      lastService: v.lastVisit?.toISOString() ?? (lastService ? new Date(lastService).toISOString() : null),
      conversionsCount: v._count.conversions,
      alert,
    }
  })

  // Filtre « avec alertes » : appliqué après jointures (dérivation, cf. en-tête).
  const filtered = alertes ? enriched.filter(v => v.alert !== null) : enriched

  return NextResponse.json({
    vehicles: filtered.slice(0, limit),
    meta: {
      total: filtered.length,
      kmAvg: filtered.length ? Math.round(filtered.reduce((s, v) => s + v.km, 0) / filtered.length) : 0,
      loyaltyAvg: filtered.length ? Math.round(filtered.reduce((s, v) => s + v.loyaltyPoints, 0) / filtered.length) : 0,
      loyaltyTotal: filtered.reduce((s, v) => s + v.loyaltyPoints, 0),
      alerts: {
        total: filtered.filter(v => v.alert !== null).length,
        vidangeDue: filtered.filter(v => v.alert?.type === "VIDANGE_DUE").length,
        loyaltyNear: filtered.filter(v => v.alert?.type === "LOYALTY_NEAR").length,
      },
    },
    filters: { brand, hubId, q: q || null, alertes },
  })
}
