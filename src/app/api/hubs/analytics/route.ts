// CarbuScope — T54-Cb — GET /api/hubs/analytics : volet 4/5 « Analytics &
// conversions » du Module 2 « Mobility Hub Operations ». Route STRICTEMENT
// ADDITIVE (schéma T54-A1 inchangé, seule lecture de HubConversion).
//   · Session enseigne requise (401 sinon — pattern requireHubSession de
//     T54-Ca, les données capteurs restent internes enseigne) ;
//   · ?days=30|90 (défaut 90, toute autre valeur → 400 FR).
//
// DÉFINITIONS (documentées — miroir des commentaires du seed T54-A1) :
//   · Funnel : PASSAGE > VISITE > SERVICE > FIDELISE (décroissance ~45 % par
//     étape) ; chaque ligne HubConversion est un ÉVÉNEMENT indépendant porté
//     par une source capteur (CAPTEUR_RADAR 40 % · CAPTEUR_PASSAGE 35 % ·
//     CAMPAGNE 15 % · BORNE_DIGITALE 10 %).
//   · CONVERSION = événement SERVICE ou FIDELISE (prestation facturée —
//     seuls ces deux stades portent une valeur) ; tauxGlobal =
//     conversions / passages (efficacité commerciale du tunnel).
//   · valeur générée = somme des `value` aux stades SERVICE + FIDELISE.
//   · timeseries : 1 point/jour si days=30, agrégat hebdomadaire (semaines
//     glissantes de 7 jours ancrées sur le début de période) si days=90 ;
//     `date` = ISO du jour de départ du bac (UTC). La fenêtre est
//     CALENDAIRE (minuit UTC du premier jour — la journée en cours compte,
//     convention des outils d'analytics), la période précédente (badge de
//     tendance, `kpis.prev`, null si aucun historique) la précède à l'identique.
//   · radarLoop (boucle capteurs → Radar, lien métier demandé par la spec) :
//     passages détectés par le CAPTEUR_RADAR des hubs (tous stades du tunnel
//     — chaque événement est un passage attribué à une source), regroupés
//     par gouvernorat des hubs, croisés avec le moteur de scoring
//     src/lib/radar/scoring.ts (réutilisé tel quel côté serveur, mêmes poids
//     officiels que /api/radar/scoring) ; ne sont retenus que les
//     gouvernorats à score ≥ seuil d'alerte (OpportunityConfig) AYANT des
//     passages capteur dans la période — l'état vide est honnête.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scoreGouvernorats } from "@/lib/radar/scoring"
import { loadConfig, loadScoringInputs } from "@/app/api/radar/_lib"
import { HUB_STATUS_RANK, requireHubSession } from "../_lib"

export const dynamic = "force-dynamic"

const DAY = 86_400_000
const STAGES = ["PASSAGE", "VISITE", "SERVICE", "FIDELISE"] as const
const SOURCES = ["CAPTEUR_RADAR", "CAPTEUR_PASSAGE", "CAMPAGNE", "BORNE_DIGITALE"] as const

/** Arrondi 1 décimale (les pourcentages servis bruts, formatés côté UI). */
const r1 = (v: number) => Math.round(v * 10) / 10

export async function GET(req: NextRequest) {
  const session = await requireHubSession()
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  // ---- Période (30 | 90 jours, défaut 90) ----
  const rawDays = req.nextUrl.searchParams.get("days")
  const days = rawDays == null ? 90 : rawDays === "30" || rawDays === "90" ? Number(rawDays) : null
  if (days === null) {
    return NextResponse.json(
      { error: "Paramètre « days » invalide — seules les périodes 30 ou 90 jours sont prises en charge." },
      { status: 400 },
    )
  }
  // Fenêtre glissante calendaire (convention des outils d'analytics, p. ex.
  // Excel/Google « 90 derniers jours » = AUJOURD'HUI() − 90) : depuis minuit
  // UTC du (jour − période) — la journée en cours compte, soit période+1
  // dates calendaires. La période précédente (badge de tendance) la précède
  // à l'identique ; aucune approximation à la milliseconde.
  const day0 = new Date()
  day0.setUTCHours(0, 0, 0, 0)
  const start = new Date(day0.getTime() - days * DAY)
  const prevStart = new Date(start.getTime() - days * DAY)

  // ---- Conversions de la période (fenêtre courante) + hubs du réseau ----
  const [rows, hubs, prevGroups] = await Promise.all([
    db.hubConversion.findMany({
      where: { occurredAt: { gte: start } },
      select: {
        hubId: true,
        source: true,
        stage: true,
        value: true,
        occurredAt: true,
        hub: { select: { code: true, name: true, gouvernorat: true, status: true } },
      },
    }),
    db.mobilityHub.findMany({
      select: { id: true, code: true, name: true, gouvernorat: true, status: true },
      orderBy: { code: "asc" },
    }),
    // Période précédente (badge de tendance) : agrégat compact par stade.
    db.hubConversion.groupBy({
      by: ["stage"],
      where: { occurredAt: { gte: prevStart, lt: start } },
      _count: { _all: true },
      _sum: { value: true },
    }),
  ])

  // ---- KPIs globaux (fenêtre courante) ----
  const byStage: Record<string, { count: number; value: number }> = {}
  for (const s of STAGES) byStage[s] = { count: 0, value: 0 }
  for (const c of rows) {
    const b = byStage[c.stage] ?? { count: 0, value: 0 }
    b.count += 1
    b.value += c.value
    byStage[c.stage] = b
  }
  const passages = byStage.PASSAGE.count
  const conversions = byStage.SERVICE.count + byStage.FIDELISE.count
  const valeur = byStage.SERVICE.value + byStage.FIDELISE.value

  // Période précédente (null si aucun passage — pas d'historique, badge neutre).
  const prevMap = new Map(prevGroups.map(g => [g.stage, g]))
  const prevPassages = prevMap.get("PASSAGE")?._count._all ?? 0
  const prevConversions =
    (prevMap.get("SERVICE")?._count._all ?? 0) + (prevMap.get("FIDELISE")?._count._all ?? 0)
  const prevValue =
    (prevMap.get("SERVICE")?._sum.value ?? 0) + (prevMap.get("FIDELISE")?._sum.value ?? 0)

  const kpis = {
    passages,
    visites: byStage.VISITE.count,
    services: byStage.SERVICE.count,
    fidelises: byStage.FIDELISE.count,
    conversions,
    tauxGlobal: passages > 0 ? r1((conversions / passages) * 100) : 0,
    valeurService: Math.round(byStage.SERVICE.value * 100) / 100,
    valeurFidelise: Math.round(byStage.FIDELISE.value * 100) / 100,
    valeur: Math.round(valeur * 100) / 100,
    prev:
      prevPassages > 0
        ? {
            passages: prevPassages,
            conversions: prevConversions,
            tauxGlobal: r1((prevConversions / prevPassages) * 100),
            valeur: Math.round(prevValue * 100) / 100,
          }
        : null,
  }

  // ---- Entonnoir (taux cumulé depuis le stade PASSAGE) ----
  const funnel = STAGES.map(stage => ({
    stage,
    count: byStage[stage].count,
    rate: passages > 0 ? r1((byStage[stage].count / passages) * 100) : 0,
  }))

  // ---- Table comparative par hub (les hubs sans conversion restent à 0) ----
  const hubAgg = new Map<string, { passages: number; conversions: number; valeur: number }>()
  for (const h of hubs) hubAgg.set(h.id, { passages: 0, conversions: 0, valeur: 0 })
  for (const c of rows) {
    const a = hubAgg.get(c.hubId)
    if (!a) continue
    if (c.stage === "PASSAGE") a.passages += 1
    if (c.stage === "SERVICE" || c.stage === "FIDELISE") {
      a.conversions += 1
      a.valeur += c.value
    }
  }
  const byHub = hubs
    .map(h => {
      const a = hubAgg.get(h.id)!
      return {
        hubId: h.id,
        code: h.code,
        name: h.name,
        gouvernorat: h.gouvernorat,
        status: h.status,
        passages: a.passages,
        conversions: a.conversions,
        taux: a.passages > 0 ? r1((a.conversions / a.passages) * 100) : 0,
        valeur: Math.round(a.valeur * 100) / 100,
      }
    })
    .sort(
      (a, b) =>
        (HUB_STATUS_RANK[a.status] ?? 9) - (HUB_STATUS_RANK[b.status] ?? 9) ||
        a.code.localeCompare(b.code),
    )

  // ---- Répartition par source (part du total des événements) ----
  const srcCount: Record<string, number> = {}
  for (const s of SOURCES) srcCount[s] = 0
  for (const c of rows) srcCount[c.source] = (srcCount[c.source] ?? 0) + 1
  const total = rows.length
  const bySource = SOURCES.map(source => ({
    source,
    count: srcCount[source] ?? 0,
    part: total > 0 ? r1((srcCount[source] / total) * 100) : 0,
  }))

  // ---- Série temporelle (jour si 30 j, semaine glissante si 90 j) ----
  const weekly = days > 30
  const bucketMs = weekly ? 7 * DAY : DAY
  const buckets = new Map<number, { passages: number; conversions: number }>()
  for (const c of rows) {
    const idx = Math.floor((c.occurredAt.getTime() - start.getTime()) / bucketMs)
    const b = buckets.get(idx) ?? { passages: 0, conversions: 0 }
    if (c.stage === "PASSAGE") b.passages += 1
    if (c.stage === "SERVICE" || c.stage === "FIDELISE") b.conversions += 1
    buckets.set(idx, b)
  }
  // Bacs manquants remplis à 0 (ligne continue) jusqu'au dernier bac observé.
  const nbuckets = buckets.size > 0 ? Math.max(...buckets.keys()) + 1 : 0
  const timeseries = Array.from({ length: nbuckets }, (_, i) => ({
    date: new Date(start.getTime() + i * bucketMs).toISOString().slice(0, 10),
    passages: buckets.get(i)?.passages ?? 0,
    conversions: buckets.get(i)?.conversions ?? 0,
  }))

  // ---- Boucle capteurs → Radar (gouvernorats à fort potentiel détectés) ----
  // Passages attribués au CAPTEUR_RADAR, regroupés par gouvernorat des hubs.
  const radarByGov = new Map<string, number>()
  for (const c of rows) {
    if (c.source !== "CAPTEUR_RADAR") continue
    const gov = c.hub.gouvernorat
    radarByGov.set(gov, (radarByGov.get(gov) ?? 0) + 1)
  }
  let govFortPotentiel: Array<{ gouvernorat: string; passagesCapteur: number; score: number }> = []
  let alertThreshold: number | null = null
  if (radarByGov.size > 0) {
    // Moteur de scoring réutilisé côté serveur (mêmes poids officiels que
    // /api/radar/scoring — aucune duplication du calcul).
    const [config, inputs] = await Promise.all([loadConfig(), loadScoringInputs()])
    alertThreshold = config.thresholds.alert
    const scores = new Map(scoreGouvernorats(inputs, config.weights).map(g => [g.name, g.score]))
    govFortPotentiel = [...radarByGov.entries()]
      .map(([gouvernorat, passagesCapteur]) => ({
        gouvernorat,
        passagesCapteur,
        score: scores.get(gouvernorat) ?? 0,
      }))
      .filter(g => g.score >= (alertThreshold ?? 0))
      .sort((a, b) => b.score - a.score || a.gouvernorat.localeCompare(b.gouvernorat, "fr"))
  }

  return NextResponse.json({
    days,
    kpis,
    funnel,
    byHub,
    bySource,
    timeseries,
    radarLoop: { alertThreshold, govFortPotentiel },
    generatedAt: new Date().toISOString(),
  })
}
