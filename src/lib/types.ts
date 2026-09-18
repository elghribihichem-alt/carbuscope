// CarbuScope — Types partagés (contrats d'API et DTO)

export type BrandDTO = {
  id: string
  slug: string
  name: string
  color: string
  stationCount: number
  isIndependents: boolean
}

export type ServiceDTO = {
  slug: string
  name: string
  icon: string
}

export type StationStatus = "ACTIVE" | "RENOVATION" | "PROJECT" | "CLOSED"

export type StationDTO = {
  id: string
  code: string
  name: string
  brandId: string | null
  brandSlug: string | null
  brandName: string
  brandColor: string
  gouvernorat: string
  delegation: string
  address: string
  lat: number
  lng: number
  status: StationStatus
  traffic: number
  open24: boolean
  open7j: boolean
  rating: number
  reviewsCount: number
  photoUrl: string | null
  lastVerified: string
  verifiedBy: string
  services: string[]
}

export type ReviewDTO = {
  id: string
  stationId: string
  author: string
  rating: number
  comment: string
  criteria: Record<string, number> | null
  createdAt: string
}

export type HistoryDTO = {
  id: string
  field: string
  oldValue: string
  newValue: string
  author: string
  source: string
  createdAt: string
}

export type StationDetail = {
  station: StationDTO
  reviews: ReviewDTO[]
  history: HistoryDTO[]
  nearby: (StationDTO & { distanceKm: number })[]
}

export type AlertType = "OPENING" | "RENOVATION" | "REBRAND" | "INFRA" | "REGULATORY"
export type AlertSeverity = "CRITICAL" | "MEDIUM" | "INFO"

export type AlertDTO = {
  id: string
  type: AlertType | string
  severity: AlertSeverity | string
  title: string
  description: string
  brand: string
  gouvernorat: string
  date: string
  impact: string
  stationCode: string | null
  read: boolean
}

export type MovementDTO = {
  id: string
  date: string
  type: "OPENING" | "RENOVATION" | "CLOSURE" | "REBRAND" | string
  brand: string
  station: string
  gouvernorat: string
  impact: string
}

export type OverviewStats = {
  totalNational: number
  myStations: number
  marketSharePct: number
  toRenovate: number
  underTension: number
  avgTraffic: number
  alerts: { critical: number; medium: number; info: number; total: number }
  alertsFeed: AlertDTO[]
}

export type GouvernoratStatRow = {
  gouvernorat: string
  mine: number
  competitors: number
  total: number
}

export type ServicesEvolution = {
  years: number[]
  series: { service: string; values: number[] }[]
}

export type MarketShareRow = {
  brand: string
  slug: string
  color: string
  stations: number
  sharePct: number
}

export type MovementsStats = {
  months: string[]
  openings: number[]
  renovations: number[]
  closures: number[]
  rebrands: number[]
  byBrand: { brand: string; openings: number; renovations: number; closures: number }[]
}

export type CompetitionStats = {
  competitorsTotal: number
  competitorsInZone: number
  saturationIndex: number
  avgCompetitorsPerStation: number
  underservedZones: { gouvernorat: string; stations: number; expected: number; deficit: number }[]
  marketShare: MarketShareRow[]
  servicesDensity: { service: string; competitorsPct: number; minePct: number }[]
  openingsEvolution: { months: string[]; values: number[] }
  nearby: {
    myStation: string
    myCode: string
    nearestCompetitor: string
    competitorBrand: string
    competitorColor: string
    distanceKm: number
    differentiators: string[]
    status: "TENSION" | "WATCH" | "OK"
  }[]
}

export type GovernoratRow = {
  name: string
  population: number
  vehicles: number
  motorizationRate: number
  avgFleetAge: number
  delegationCount: number
  stations: number
}

export type RoadDTO = {
  id: string
  code: string
  name: string
  type: "AUTOROUTE" | "RN" | "GP" | string
  tmj: number
  heavyVehiclePct: number
  segments: [number, number][]
}

export type ProjectDTO = {
  id: string
  name: string
  type: string
  status: "CONSTRUCTION" | "PLANIFIE" | string
  budget: string
  targetDate: string
  description: string
  lat: number
  lng: number
}

export type ReportDTO = {
  id: string
  name: string
  type: "CONCURRENCE" | "IMPLANTATION" | "PERFORMANCE" | "VEILLE" | string
  period: string
  scope: string
  format: "PDF" | "Excel" | "PowerPoint" | string
  status: string
  generatedBy: string
  sizeKb: number
  createdAt: string
}

export type ReportScheduleDTO = {
  id: string
  name: string
  type: "WEEKLY" | "MONTHLY" | "REALTIME" | string
  target: string
  channel: string
  active: boolean
  createdAt: string
}

export type ContributionDTO = {
  id: string
  stationCode: string | null
  type: string
  comment: string
  photoUrl: string | null
  author: string
  status: "PENDING" | "VALIDATED" | "REJECTED" | string
  validationCount: number
  lat: number | null
  lng: number | null
  createdAt: string
}

export type SavedCalculationDTO = {
  id: string
  type: string
  label: string
  params: Record<string, unknown>
  result: Record<string, unknown>
  createdAt: string
}

export type PortalStats = {
  published: number
  completenessPct: number
  lastSync: string | null
  moderationAlerts: number
  historyCount: number
}

// ---------- Libellés / helpers d'affichage ----------

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  RENOVATION: "En rénovation",
  PROJECT: "En projet",
  CLOSED: "Fermée",
}

export const ALERT_TYPE_LABELS: Record<string, string> = {
  OPENING: "Ouverture concurrente",
  RENOVATION: "Rénovation",
  REBRAND: "Changement d'enseigne",
  INFRA: "Projet d'infrastructure",
  REGULATORY: "Évolution réglementaire",
}

export const ALERT_SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "Critique",
  MEDIUM: "Moyen",
  INFO: "Info",
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  OPENING: "Ouverture",
  RENOVATION: "Rénovation",
  CLOSURE: "Fermeture",
  REBRAND: "Re-branding",
}

export const SERVICE_LABELS: Record<string, string> = {
  boutique: "Boutique",
  gonflage: "Gonflage (air/eau)",
  toilettes: "Toilettes",
  atm: "DAB / Retrait",
  cafe: "Café / Snack",
  lavage: "Lavage",
  vidange: "Vidange",
  atelier: "Atelier mécanique",
  recharge: "Borne de recharge",
}

export const REPORT_TYPE_LABELS: Record<string, string> = {
  CONCURRENCE: "Analyse concurrentielle",
  IMPLANTATION: "Potentiel d'implantation",
  PERFORMANCE: "Performance réseau",
  VEILLE: "Veille",
}

export const CONTRIBUTION_TYPE_LABELS: Record<string, string> = {
  CLOSED: "Station fermée",
  SERVICE_UNAVAILABLE: "Service indisponible",
  PRICE_ABNORMAL: "Prix anormal",
  PUMP_BROKEN: "Panne de pompe",
  QUEUE: "File d'attente",
  CLEANLINESS: "Propreté",
}
