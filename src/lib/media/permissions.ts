// CarbuScope — Module Média (T60) : RÉSOLUTION DES PERMISSIONS — LE CŒUR DU
// PRODUIT. Trois couches cumulatives, appelées à CHAQUE affichage, export et
// appel d'interface. Aucun écran, export ou réponse ne peut contourner ces
// fonctions. Filtrage effectué CÔTÉ SERVEUR, avant sérialisation : rien de
// masqué ne transite vers le client.
//
//   Couche 1 — RÔLE            : détermine les ACTIONS (créer, modifier,
//                                exporter, gérer les membres), pas les données.
//   Couche 2 — VISIBILITÉ      : attribut porté par chaque face — PUBLIQUE,
//          (sur la face)         GRANULAIRE (listes/groupe/zones/conditions,
//                                exclusions prioritaires) ou EXCLUSIVE.
//   Couche 3 — PÉRIMÈTRE       : zone d'accès du membre (territoire entier,
//          (du membre)           gouvernorats, rayon autour d'une station,
//                                polygone dessiné).
//
// Une face n'est visible que si les trois couches l'autorisent simultanément.
// Pour une enseigne non autorisée (couche 2), la face reste PARTIELLEMENT
// visible sous forme agrégée : taux d'occupation 12 mois, fourchette large de
// prix, décompte de concurrents sans identification, position approximative à
// ±500 m — aucune photo, aucun prix exact, aucune station nommée.

import { db } from "@/lib/db"
import type { SessionUser } from "@/lib/types"
import {
  distKm, pointInPolygon, toMediaRole, MEDIA_CAPS,
  type FaceDTO, type FaceAggregeDTO, type FaceFullDTO, type FaceFilters,
  type MediaRole, type PanelNestedDTO, type FacesListResponse,
} from "./shared"

// ─────────────────────────── Contexte média ───────────────────────────

export interface MediaCtx {
  user: SessionUser
  role: MediaRole
  brandSlug: string | null
  perimeterType: string // TOUT | GOUVERNORATS | RAYON | POLYGONE
  perimeterValue: {
    gouvernorats?: string[]
    lat?: number
    lng?: number
    rayonKm?: number
    polygon?: [number, number][]
  }
  contractAgeMonths: number // ancienneté du contrat SaaS de l'enseigne
}

/** Construit le contexte média d'une session (rôle + périmètre + ancienneté
 *  de contrat). Appelé au début de CHAQUE route — aucune route ne construit
 *  ses règles elle-même. */
export async function getMediaContext(user: SessionUser): Promise<MediaCtx> {
  const role = toMediaRole(user.role)
  const setting = await db.mediaMemberSetting.findUnique({ where: { userId: user.id } })
  let contractAgeMonths = 0
  if (user.brandSlug) {
    const contract = await db.saasContract.findUnique({ where: { brandSlug: user.brandSlug } })
    if (contract) contractAgeMonths = Math.max(0, Math.round((Date.now() - contract.startedAt.getTime()) / (30.4 * 86_400_000)))
  }
  return {
    user,
    role,
    brandSlug: role === "SA" ? null : user.brandSlug,
    perimeterType: setting?.perimeterType ?? "TOUT",
    perimeterValue: (setting?.perimeterValue ?? {}) as MediaCtx["perimeterValue"],
    contractAgeMonths,
  }
}

export const ctxCaps = (ctx: MediaCtx) => MEDIA_CAPS[ctx.role]

// ─────────────── Couche 3 — périmètre géographique du membre ───────────────

function perimeterContains(ctx: MediaCtx, lat: number, lng: number, governorat: string): boolean {
  if (ctx.role === "SA" || ctx.perimeterType === "TOUT") return true
  if (ctx.perimeterType === "GOUVERNORATS") {
    const list = ctx.perimeterValue.gouvernorats ?? []
    return list.length === 0 || list.includes(governorat)
  }
  if (ctx.perimeterType === "RAYON" && typeof ctx.perimeterValue.lat === "number") {
    return distKm(ctx.perimeterValue.lat, ctx.perimeterValue.lng ?? 0, lat, lng) <= (ctx.perimeterValue.rayonKm ?? 5)
  }
  if (ctx.perimeterType === "POLYGONE" && Array.isArray(ctx.perimeterValue.polygon)) {
    return pointInPolygon(lat, lng, ctx.perimeterValue.polygon)
  }
  return true
}

// ─────────────── Couche 2 — attribut de visibilité de la face ───────────────

type RawFace = {
  visibilityMode: string
  exclusiveBrandSlug: string | null
  allowedBrandSlugs: unknown
  excludedBrandSlugs: unknown
  allowedGroups: unknown
  allowedZones: unknown
  visibilityConditions: unknown
}

const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])

/** Résolution asynchrone de l'appartenance aux groupes (cache de session). */
const groupCache = new Map<string, string[]>() // brandSlug → noms de groupes
export async function refreshGroupCache(): Promise<void> {
  const groups = await db.mediaBrandGroup.findMany()
  groupCache.clear()
  for (const g of groups) {
    for (const slug of asArray(g.brandSlugs)) {
      groupCache.set(slug, [...(groupCache.get(slug) ?? []), g.name])
    }
  }
}
function belongsToAnyGroup(brand: string, groupNames: string[]): boolean {
  const mine = groupCache.get(brand) ?? []
  return groupNames.some(n => mine.includes(n))
}

// La couche 2 doit être asynchrone (cache groupes) — wrapper propre.
async function resolveLayer2(ctx: MediaCtx, face: RawFace, governorat: string): Promise<"FULL" | "AGGREGE"> {
  if (ctx.role === "SA") return "FULL"
  const brand = ctx.brandSlug
  if (!brand) return "AGGREGE"
  if (face.visibilityMode === "PUBLIQUE") return "FULL"
  if (face.visibilityMode === "EXCLUSIVE") return face.exclusiveBrandSlug === brand ? "FULL" : "AGGREGE"
  if (asArray(face.excludedBrandSlugs).includes(brand)) return "AGGREGE"
  const allowedBrands = asArray(face.allowedBrandSlugs)
  if (allowedBrands.length > 0 && !allowedBrands.includes(brand)) return "AGGREGE"
  const allowedGroups = asArray(face.allowedGroups)
  if (allowedGroups.length > 0 && !belongsToAnyGroup(brand, allowedGroups)) return "AGGREGE"
  const allowedZones = asArray(face.allowedZones)
  if (allowedZones.length > 0 && !allowedZones.includes(governorat)) return "AGGREGE"
  const cond = face.visibilityConditions as { ancienneteMinMois?: number } | null
  if (cond && typeof cond.ancienneteMinMois === "number" && ctx.contractAgeMonths < cond.ancienneteMinMois) return "AGGREGE"
  return "FULL"
}

// ─────────────── Résolution finale — fonction unique ───────────────

/** LA fonction unique de résolution : appelée à chaque affichage, export et
 *  appel d'interface. "NONE" = la face n'existe pas pour ce membre (hors
 *  périmètre, couche 3). */
export async function resolveFaceAccess(
  ctx: MediaCtx,
  face: RawFace,
  lat: number, lng: number, governorat: string,
): Promise<"FULL" | "AGGREGE" | "NONE"> {
  if (!perimeterContains(ctx, lat, lng, governorat)) return "NONE"
  return resolveLayer2(ctx, face, governorat)
}

// ─────────────── Sérialisation — vue complète vs vue agrégée ───────────────

type FaceRow = {
  id: string; code: string; panelId: string
  orientation: string; sensLecture: string; visibiliteMinM: number; visibiliteMaxM: number
  angleMortDeg: number | null; obstacles: string | null; tempsLectureS: number
  tmja: number; traficHeurePointe: number; repartitionSens: string
  partDeuxRoues: number; partVL: number; partPL: number; partTaxis: number
  vitesseReglementaire: number; vitesseReelle: number; indiceCongestion: number
  audienceJournaliere: number; audienceMensuelle: number; odvJournalieres: number; odvMensuelles: number
  profilDemographique: string; cspDominante: string; partResidents: number; partPassants: number
  stationsProprietaireRayon: number; stationsConcurrentesRayon: number; panneauxRayon1km: number; partDeVoix: number
  pois: unknown
  prixSemaine: number; prixMois: number; prixTrimestre: number; prixSemestre: number; prixAnnee: number
  remiseVolumeMax: number; tauxOccupation12m: number; dateDerniereCampagne: Date | null; clientsActuels: unknown
  contraintesMunicipales: string | null; zonesInterdites: unknown; alcoolAutorise: boolean; procedureReservation: string | null
  status: string
  visibilityMode: string; exclusiveBrandSlug: string | null
  allowedBrandSlugs: unknown; excludedBrandSlugs: unknown; allowedGroups: unknown; allowedZones: unknown
  visibilityConditions: unknown
  panel: {
    id: string; code: string; name: string; ville: string; governorat: string; delegation: string
    lat: number; lng: number; format: string; technology: string
    mediaType: string; supportType: string; illumination: string
    widthCm: number; heightCm: number; heightAboveGroundM: number
    status: string; authorizationRef: string | null; authorizationEnd: Date | null; photos: unknown
    owner: { name: string; type: string; brandSlug: string | null }
  }
}

/** Jitter déterministe ±500 m — position approximative de la vue agrégée. */
function jitter500m(id: string, lat: number, lng: number): { lat: number; lng: number } {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const dLat = (((h % 1000) / 1000) - 0.5) * 0.009   // ±~500 m en latitude
  const dLng = ((((h >>> 10) % 1000) / 1000) - 0.5) * 0.011 // ±~500 m en longitude
  return { lat: Math.round((lat + dLat) * 1e6) / 1e6, lng: Math.round((lng + dLng) * 1e6) / 1e6 }
}

/** Vue AGRÉGÉE — servie à une enseigne non autorisée : taux d'occupation,
 *  fourchette large de prix (±30 %), décompte de concurrents SANS identification,
 *  position approximée. AUCUNE photo, prix exact, station nommée, client. */
function toAggrege(face: FaceRow): FaceAggregeDTO {
  const pos = jitter500m(face.id, face.panel.lat, face.panel.lng)
  const p = face.prixSemaine
  return {
    access: "AGGREGE",
    id: face.id,
    code: face.code,
    panelId: face.panelId,
    ville: face.panel.ville,
    governorat: face.panel.governorat,
    format: face.panel.format,
    technologie: face.panel.technology,
    lat: pos.lat,
    lng: pos.lng,
    tauxOccupation12m: face.tauxOccupation12m,
    prixMin: Math.round(p * 0.7),
    prixMax: Math.round(p * 1.3),
    stationsConcurrentesRayon: face.stationsConcurrentesRayon,
    panneauxRayon1km: face.panneauxRayon1km,
    statut: face.status,
  }
}

/** Vue COMPLÈTE — toutes les couches autorisent. `mesStationsRayon` : les
 *  stations de l'enseigne consultante dans un rayon d'1 km (données propres). */
function toFull(face: FaceRow, mesStationsRayon = 0): FaceFullDTO {
  return {
    access: "FULL",
    id: face.id, code: face.code, panelId: face.panelId,
    orientation: face.orientation, sensLecture: face.sensLecture,
    visibiliteMinM: face.visibiliteMinM, visibiliteMaxM: face.visibiliteMaxM,
    angleMortDeg: face.angleMortDeg, obstacles: face.obstacles, tempsLectureS: face.tempsLectureS,
    tmja: face.tmja, traficHeurePointe: face.traficHeurePointe, repartitionSens: face.repartitionSens,
    partDeuxRoues: face.partDeuxRoues, partVL: face.partVL, partPL: face.partPL, partTaxis: face.partTaxis,
    vitesseReglementaire: face.vitesseReglementaire, vitesseReelle: face.vitesseReelle, indiceCongestion: face.indiceCongestion,
    audienceJournaliere: face.audienceJournaliere, audienceMensuelle: face.audienceMensuelle,
    odvJournalieres: face.odvJournalieres, odvMensuelles: face.odvMensuelles,
    profilDemographique: face.profilDemographique, cspDominante: face.cspDominante,
    partResidents: face.partResidents, partPassants: face.partPassants,
    stationsProprietaireRayon: face.stationsProprietaireRayon, stationsConcurrentesRayon: face.stationsConcurrentesRayon,
    panneauxRayon1km: face.panneauxRayon1km, partDeVoix: face.partDeVoix,
    pois: Array.isArray(face.pois) ? (face.pois as FaceFullDTO["pois"]) : [],
    prixSemaine: face.prixSemaine, prixMois: face.prixMois, prixTrimestre: face.prixTrimestre,
    prixSemestre: face.prixSemestre, prixAnnee: face.prixAnnee,
    remiseVolumeMax: face.remiseVolumeMax, tauxOccupation12m: face.tauxOccupation12m,
    dateDerniereCampagne: face.dateDerniereCampagne?.toISOString() ?? null,
    clientsActuels: Array.isArray(face.clientsActuels) ? (face.clientsActuels as string[]) : [],
    contraintesMunicipales: face.contraintesMunicipales,
    zonesInterdites: asArray(face.zonesInterdites),
    alcoolAutorise: face.alcoolAutorise, procedureReservation: face.procedureReservation,
    status: face.status,
    mesStationsRayon,
  }
}

// ─────────────── Liste imbriquée (panneaux → faces) ───────────────

const FACE_SELECT = {
  id: true, code: true, panelId: true,
  orientation: true, sensLecture: true, visibiliteMinM: true, visibiliteMaxM: true,
  angleMortDeg: true, obstacles: true, tempsLectureS: true,
  tmja: true, traficHeurePointe: true, repartitionSens: true,
  partDeuxRoues: true, partVL: true, partPL: true, partTaxis: true,
  vitesseReglementaire: true, vitesseReelle: true, indiceCongestion: true,
  audienceJournaliere: true, audienceMensuelle: true, odvJournalieres: true, odvMensuelles: true,
  profilDemographique: true, cspDominante: true, partResidents: true, partPassants: true,
  stationsProprietaireRayon: true, stationsConcurrentesRayon: true, panneauxRayon1km: true, partDeVoix: true,
  pois: true,
  prixSemaine: true, prixMois: true, prixTrimestre: true, prixSemestre: true, prixAnnee: true,
  remiseVolumeMax: true, tauxOccupation12m: true, dateDerniereCampagne: true, clientsActuels: true,
  contraintesMunicipales: true, zonesInterdites: true, alcoolAutorise: true, procedureReservation: true,
  status: true, visibilityMode: true, exclusiveBrandSlug: true,
  allowedBrandSlugs: true, excludedBrandSlugs: true, allowedGroups: true, allowedZones: true,
  visibilityConditions: true,
  panel: {
    select: {
      id: true, code: true, name: true, ville: true, governorat: true, delegation: true,
      lat: true, lng: true, format: true, technology: true, mediaType: true, supportType: true,
      illumination: true, widthCm: true, heightCm: true, heightAboveGroundM: true, status: true,
      authorizationRef: true, authorizationEnd: true, photos: true,
      owner: { select: { name: true, type: true, brandSlug: true } },
    },
  },
} as const

/** Construit la liste imbriquée filtrée par permissions, pour l'explorateur.
 *  Filtres cumulables appliqués côté serveur. C'est LA porte d'entrée : toute
 *  face "NONE" est absente de la réponse — elle n'existe pas pour le lecteur. */
export async function buildFacesList(ctx: MediaCtx, filters: FaceFilters): Promise<FacesListResponse> {
  await refreshGroupCache()
  const faces = (await db.mediaFace.findMany({
    where: { panel: { status: { not: "RETIRE" } } },
    select: FACE_SELECT,
    orderBy: [{ panel: { code: "asc" } }, { code: "asc" }],
  })) as unknown as FaceRow[]

  // stations de l'enseigne (proximité — données propres du tenant)
  const myStations = ctx.role !== "SA" && ctx.brandSlug
    ? await db.station.findMany({
        where: { brand: { slug: ctx.brandSlug }, status: "ACTIVE" },
        select: { lat: true, lng: true },
      })
    : []

  const panels = new Map<string, PanelNestedDTO>()
  let full = 0, aggrege = 0

  for (const face of faces) {
    const access = await resolveFaceAccess(ctx, face, face.panel.lat, face.panel.lng, face.panel.governorat)
    if (access === "NONE") continue
    // filtres cumulables (serveur)
    if (!passesFilters(face, access, filters, myStations)) continue

    let dto: FaceDTO
    if (access === "FULL") {
      const mes = myStations.reduce((n, s) => n + (distKm(s.lat, s.lng, face.panel.lat, face.panel.lng) <= 1 ? 1 : 0), 0)
      dto = toFull(face, mes)
      full++
    } else {
      dto = toAggrege(face)
      aggrege++
    }

    const p = face.panel
    let parent = panels.get(p.id)
    if (!parent) {
      parent = {
        id: p.id, code: p.code, name: p.name, ville: p.ville, governorat: p.governorat, delegation: p.delegation,
        lat: p.lat, lng: p.lng, ownerName: p.owner.name, ownerType: p.owner.type,
        mediaType: p.mediaType, supportType: p.supportType, format: p.format, technology: p.technology,
        illumination: p.illumination, widthCm: p.widthCm, heightCm: p.heightCm, heightAboveGroundM: p.heightAboveGroundM,
        status: p.status, authorizationRef: p.authorizationRef, authorizationEnd: p.authorizationEnd?.toISOString() ?? null,
        photos: [], nbFaces: 0, nbFacesDispo: 0, nbFacesFull: 0,
        prixMin: null, prixMax: null, audienceCumulee: null, traficMax: null, partDeVoix: null,
        faces: [],
      }
      panels.set(p.id, parent)
    }
    parent.faces.push(dto)
    parent.nbFaces++
    if ((dto.access === "FULL" ? dto.status : dto.statut) === "DISPONIBLE") parent.nbFacesDispo++
    if (dto.access === "FULL") {
      parent.nbFacesFull++
      parent.photos = Array.isArray(p.photos) ? (p.photos as PanelNestedDTO["photos"]) : []
      const f = dto as FaceFullDTO
      parent.prixMin = Math.min(parent.prixMin ?? Infinity, f.prixSemaine)
      parent.prixMax = Math.max(parent.prixMax ?? -Infinity, f.prixSemaine)
      parent.audienceCumulee = (parent.audienceCumulee ?? 0) + f.audienceJournaliere
      parent.traficMax = Math.max(parent.traficMax ?? 0, f.tmja)
      parent.partDeVoix = Math.max(parent.partDeVoix ?? 0, f.partDeVoix)
    } else {
      const f = dto as FaceAggregeDTO
      parent.prixMin = Math.min(parent.prixMin ?? Infinity, f.prixMin)
      parent.prixMax = Math.max(parent.prixMax ?? -Infinity, f.prixMax)
    }
  }

  return {
    panels: [...panels.values()],
    stats: { visible: full + aggrege, full, aggrege, panneaux: panels.size },
  }
}

function passesFilters(face: FaceRow, access: "FULL" | "AGGREGE", f: FaceFilters, myStations: { lat: number; lng: number }[]): boolean {
  if (f.gouvernorat && face.panel.governorat !== f.gouvernorat) return false
  if (f.delegation && face.panel.delegation !== f.delegation) return false
  if (f.format && face.panel.format !== f.format) return false
  if (f.technologie && face.panel.technology !== f.technologie) return false
  if (f.support && face.panel.supportType !== f.support) return false
  if (f.statut && face.status !== f.statut) return false
  if (f.tmjaMin !== undefined && face.tmja < f.tmjaMin) return false
  if (f.audienceMin !== undefined && face.audienceJournaliere < f.audienceMin) return false
  if (f.concurrence === true && face.stationsConcurrentesRayon <= 0) return false
  if (f.concurrence === false && face.stationsConcurrentesRayon > 0) return false
  if (f.alcool !== undefined && face.alcoolAutorise !== f.alcool) return false
  if (f.sovMax !== undefined && face.partDeVoix > f.sovMax) return false
  if (f.prixMin !== undefined || f.prixMax !== undefined) {
    // fourchette publique ±30 % pour les faces agrégées — le filtre prix ne
    // révèle jamais le prix exact d'une face restreinte.
    const p = face.prixSemaine
    const lo = access === "FULL" ? p : Math.round(p * 0.7)
    const hi = access === "FULL" ? p : Math.round(p * 1.3)
    if (f.prixMin !== undefined && hi < f.prixMin) return false
    if (f.prixMax !== undefined && lo > f.prixMax) return false
  }
  if (f.distanceStationKm !== undefined && myStations.length > 0) {
    const min = Math.min(...myStations.map(s => distKm(s.lat, s.lng, face.panel.lat, face.panel.lng)))
    if (min > f.distanceStationKm) return false
  }
  return true
}

// ─────────────── Accès à UNE face (exports, comparateur, simulation) ───────────────

/** Résout l'accès d'une face individuelle — utilisé par le comparateur,
 *  l'assistant de campagne et les exports : AUCUN contournement possible. */
export async function resolveFacesByIds(ctx: MediaCtx, ids: string[]): Promise<Map<string, { face: FaceRow; access: "FULL" | "AGGREGE" }>> {
  await refreshGroupCache()
  const faces = (await db.mediaFace.findMany({
    where: { id: { in: ids } },
    select: FACE_SELECT,
  })) as unknown as FaceRow[]
  const out = new Map<string, { face: FaceRow; access: "FULL" | "AGGREGE" }>()
  for (const face of faces) {
    const access = await resolveFaceAccess(ctx, face, face.panel.lat, face.panel.lng, face.panel.governorat)
    if (access !== "NONE") out.set(face.id, { face, access })
  }
  return out
}

/** Sérialise une face selon son accès (utilisé par les routes unitaires). */
export function serializeFace(ctx: MediaCtx, face: FaceRow, access: "FULL" | "AGGREGE", mesStationsRayon = 0): FaceDTO {
  return access === "FULL" ? toFull(face, mesStationsRayon) : toAggrege(face)
}

export type { FaceRow }
