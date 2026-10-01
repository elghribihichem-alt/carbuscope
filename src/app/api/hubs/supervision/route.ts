// CarbuScope — T54-Cb — GET /api/hubs/supervision : volet Super Admin
// « Mobility Hub » de la console SA. Route STRICTEMENT ADDITIVE, lecture
// seule (V1 : la SA n'édite pas les hubs — aucun PUT/PATCH ici, documenté).
//   · Auth : Super Administration UNIQUEMENT (pattern /api/radar/config —
//     401 sans session, 403 si le rôle n'est pas SUPER_ADMIN). La route
//     enseigne /api/hubs/analytics exige une session enseigne : la
//     supervision SA agrège les mêmes indicateurs SANS en dépendre.
//   · Contenu : KPIs réseau (90 jours glissants), entonnoir global compact,
//     répartition par source et table des 9 hubs (code, nom, gouvernorat,
//     statut, services actifs, passages 90 j, taux, valeur, funnel propre au
//     hub pour le Sheet détail) + dernière mise à jour des paramètres
//     d'exploitation (HubSetting.updatedAt/updatedBy — « jamais » si aucun).
// Mêmes définitions que /api/hubs/analytics (conversions = SERVICE +
// FIDELISE, taux = conversions / passages, valeur = somme des paniers).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { HUB_STATUS_RANK } from "../_lib"

export const dynamic = "force-dynamic"

const DAY = 86_400_000
const STAGES = ["PASSAGE", "VISITE", "SERVICE", "FIDELISE"] as const

/** Arrondi 1 décimale (pourcentages servis bruts, formatés côté UI). */
const r1 = (v: number) => Math.round(v * 10) / 10

export async function GET(_req: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { error: "Connexion requise — la supervision Mobility Hub est réservée à la Super Administration." },
      { status: 401 },
    )
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Action réservée à la Super Administration." },
      { status: 403 },
    )
  }

  // ---- 90 jours glissants (période de supervision, non paramétrable V1) —
  // même fenêtre CALENDAIRE que /api/hubs/analytics (minuit UTC du jour −90,
  // la journée en cours compte) pour des chiffres cohérents entre consoles. ----
  const day0 = new Date()
  day0.setUTCHours(0, 0, 0, 0)
  const start = new Date(day0.getTime() - 90 * DAY)

  const [rows, hubs, settings, servicesCount] = await Promise.all([
    db.hubConversion.findMany({
      where: { occurredAt: { gte: start } },
      select: { hubId: true, stage: true, value: true, source: true },
    }),
    db.mobilityHub.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        gouvernorat: true,
        status: true,
        address: true,
        type: true,
        openedAt: true,
        surfaceM2: true,
        dailyVehicles: true,
        monthlyRevenue: true,
        manager: true,
        phone: true,
        services: { select: { status: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.hubSetting.findMany({ select: { hubId: true, updatedAt: true, updatedBy: true } }),
    db.hubService.count(),
  ])

  // ---- KPIs réseau + entonnoir global ----
  const byStage: Record<string, number> = {}
  for (const s of STAGES) byStage[s] = 0
  let valeur = 0
  const srcCount: Record<string, number> = {}
  for (const c of rows) {
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1
    if (c.stage === "SERVICE" || c.stage === "FIDELISE") valeur += c.value
    srcCount[c.source] = (srcCount[c.source] ?? 0) + 1
  }
  const passages = byStage.PASSAGE
  const conversions = byStage.SERVICE + byStage.FIDELISE

  // ---- Par hub : funnel + taux + valeur + services actifs + MAJ paramètres ----
  const settingByHub = new Map(settings.map(s => [s.hubId, s]))
  const agg = new Map<string, { stages: Record<string, number>; valeur: number }>()
  for (const c of rows) {
    const a = agg.get(c.hubId) ?? { stages: {}, valeur: 0 }
    a.stages[c.stage] = (a.stages[c.stage] ?? 0) + 1
    if (c.stage === "SERVICE" || c.stage === "FIDELISE") a.valeur += c.value
    agg.set(c.hubId, a)
  }

  const hubRows = hubs
    .map(h => {
      const a = agg.get(h.id) ?? { stages: {}, valeur: 0 }
      const hPassages = a.stages.PASSAGE ?? 0
      const hConv = (a.stages.SERVICE ?? 0) + (a.stages.FIDELISE ?? 0)
      const st = settingByHub.get(h.id)
      return {
        id: h.id,
        code: h.code,
        name: h.name,
        gouvernorat: h.gouvernorat,
        address: h.address,
        status: h.status,
        type: h.type,
        openedAt: h.openedAt ? h.openedAt.toISOString() : null,
        surfaceM2: h.surfaceM2,
        dailyVehicles: h.dailyVehicles,
        monthlyRevenue: h.monthlyRevenue,
        manager: h.manager,
        phone: h.phone,
        activeServices: h.services.filter(s => s.status === "ACTIVE").length,
        totalServices: h.services.length,
        passages: hPassages,
        taux: hPassages > 0 ? r1((hConv / hPassages) * 100) : 0,
        valeur: Math.round(a.valeur * 100) / 100,
        funnel: STAGES.map(stage => ({
          stage,
          count: a.stages[stage] ?? 0,
          rate: hPassages > 0 ? r1(((a.stages[stage] ?? 0) / hPassages) * 100) : 0,
        })),
        settingsUpdatedAt: st ? st.updatedAt.toISOString() : null,
        settingsUpdatedBy: st ? st.updatedBy : null,
      }
    })
    .sort(
      (a, b) =>
        (HUB_STATUS_RANK[a.status] ?? 9) - (HUB_STATUS_RANK[b.status] ?? 9) ||
        a.code.localeCompare(b.code),
    )

  const total = rows.length
  const sources = ["CAPTEUR_RADAR", "CAPTEUR_PASSAGE", "CAMPAGNE", "BORNE_DIGITALE"].map(source => ({
    source,
    count: srcCount[source] ?? 0,
    part: total > 0 ? r1(((srcCount[source] ?? 0) / total) * 100) : 0,
  }))

  return NextResponse.json({
    kpis: {
      hubs: hubs.length,
      hubsActifs: hubs.filter(h => h.status === "ACTIVE").length,
      servicesTotal: servicesCount,
      passages,
      conversions,
      tauxGlobal: passages > 0 ? r1((conversions / passages) * 100) : 0,
      valeur: Math.round(valeur * 100) / 100,
      fidelises: byStage.FIDELISE,
    },
    funnel: STAGES.map(stage => ({
      stage,
      count: byStage[stage],
      rate: passages > 0 ? r1((byStage[stage] / passages) * 100) : 0,
    })),
    bySource: sources,
    hubs: hubRows,
    generatedAt: new Date().toISOString(),
  })
}
