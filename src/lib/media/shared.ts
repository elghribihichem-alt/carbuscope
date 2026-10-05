// CarbuScope — Module Média (T60) : socle PARTAGÉ client/serveur.
// Types des DTO sérialisés, registre des champs éditables, helpers géo.
// ⚠ AUCUN import serveur ici (pas de db) : ce fichier est consommé par les
// composants client. La résolution des permissions vit dans permissions.ts
// (serveur uniquement) — rien de masqué ne transite vers le client.

// ─────────────────────────── Types des DTO ───────────────────────────

export type FaceAccess = "FULL" | "AGGREGE"

export interface PanelPhotoDTO {
  url: string
  angle: string // FACE | 3/4 | PROFILE
  mode: string // JOUR | NUIT
}

export interface PoiDTO {
  type: string // CENTRE_COMMERCIAL | HOPITAL | ECOLE | UNIVERSITE | MARCHE | ZONE_INDUSTRIELLE | STADE
  nom: string
  distanceM: number
}

/** Face en accès complet — tous les attributs (couche 2 + 3 autorisées). */
export interface FaceFullDTO {
  access: "FULL"
  id: string
  code: string
  panelId: string
  // géométrie & visibilité
  orientation: string
  sensLecture: string
  visibiliteMinM: number
  visibiliteMaxM: number
  angleMortDeg: number | null
  obstacles: string | null
  tempsLectureS: number
  // trafic & flux
  tmja: number
  traficHeurePointe: number
  repartitionSens: string
  partDeuxRoues: number
  partVL: number
  partPL: number
  partTaxis: number
  vitesseReglementaire: number
  vitesseReelle: number
  indiceCongestion: number
  // audience
  audienceJournaliere: number
  audienceMensuelle: number
  odvJournalieres: number
  odvMensuelles: number
  profilDemographique: string
  cspDominante: string
  partResidents: number
  partPassants: number
  // environnement concurrentiel
  stationsProprietaireRayon: number
  stationsConcurrentesRayon: number
  panneauxRayon1km: number
  partDeVoix: number
  pois: PoiDTO[]
  // commercial
  prixSemaine: number
  prixMois: number
  prixTrimestre: number
  prixSemestre: number
  prixAnnee: number
  remiseVolumeMax: number
  tauxOccupation12m: number
  dateDerniereCampagne: string | null
  clientsActuels: string[]
  // technique & légal
  contraintesMunicipales: string | null
  zonesInterdites: string[]
  alcoolAutorise: boolean
  procedureReservation: string | null
  // divers
  status: string
  /** stations de l'enseigne consultante dans un rayon de 1 km (tenant) */
  mesStationsRayon: number
}

/** Face en visibilité agrégée — la preuve de la valeur du réseau sans
 *  l'information stratégique : taux d'occupation 12 mois, fourchette large
 *  de prix, décompte de concurrents sans identification, position approximée
 *  à ±500 m. AUCUNE photo, aucun prix exact, aucune station nommée. */
export interface FaceAggregeDTO {
  access: "AGGREGE"
  id: string
  code: string
  panelId: string
  ville: string
  governorat: string
  format: string
  technologie: string
  lat: number // position approximative ±500 m (jitter déterministe serveur)
  lng: number
  tauxOccupation12m: number
  prixMin: number // fourchette large (±30 %)
  prixMax: number
  stationsConcurrentesRayon: number
  panneauxRayon1km: number
  statut: string
}

export type FaceDTO = FaceFullDTO | FaceAggregeDTO

/** Ligne parente du tableau imbriqué : le panneau avec colonnes agrégées. */
export interface PanelNestedDTO {
  id: string
  code: string
  name: string
  ville: string
  governorat: string
  delegation: string
  lat: number
  lng: number
  ownerName: string
  ownerType: string
  mediaType: string
  supportType: string
  format: string
  technology: string
  illumination: string
  widthCm: number
  heightCm: number
  heightAboveGroundM: number
  status: string
  authorizationRef: string | null
  authorizationEnd: string | null
  photos: PanelPhotoDTO[] // vides si aucune face en accès complet
  nbFaces: number // faces visibles (FULL + AGGREGE) — les autres sont inexistantes pour le lecteur
  nbFacesDispo: number
  nbFacesFull: number
  prixMin: number | null
  prixMax: number | null
  audienceCumulee: number | null
  traficMax: number | null
  partDeVoix: number | null
  faces: FaceDTO[]
}

export interface FacesListResponse {
  panels: PanelNestedDTO[]
  stats: { visible: number; full: number; aggrege: number; panneaux: number }
}

// ─────────────────── Simulations & moteur ───────────────────

export interface SimulationSelectionDTO {
  faceId: string
  prixUnitaire: number // prix campagne entier (pré-rempli prorata, éditable)
  remise: number // % ligne
}

export interface SimulationResultsDTO {
  computedAt: string
  days: number
  facesCount: number
  formatsCount: number
  villesCount: number
  odvTotal: number // occasions de voir totales
  audienceBrute: number // audience brute cumulée
  reach: number // reach estimé après déduplication par zone
  frequence: number // fréquence moyenne par individu
  cpm: number // coût pour mille ODV
  coutParTete: number
  coutTotal: number // DT
  stationsProprietaires: { code: string; name: string; distanceM: number; nearFace: string }[]
  stationsConcurrentes: { brand: string; count: number }[] // répartition par enseigne adverse (décomptes)
  partDeVoix: number // % sur la zone
  couvertureReseauPct: number // % du réseau de stations de l'enseigne
  parFormat: { format: string; faces: number; odv: number; cout: number }[]
  parGouvernorat: { governorat: string; faces: number; odv: number; cout: number }[]
  odvParJour: { date: string; odv: number }[]
  recommandations: { faceId: string; code: string; ville: string; format: string; cpm: number }[]
  lignes: { faceId: string; code: string; ville: string; format: string; prixUnitaire: number; remise: number; odv: number; audience: number; cout: number }[]
}

export interface SimulationDTO {
  id: string
  brandSlug: string
  authorEmail: string
  name: string
  client: string | null
  dateStart: string | null
  dateEnd: string | null
  currentStep: number
  status: string // BROUILLON | ENVOYEE | ARCHIVEE
  selections: SimulationSelectionDTO[]
  params: { remiseGlobale: number; saisonnalite: boolean }
  results: SimulationResultsDTO | null
  createdAt: string
  updatedAt: string
}

// ─────────────────── Permissions (SA) ───────────────────

export interface FaceRuleDTO {
  faceId: string
  code: string
  panelName: string
  ville: string
  mode: string // PUBLIQUE | GRANULAIRE | EXCLUSIVE
  exclusiveBrandSlug: string | null
  allowedBrandSlugs: string[]
  excludedBrandSlugs: string[]
  allowedGroups: string[]
  allowedZones: string[]
  conditions: { ancienneteMinMois?: number; budgetMin?: number; typesEnseignes?: string[] } | null
}

export interface PermissionsMatrixResponse {
  rules: FaceRuleDTO[]
  brands: { slug: string; name: string; color: string }[]
  groups: { id: string; name: string; brandSlugs: string[] }[]
}

export interface PreviewResultDTO {
  brandSlug: string
  perimeterType: string
  total: number
  full: number
  aggrege: number
  invisible: number
  sample: { code: string; mode: FaceAccess | "NONE"; ville: string }[]
}

// ─────────────────── Audit / filtres / membres / moteur ───────────────────

export interface MediaAuditDTO {
  id: string
  actorEmail: string
  actorName: string
  action: string
  entityType: string
  entityLabel: string | null
  field: string | null
  oldValue: string | null
  newValue: string | null
  ip: string
  createdAt: string
}

export interface SavedFilterDTO {
  id: string
  name: string
  filters: Record<string, string>
  createdAt: string
}

export interface MemberMediaDTO {
  id: string
  email: string
  name: string
  role: string
  perimeterType: string
  perimeterValue: { gouvernorats?: string[]; lat?: number; lng?: number; rayonKm?: number; polygon?: [number, number][] }
}

export interface EngineSettingsDTO {
  SAISONNALITE: Record<string, number[]>
  CHEVAUCHEMENT: { facteurSupplementaire: number; croissanceJournaliere: number; plafondUnicite: number }
  COUT: { cpmReference: number; margePlateforme: number }
}

export interface OwnerDTO {
  id: string
  code: string
  name: string
  type: string
  contact: string | null
  phone: string | null
  email: string | null
  brandSlug: string | null
  panelsCount: number
}

// ─────────────────── Filtres de l'explorateur ───────────────────

export interface FaceFilters {
  gouvernorat?: string
  delegation?: string
  format?: string
  technologie?: string
  statut?: string
  support?: string
  prixMin?: number
  prixMax?: number
  tmjaMin?: number
  audienceMin?: number
  distanceStationKm?: number // distance à une station de l'enseigne
  concurrence?: boolean // présence de stations concurrentes dans le rayon
  alcool?: boolean // autorisation alcool
  sovMax?: number
}

// ─────────────────── Registre des champs (édition en ligne) ───────────────────

export type FieldGroup = "GEOMETRIE" | "TRAFIC" | "AUDIENCE" | "CONCURRENTIEL" | "COMMERCIAL" | "TECHNIQUE"

export interface FieldDef {
  key: string
  label: string
  type: "int" | "float" | "string" | "bool"
  min?: number
  max?: number
  /** GESTIONNAIRE = éditable par l'enseigne (rôles gestionnaire+) et le SA ;
   *  SA = éditable par le super-administrateur uniquement ;
   *  CALCULE = grisée pour tous (calculée par le moteur — ex. part de voix). */
  edit: "GESTIONNAIRE" | "SA" | "CALCULE"
  group: FieldGroup
  unit?: string
}

export const FIELD_GROUPS_LABELS: Record<FieldGroup, string> = {
  GEOMETRIE: "Géométrie & visibilité",
  TRAFIC: "Trafic & flux",
  AUDIENCE: "Audience",
  CONCURRENTIEL: "Environnement concurrentiel",
  COMMERCIAL: "Commercial",
  TECHNIQUE: "Technique & légal",
}

/** Registre exhaustif des champs éditables d'une face — la validation
 *  serveur (PATCH) utilise exactement cette table : min/max, type, qui peut
 *  éditer. Toute édition est tracée dans le journal d'audit (ancienne valeur,
 *  nouvelle valeur, auteur, date, IP). */
export const FACE_FIELDS: FieldDef[] = [
  // Géométrie & visibilité
  { key: "visibiliteMinM", label: "Visibilité min (m)", type: "int", min: 1, max: 500, edit: "SA", group: "GEOMETRIE" },
  { key: "visibiliteMaxM", label: "Visibilité max (m)", type: "int", min: 5, max: 1000, edit: "SA", group: "GEOMETRIE" },
  { key: "angleMortDeg", label: "Angle mort (°)", type: "float", min: 0, max: 90, edit: "SA", group: "GEOMETRIE" },
  { key: "obstacles", label: "Obstacles", type: "string", edit: "SA", group: "GEOMETRIE" },
  { key: "tempsLectureS", label: "Temps de lecture (s)", type: "float", min: 0.5, max: 30, edit: "SA", group: "GEOMETRIE" },
  // Trafic & flux — éditables en ligne par l'enseigne (mise à jour terrain)
  { key: "tmja", label: "TMJA (véh./j)", type: "int", min: 0, max: 300_000, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "traficHeurePointe", label: "Trafic heure pointe", type: "int", min: 0, max: 30_000, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "partDeuxRoues", label: "Part deux-roues (%)", type: "float", min: 0, max: 100, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "partVL", label: "Part véhicules légers (%)", type: "float", min: 0, max: 100, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "partPL", label: "Part poids lourds (%)", type: "float", min: 0, max: 100, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "partTaxis", label: "Part taxis (%)", type: "float", min: 0, max: 100, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "vitesseReglementaire", label: "Vitesse réglementaire (km/h)", type: "int", min: 10, max: 130, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "vitesseReelle", label: "Vitesse réelle (km/h)", type: "float", min: 5, max: 130, edit: "GESTIONNAIRE", group: "TRAFIC" },
  { key: "indiceCongestion", label: "Indice de congestion", type: "float", min: 0, max: 100, edit: "GESTIONNAIRE", group: "TRAFIC" },
  // Audience — éditable en ligne (import / saisie manuelle / mise à jour)
  { key: "audienceJournaliere", label: "Audience journalière", type: "int", min: 0, max: 500_000, edit: "GESTIONNAIRE", group: "AUDIENCE" },
  { key: "audienceMensuelle", label: "Audience mensuelle", type: "int", min: 0, max: 15_000_000, edit: "GESTIONNAIRE", group: "AUDIENCE" },
  { key: "odvJournalieres", label: "ODV journalières", type: "int", min: 0, max: 500_000, edit: "GESTIONNAIRE", group: "AUDIENCE" },
  { key: "odvMensuelles", label: "ODV mensuelles", type: "int", min: 0, max: 15_000_000, edit: "GESTIONNAIRE", group: "AUDIENCE" },
  { key: "partResidents", label: "Part résidents (%)", type: "float", min: 0, max: 100, edit: "SA", group: "AUDIENCE" },
  // Environnement concurrentiel — grisées côté enseigne
  { key: "stationsProprietaireRayon", label: "Stations propriétaire (rayon)", type: "int", min: 0, max: 50, edit: "SA", group: "CONCURRENTIEL" },
  { key: "stationsConcurrentesRayon", label: "Stations concurrentes (rayon)", type: "int", min: 0, max: 50, edit: "SA", group: "CONCURRENTIEL" },
  { key: "panneauxRayon1km", label: "Panneaux dans 1 km", type: "int", min: 0, max: 50, edit: "SA", group: "CONCURRENTIEL" },
  { key: "partDeVoix", label: "Part de voix (%)", type: "float", min: 0, max: 100, edit: "CALCULE", group: "CONCURRENTIEL" },
  // Commercial — SA uniquement (prix, remises, occupation, clients)
  { key: "prixSemaine", label: "Prix / semaine (DT)", type: "float", min: 0, max: 100_000, edit: "SA", group: "COMMERCIAL" },
  { key: "prixMois", label: "Prix / mois (DT)", type: "float", min: 0, max: 400_000, edit: "SA", group: "COMMERCIAL" },
  { key: "prixTrimestre", label: "Prix / trimestre (DT)", type: "float", min: 0, max: 1_000_000, edit: "SA", group: "COMMERCIAL" },
  { key: "prixSemestre", label: "Prix / semestre (DT)", type: "float", min: 0, max: 2_000_000, edit: "SA", group: "COMMERCIAL" },
  { key: "prixAnnee", label: "Prix / année (DT)", type: "float", min: 0, max: 4_000_000, edit: "SA", group: "COMMERCIAL" },
  { key: "remiseVolumeMax", label: "Remise volume max (%)", type: "float", min: 0, max: 60, edit: "SA", group: "COMMERCIAL" },
  { key: "tauxOccupation12m", label: "Occupation 12 mois (%)", type: "float", min: 0, max: 100, edit: "SA", group: "COMMERCIAL" },
  // Technique & légal
  { key: "contraintesMunicipales", label: "Contraintes municipales", type: "string", edit: "SA", group: "TECHNIQUE" },
  { key: "alcoolAutorise", label: "Alcool autorisé", type: "bool", edit: "SA", group: "TECHNIQUE" },
  { key: "procedureReservation", label: "Procédure de réservation", type: "string", edit: "SA", group: "TECHNIQUE" },
]

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FACE_FIELDS.map(f => [f.key, f]))

// ─────────────────── Helpers géo (purs — client & serveur) ───────────────────

/** Distance haversine en km. */
export function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Point dans un polygone (ray casting) — polygon = [[lat, lng], ...]. */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ─────────────────── Rôles & capacités ───────────────────

export type MediaRole = "SA" | "ADMIN" | "GESTIONNAIRE" | "ANALYSTE" | "LECTEUR"

/** Mapping rôles plateforme → rôles média de la spécification :
 *  super-administrateur / administrateur enseigne / gestionnaire enseigne /
 *  analyste enseigne / lecteur enseigne. */
export function toMediaRole(role: string): MediaRole {
  if (role === "SUPER_ADMIN") return "SA"
  if (role === "ADMIN" || role === "DG") return "ADMIN"
  if (role === "NETWORK") return "GESTIONNAIRE"
  if (role === "COMMERCIAL" || role === "EXPANSION") return "ANALYSTE"
  return "LECTEUR"
}

/** Capacités par rôle — le rôle détermine les ACTIONS, pas les données
 *  visibles (celles-ci relèvent des couches 2 et 3). */
export const MEDIA_CAPS: Record<MediaRole, {
  editFaces: boolean // champs trafic/audience (GESTIONNAIRE) en ligne
  editAllFields: boolean // intégralité des champs (SA)
  createSimulation: boolean
  export: boolean
  manageMembers: boolean
  manageReferential: boolean // panneaux, faces, propriétaires, permissions, moteur
  readAudit: boolean
}> = {
  SA: { editFaces: true, editAllFields: true, createSimulation: false, export: true, manageMembers: true, manageReferential: true, readAudit: true },
  ADMIN: { editFaces: true, editAllFields: false, createSimulation: true, export: true, manageMembers: true, manageReferential: false, readAudit: false },
  GESTIONNAIRE: { editFaces: true, editAllFields: false, createSimulation: true, export: true, manageMembers: false, manageReferential: false, readAudit: false },
  ANALYSTE: { editFaces: false, editAllFields: false, createSimulation: true, export: true, manageMembers: false, manageReferential: false, readAudit: false },
  LECTEUR: { editFaces: false, editAllFields: false, createSimulation: false, export: false, manageMembers: false, manageReferential: false, readAudit: false },
}

export const MEDIA_ROLE_LABELS: Record<MediaRole, string> = {
  SA: "Super-administrateur",
  ADMIN: "Administrateur enseigne",
  GESTIONNAIRE: "Gestionnaire enseigne",
  ANALYSTE: "Analyste enseigne",
  LECTEUR: "Lecteur enseigne",
}

/** Poids par défaut du score composite (personnalisables par membre). */
export const DEFAULT_SCORE_WEIGHTS = { audience: 0.35, trafic: 0.25, prix: 0.2, partDeVoix: 0.2 }

/** Score composite d'une face (comparateur) : normalisation min-max sur le
 *  lot comparé, pondérations par membre. Le prix est inversé (moins cher =
 *  mieux). Déterministe — utilisé côté client ET côté serveur. */
export function compositeScore(
  faces: { audienceJournaliere: number; tmja: number; prixSemaine: number; partDeVoix: number }[],
  weights: { audience: number; trafic: number; prix: number; partDeVoix: number },
): number[] {
  const norm = (vals: number[], invert = false) => {
    const min = Math.min(...vals), max = Math.max(...vals)
    if (max === min) return vals.map(() => 0.5)
    return vals.map(v => (invert ? (max - v) / (max - min) : (v - min) / (max - min)))
  }
  const a = norm(faces.map(f => f.audienceJournaliere))
  const t = norm(faces.map(f => f.tmja))
  const p = norm(faces.map(f => f.prixSemaine), true)
  const s = norm(faces.map(f => f.partDeVoix))
  return faces.map((_, i) =>
    Math.round((a[i] * weights.audience + t[i] * weights.trafic + p[i] * weights.prix + s[i] * weights.partDeVoix) * 1000) / 10,
  )
}
