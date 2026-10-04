// CarbuScope — Module Média (T60) : MOTEUR DE SIMULATION DE CAMPAGNE.
// Les calculs suivent STRICTEMENT les sorties décrites à l'étape 3 du
// simulateur (aucune formule hors spécification) :
//   · total des occasions de voir (ODV) — saisonnalité mensuelle par gouvernorat
//   · audience brute cumulée
//   · reach estimé après déduplication par zone (matrice de chevauchement)
//   · fréquence moyenne par individu
//   · coût pour mille ODV (CPM) et coût par tête
//   · stations de l'enseigne touchées (≤ 1 km d'une face) + concurrentes
//     touchées en répartition par enseigne adverse (décomptes, jamais de détail)
//   · part de voix de la campagne sur la zone
//   · pourcentage de couverture du réseau de stations de l'enseigne
// Modèle documenté (déterministe, < 2 s sur 500 faces) :
//   ODV_f,jour      = odvJournalieres × coefficient(gouvernorat, mois)
//   audience brute  = Σ audience journalière × coefficient
//   déduplication   : par ville, unique_journalier = brut / (1 + o × (n−1))
//                     (o = facteurSupplementaire, matrice de chevauchement SA)
//   reach campagne  = unique_journalier × (1 + g × (D−1)) plafonné à
//                     plafondUnicite — la pool unique croît sous-linéairement
//   fréquence       = audience brute / reach
//   prix ligne      = prixUnitaire (pré-rempli prorata semaine, éditable)
//                     × (1 − remise ligne) ; total × (1 − remise globale)

import { db } from "@/lib/db"
import { distKm } from "./shared"
import type { SimulationSelectionDTO, SimulationResultsDTO, SimulationDTO } from "./shared"
import { resolveFacesByIds, type MediaCtx } from "./permissions"

const DAY = 86_400_000

type EngineSettings = {
  SAISONNALITE: Record<string, number[]>
  CHEVAUCHEMENT: { facteurSupplementaire: number; croissanceJournaliere: number; plafondUnicite: number }
  COUT: { cpmReference: number; margePlateforme: number }
}

export async function loadEngineSettings(): Promise<EngineSettings> {
  const rows = await db.mediaEngineSetting.findMany()
  const map = new Map(rows.map(r => [r.key, r.value as unknown]))
  const saison = (map.get("SAISONNALITE") ?? {}) as Record<string, number[]>
  return {
    SAISONNALITE: saison,
    CHEVAUCHEMENT: {
      facteurSupplementaire: 0.12,
      croissanceJournaliere: 0.08,
      plafondUnicite: 3.5,
      ...(((map.get("CHEVAUCHEMENT") ?? {}) as object) ?? {}),
    },
    COUT: { cpmReference: 1.4, margePlateforme: 0.1, ...(((map.get("COUT") ?? {}) as object) ?? {}) },
  }
}

/** Prix pré-rempli d'une face pour une durée (prorata hebdomadaire —
 *  conforme étape 2 : pré-rempli depuis le prix de base, éditable). */
export function prefillPrix(prixSemaine: number, days: number): number {
  return Math.round(prixSemaine * Math.max(1, Math.ceil(days / 7)))
}

const monthOf = (t: number) => new Date(t).getUTCMonth() // 0-11

/** Exécute le moteur et retourne le rapport complet. La sélection ne peut
 *  contenir que des faces en accès FULL pour l'enseigne (résolu côté serveur). */
export async function computeSimulation(
  ctx: MediaCtx,
  sim: { brandSlug: string; selections: SimulationSelectionDTO[]; dateStart: Date | null; dateEnd: Date | null; params: { remiseGlobale: number; saisonnalite: boolean } },
): Promise<SimulationResultsDTO> {
  const started = performance.now()
  const settings = await loadEngineSettings()
  const selections = sim.selections.filter(s => s.faceId)
  const resolved = await resolveFacesByIds(ctx, selections.map(s => s.faceId))

  // Dates — repli : 30 jours à partir d'aujourd'hui
  const start = sim.dateStart ? sim.dateStart.getTime() : Date.now()
  const end = sim.dateEnd ? sim.dateEnd.getTime() : start + 30 * DAY
  const days = Math.min(365, Math.max(1, Math.round((end - start) / DAY) + 1))

  // coefficient de saisonnalité du gouvernorat pour un mois donné
  const coef = (governorat: string, month: number): number => {
    const row = settings.SAISONNALITE[governorat]
    const c = row?.[month]
    return sim.params.saisonnalite && typeof c === "number" ? c : 1
  }

  // répartition des jours par mois
  const daysByMonth = new Map<number, number>()
  for (let d = 0; d < days; d++) {
    const m = monthOf(start + d * DAY)
    daysByMonth.set(m, (daysByMonth.get(m) ?? 0) + 1)
  }

  // lignes (faces FULL uniquement — resolveFacesByIds a déjà écarté le reste)
  type Ligne = {
    faceId: string; code: string; ville: string; governorat: string; format: string
    odvJour: number; audienceJour: number; prixUnitaire: number; remise: number
  }
  const lignes: Ligne[] = []
  for (const sel of selections) {
    const r = resolved.get(sel.faceId)
    if (!r || r.access !== "FULL") continue // face invisible → ignorée silencieusement (jamais révélée)
    lignes.push({
      faceId: r.face.id, code: r.face.code, ville: r.face.panel.ville, governorat: r.face.panel.governorat,
      format: r.face.panel.format,
      odvJour: r.face.odvJournalieres, audienceJour: r.face.audienceJournaliere,
      prixUnitaire: Math.max(0, sel.prixUnitaire), remise: Math.min(90, Math.max(0, sel.remise ?? 0)),
    })
  }

  // ── ODV & audience brute cumulées (saisonnalité mensuelle par gouvernorat)
  let odvTotal = 0
  let audienceBrute = 0
  const odvParJour: { date: string; odv: number }[] = []
  for (const l of lignes) {
    for (const [m, nb] of daysByMonth) {
      odvTotal += l.odvJour * coef(l.governorat, m) * nb
      audienceBrute += l.audienceJour * coef(l.governorat, m) * nb
    }
  }
  for (let d = 0; d < days; d++) {
    const t = start + d * DAY
    const m = monthOf(t)
    let dayOdv = 0
    for (const l of lignes) dayOdv += l.odvJour * coef(l.governorat, m)
    odvParJour.push({ date: new Date(t).toISOString().slice(0, 10), odv: Math.round(dayOdv) })
  }

  // ── Reach après déduplication par zone (ville)
  const byVille = new Map<string, Ligne[]>()
  for (const l of lignes) byVille.set(l.ville, [...(byVille.get(l.ville) ?? []), l])
  const o = settings.CHEVAUCHEMENT.facteurSupplementaire
  const g = settings.CHEVAUCHEMENT.croissanceJournaliere
  const plafond = settings.CHEVAUCHEMENT.plafondUnicite
  let reach = 0
  for (const ls of byVille.values()) {
    let grossDaily = 0
    for (const l of ls) {
      const cAvg = avgCoef(l.governorat, daysByMonth, sim.params.saisonnalite, settings)
      grossDaily += l.audienceJour * cAvg
    }
    const uniqueDaily = grossDaily / (1 + o * Math.max(0, ls.length - 1))
    reach += uniqueDaily * Math.min(1 + g * (days - 1), plafond)
  }
  reach = Math.round(reach)

  // ── Coûts
  const remiseGlobale = Math.min(90, Math.max(0, sim.params.remiseGlobale ?? 0))
  const coutLignes = lignes.map(l => l.prixUnitaire * (1 - l.remise / 100))
  const coutTotal = Math.round(coutLignes.reduce((a, b) => a + b, 0) * (1 - remiseGlobale / 100))
  const cpm = odvTotal > 0 ? Math.round((coutTotal / (odvTotal / 1000)) * 100) / 100 : 0
  const coutParTete = reach > 0 ? Math.round((coutTotal / reach) * 100) / 100 : 0
  const frequence = reach > 0 ? Math.round((audienceBrute / reach) * 100) / 100 : 0

  // ── Réseau de stations : stations touchées (≤ 1 km d'une face) — une seule
  // requête, déduplication par code station (une station peut voir plusieurs faces).
  const allStations = await db.station.findMany({
    select: { code: true, name: true, lat: true, lng: true, brand: { select: { slug: true } } },
  })
  const propUnique = new Map<string, SimulationResultsDTO["stationsProprietaires"][number]>()
  const concUnique = new Map<string, Set<string>>() // brandSlug adverse → codes stations
  for (const l of lignes) {
    const face = resolved.get(l.faceId)!.face
    for (const s of allStations) {
      const dM = Math.round(distKm(s.lat, s.lng, face.panel.lat, face.panel.lng) * 1000)
      if (dM > 1000) continue
      if (s.brand?.slug === sim.brandSlug) {
        if (!propUnique.has(s.code)) propUnique.set(s.code, { code: s.code, name: s.name, distanceM: dM, nearFace: l.code })
      } else if (s.brand?.slug) {
        if (!concUnique.has(s.brand.slug)) concUnique.set(s.brand.slug, new Set())
        concUnique.get(s.brand.slug)!.add(s.code)
      }
    }
  }
  const propList = [...propUnique.values()].sort((a, b) => a.distanceM - b.distanceM)

  // couverture du réseau de stations de l'enseigne
  const totalReseau = sim.brandSlug ? allStations.filter(s => s.brand?.slug === sim.brandSlug).length : 0
  const couvertureReseauPct = totalReseau > 0 ? Math.round((propList.length / totalReseau) * 1000) / 10 : 0

  const villes = [...byVille.keys()]
  const allFacesZone = await db.mediaFace.findMany({
    where: { panel: { ville: { in: villes } } },
    select: { odvJournalieres: true, panel: { select: { ville: true } } },
  })
  const odvZoneAll = allFacesZone.reduce((a, f) => a + f.odvJournalieres, 0)
  const odvZoneCampagne = lignes.reduce((a, l) => a + l.odvJour, 0)
  const partDeVoix = odvZoneAll > 0 ? Math.round((odvZoneCampagne / odvZoneAll) * 1000) / 10 : 0

  // ── Répartitions
  const parFormat = new Map<string, { faces: number; odv: number; cout: number }>()
  const parGouvernorat = new Map<string, { faces: number; odv: number; cout: number }>()
  lignes.forEach((l, i) => {
    const f = parFormat.get(l.format) ?? { faces: 0, odv: 0, cout: 0 }
    parFormat.set(l.format, { faces: f.faces + 1, odv: f.odv + l.odvJour * days, cout: f.cout + coutLignes[i] })
    const gv = parGouvernorat.get(l.governorat) ?? { faces: 0, odv: 0, cout: 0 }
    parGouvernorat.set(l.governorat, { faces: gv.faces + 1, odv: gv.odv + l.odvJour * days, cout: gv.cout + coutLignes[i] })
  })

  // ── Recommandations : faces alternatives dans les mêmes villes, meilleur CPM
  const selectedIds = new Set(lignes.map(l => l.faceId))
  const zoneFaces = (await db.mediaFace.findMany({
    where: { panel: { ville: { in: villes } } },
    select: { id: true, code: true, panel: { select: { ville: true, format: true } }, odvJournalieres: true, prixSemaine: true },
  })).filter(f => !selectedIds.has(f.id))
  const reco = zoneFaces
    .map(f => ({
      faceId: f.id, code: f.code, ville: f.panel.ville, format: f.panel.format,
      cpm: f.odvJournalieres > 0 ? Math.round((prefillPrix(f.prixSemaine, days) / ((f.odvJournalieres * days) / 1000)) * 100) / 100 : Infinity,
    }))
    .filter(r => Number.isFinite(r.cpm))
    .sort((a, b) => a.cpm - b.cpm)
    .slice(0, 5)

  const elapsed = performance.now() - started
  console.log(`[media-engine] simulation ${lignes.length} faces / ${days} j calculée en ${Math.round(elapsed)} ms`)

  return {
    computedAt: new Date().toISOString(),
    days,
    facesCount: lignes.length,
    formatsCount: parFormat.size,
    villesCount: villes.length,
    odvTotal: Math.round(odvTotal),
    audienceBrute: Math.round(audienceBrute),
    reach,
    frequence,
    cpm,
    coutParTete,
    coutTotal,
    stationsProprietaires: propList.slice(0, 50),
    stationsConcurrentes: [...concUnique.entries()]
      .map(([brand, set]) => ({ brand, count: set.size }))
      .sort((a, b) => b.count - a.count),
    partDeVoix,
    couvertureReseauPct,
    parFormat: [...parFormat.entries()].map(([format, v]) => ({ format, ...v, odv: Math.round(v.odv), cout: Math.round(v.cout) })),
    parGouvernorat: [...parGouvernorat.entries()].map(([governorat, v]) => ({ governorat, ...v, odv: Math.round(v.odv), cout: Math.round(v.cout) })),
    odvParJour,
    recommandations: reco,
    lignes: lignes.map((l, i) => ({
      faceId: l.faceId, code: l.code, ville: l.ville, format: l.format,
      prixUnitaire: l.prixUnitaire, remise: l.remise,
      odv: Math.round(l.odvJour * days), audience: Math.round(l.audienceJour * days),
      cout: Math.round(coutLignes[i]),
    })),
  }
}

function avgCoef(governorat: string, daysByMonth: Map<number, number>, saisonnalite: boolean, settings: EngineSettings): number {
  if (!saisonnalite) return 1
  let total = 0, nb = 0
  for (const [m, d] of daysByMonth) {
    total += (settings.SAISONNALITE[governorat]?.[m] ?? 1) * d
    nb += d
  }
  return nb > 0 ? total / nb : 1
}

/** Sérialise une simulation (DTO client). */
export function serializeSimulation(s: {
  id: string; brandSlug: string; authorEmail: string; name: string; client: string | null
  dateStart: Date | null; dateEnd: Date | null; currentStep: number; status: string
  selections: unknown; params: unknown; results: unknown; createdAt: Date; updatedAt: Date
}): SimulationDTO {
  const params = (s.params ?? {}) as { remiseGlobale?: number; saisonnalite?: boolean }
  return {
    id: s.id, brandSlug: s.brandSlug, authorEmail: s.authorEmail, name: s.name, client: s.client,
    dateStart: s.dateStart?.toISOString() ?? null, dateEnd: s.dateEnd?.toISOString() ?? null,
    currentStep: s.currentStep, status: s.status,
    selections: (Array.isArray(s.selections) ? s.selections : []) as SimulationSelectionDTO[],
    params: { remiseGlobale: params.remiseGlobale ?? 0, saisonnalite: params.saisonnalite ?? true },
    results: (s.results ?? null) as SimulationResultsDTO | null,
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  }
}
