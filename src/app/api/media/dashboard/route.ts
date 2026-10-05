// GET /api/media/dashboard — tableau de bord Média.
//  · Enseigne : campagnes actives, budget consommé, stations couvertes,
//    faces marquantes du périmètre visible.
//  · SA : nombre de panneaux/faces, taux d'occupation global, 10 faces les
//    plus vues, alertes d'autorisations expirant sous 30 jours.

import { NextRequest, NextResponse } from "next/server"
import { requireMedia } from "../_lib"
import { buildFacesList } from "@/lib/media/permissions"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireMedia(req)
  if ("error" in guard) return guard.error
  const { ctx } = guard
  const now = Date.now()

  if (ctx.role === "SA") {
    const [panels, faces, expiring, topFaces] = await Promise.all([
      db.mediaPanel.count({ where: { status: "ACTIF" } }),
      db.mediaFace.count(),
      db.mediaPanel.findMany({
        where: { authorizationEnd: { gte: new Date(now), lte: new Date(now + 30 * 86_400_000) } },
        select: { code: true, name: true, ville: true, authorizationEnd: true, authorizationRef: true },
        orderBy: { authorizationEnd: "asc" },
      }),
      db.mediaFace.findMany({
        orderBy: { odvJournalieres: "desc" },
        take: 10,
        select: {
          code: true, status: true, odvJournalieres: true, audienceJournaliere: true, partDeVoix: true, tauxOccupation12m: true,
          panel: { select: { name: true, ville: true, format: true, technology: true } },
        },
      }),
    ])
    const allFaces = await db.mediaFace.findMany({ select: { tauxOccupation12m: true } })
    const occupancy = allFaces.length > 0 ? Math.round((allFaces.reduce((a, f) => a + f.tauxOccupation12m, 0) / allFaces.length) * 10) / 10 : 0
    return NextResponse.json({
      scope: "SA",
      kpis: { panels, faces, occupancy },
      topFaces: topFaces.map(f => ({
        code: f.code, panel: f.panel.name, ville: f.panel.ville, format: f.panel.format,
        technology: f.panel.technology, odv: f.odvJournalieres, audience: f.audienceJournaliere,
        sov: f.partDeVoix, occupancy: f.tauxOccupation12m, status: f.status,
      })),
      expiring: expiring.map(p => ({
        code: p.code, name: p.name, ville: p.ville,
        authorizationRef: p.authorizationRef, authorizationEnd: p.authorizationEnd?.toISOString() ?? null,
      })),
    })
  }

  // ── Tableau de bord enseigne
  const list = await buildFacesList(ctx, {})
  const sims = await db.mediaSimulation.findMany({
    where: { brandSlug: ctx.brandSlug ?? undefined },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true, dateStart: true, dateEnd: true, results: true, updatedAt: true },
  })
  const active = sims.filter(s =>
    s.status === "ENVOYEE" &&
    s.dateStart && s.dateEnd &&
    s.dateStart.getTime() <= now && s.dateEnd.getTime() >= now,
  )
  const budgetConsomme = sims
    .filter(s => s.status === "ENVOYEE")
    .reduce((a, s) => a + (((s.results as { coutTotal?: number } | null)?.coutTotal) ?? 0), 0)

  // stations couvertes : stations de l'enseigne à ≤ 1 km d'une face visible FULL
  const stationsCouvertes = new Set<string>()
  if (ctx.brandSlug) {
    const [stations, panels] = await Promise.all([
      db.station.findMany({ where: { brand: { slug: ctx.brandSlug } }, select: { code: true, lat: true, lng: true } }),
      db.mediaPanel.findMany({ select: { lat: true, lng: true } }),
    ])
    for (const s of stations) {
      for (const p of panels) {
        const d = 2 * 6371 * Math.asin(Math.sqrt(
          Math.sin(((p.lat - s.lat) * Math.PI) / 360) ** 2 +
          Math.cos((s.lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(((p.lng - s.lng) * Math.PI) / 360) ** 2,
        ))
        if (d <= 1) { stationsCouvertes.add(s.code); break }
      }
    }
  }

  // faces marquantes : top audience en accès FULL
  const topFull = list.panels
    .flatMap(p => p.faces)
    .filter(f => f.access === "FULL")
    .sort((a, b) => b.audienceJournaliere - a.audienceJournaliere)
    .slice(0, 6)

  return NextResponse.json({
    scope: "ENSEIGNE",
    kpis: {
      visible: list.stats.visible,
      full: list.stats.full,
      aggrege: list.stats.aggrege,
      active: active.length,
      budgetConsomme: Math.round(budgetConsomme),
      stationsCouvertes: stationsCouvertes.size,
    },
    activeCampaigns: active.slice(0, 5).map(s => ({
      id: s.id, name: s.name,
      dateStart: s.dateStart?.toISOString() ?? null, dateEnd: s.dateEnd?.toISOString() ?? null,
      budget: (s.results as { coutTotal?: number } | null)?.coutTotal ?? null,
    })),
    topFaces: topFull.map(f => ({
      code: f.code, ville: list.panels.find(p => p.id === f.panelId)?.ville ?? "",
      format: list.panels.find(p => p.id === f.panelId)?.format ?? "",
      audience: f.audienceJournaliere, odv: f.odvJournalieres, prix: f.prixSemaine, status: f.status,
    })),
    simulations: sims.slice(0, 6).map(s => ({ id: s.id, name: s.name, status: s.status, updatedAt: s.updatedAt.toISOString() })),
  })
}
