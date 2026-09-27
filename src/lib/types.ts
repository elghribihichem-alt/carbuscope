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
  // Réponse officielle de l'enseigne (C.2.6+)
  replyText?: string | null
  repliedAt?: string | null
  repliedBy?: string | null
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

// ---- Réputation & avis (portail enseigne : comparaison concurrents + valeur enseigne) ----

export const REVIEW_CRITERIA_LABELS: Record<string, string> = {
  proprete: "Propreté",
  accueil: "Accueil",
  rapidite: "Rapidité",
  services: "Offre de services",
}

export type ReputationBrandRow = {
  slug: string
  name: string
  color: string
  avgRating: number
  reviewsCount: number
  stationsCount: number
  shareOfVoice: number // % des avis du marché
  responseRate: number // % d'avis avec réponse officielle de l'enseigne
  valueIndex: number // IVE 0-100
}

export type ReputationStats = {
  fetchedAt: string
  brand: { slug: string; name: string; color: string }
  own: {
    avgRating: number
    reviewsCount: number
    repliesCount: number
    responseRate: number
    avgReplyDelayHours: number | null
    stationsWithReviews: number
    stationsTotal: number
    shareOfVoice: number
    distribution: { rating: number; count: number }[]
    criteria: { key: string; label: string; value: number }[]
    trend: { months: string[]; values: number[]; counts: number[] }
    topStations: { code: string; name: string; gouvernorat: string; rating: number; reviewsCount: number }[]
    flopStations: { code: string; name: string; gouvernorat: string; rating: number; reviewsCount: number }[]
    // Surveillance des notes : stations en perte de vitesse (chute récente ≥ 0,8 pt)
    watchlist: {
      id: string; code: string; name: string; gouvernorat: string
      previousRating: number; currentRating: number; delta: number; recentCount: number
      lastLowReview: { author: string; rating: number; comment: string; createdAt: string } | null
    }[]
    recentReviews: {
      id: string
      author: string
      rating: number
      comment: string
      createdAt: string
      replyText: string | null
      repliedAt: string | null
      repliedBy: string | null
      stationName: string
      stationCode: string
      gouvernorat: string
    }[]
  }
  market: {
    avgRating: number
    reviewsCount: number
    responseRate: number
    distribution: { rating: number; count: number }[]
    criteria: { key: string; label: string; value: number }[]
    trend: { months: string[]; values: number[] }
    brandComparison: ReputationBrandRow[]
  }
  valueIndex: {
    score: number
    rank: number
    brandsCount: number
    details: { key: string; label: string; points: number; max: number; hint: string }[]
  }
}

// ---- Portail : veille automatisée des notes (alertes email programmées, C.2.6+) ----

export type WatchlistAlertDTO = {
  id: string
  scope: string // "ALL" ou code station
  stationLabel: string
  thresholdPoints: number
  frequency: string // IMMEDIATE | DAILY | WEEKLY
  email: string
  active: boolean
  triggerCount: number
  lastTriggeredAt: string | null
  createdAt: string
  // Évaluation live contre la watchlist courante
  nowExceedCount: number
  nowExamples: string[]
}

export type WatchlistAlertsResponse = {
  watchlistCount: number
  alerts: WatchlistAlertDTO[]
}

// ---- Veille : moteur périodique d'évaluation des alertes (C.2.6+, back-office) ----

export type AlertRunExample = {
  name: string
  gouvernorat: string
  previousRating: number
  currentRating: number
  delta: number
}

export type AlertRunDetail = {
  alertId: string
  brandSlug: string
  brandName: string
  brandColor: string
  stationLabel: string
  thresholdPoints: number
  frequency: string // IMMEDIATE | DAILY | WEEKLY
  email: string
  status: "TRIGGERED" | "STABLE" | "SKIPPED"
  exceedCount: number
  examples: AlertRunExample[]
  subject: string | null
  preview: string | null
}

export type AlertRunDTO = {
  id: string
  ranAt: string
  mode: string // MANUAL | SCHEDULED
  brandsCovered: number
  evaluatedAlerts: number
  triggeredAlerts: number
  skippedAlerts: number
  stationsFlagged: number
  emailsQueued: number
  durationMs: number
  details: AlertRunDetail[]
}

export type BrandAlertsRow = {
  slug: string
  name: string
  color: string
  alertsTotal: number
  alertsActive: number
  watchlistCount: number
  worstDropName: string | null
  worstDropDelta: number | null
  immediate: number
  daily: number
  weekly: number
  totalTriggers: number
  lastTriggeredAt: string | null
  activeEmails: number
}

export type WatchlistOverviewResponse = {
  totals: {
    alertsTotal: number
    alertsActive: number
    brandsCovered: number
    totalTriggers: number
    emailsQueuedLastRun: number
    lastRunAt: string | null
    nextScheduledAt: string | null
  }
  brands: BrandAlertsRow[]
  runs: AlertRunDTO[]
}

// ---- Notifications in-app enseigne (C.2.6+, portail) ----

export type NotificationDTO = {
  id: string
  brandSlug: string
  kind: string // WATCHLIST | SYSTEM | DECREE
  title: string
  body: string
  stationLabel: string | null
  deltaPoints: number | null
  alertRunId: string | null
  read: boolean
  createdAt: string
}

export type NotificationsResponse = {
  notifications: NotificationDTO[]
  unread: number
  total: number
}

// ---- Observatoire des prix du carburant (T22, B2B + mobile B2C) ----

export type FuelType = "ESSENCE" | "GAZOLE" | "GPL"

export type FuelPriceDTO = {
  id: string
  fuelType: FuelType
  priceMillimes: number // prix pompe (millimes/L, ou /kg pour le GPL)
  marginMillimes: number // marge détaillant réglementée
  effectiveAt: string
  decreeNote: string | null
}

export type FuelPriceCurrent = {
  fuelType: FuelType
  priceMillimes: number
  marginMillimes: number
  effectiveAt: string
  decreeNote: string | null
  daysSince: number
  // Variation vs décret précédent
  prevPriceMillimes: number | null
  deltaMillimes: number | null // +X millimes (négatif si baisse)
  deltaPct: number | null
}

export type FuelPricesResponse = {
  fetchedAt: string
  current: FuelPriceCurrent[]
  history: FuelPriceDTO[] // ordre chronologique, tous carburants
  totals: {
    decrees: number
    lastChangeAt: string | null // décret le plus récent (tous carburants)
    nextReviewLabel: string // « révision mensuelle — début du mois prochain »
  }
}

// ---- Back-office : statistiques plateforme réelles (D.2.5 étendu) ----

export type PlatformStats = {
  fetchedAt: string
  stations: {
    total: number; rated: number; wellRated: number; fresh: number; h24: number; withAddress: number
    servicesTotal: number; avgServicesPerStation: number; qualityScore: number
  }
  reviews: {
    total: number; avgRating: number; distinctAuthors: number
    trend: { month: string; reviews: number; authors: number }[]
    topReviewers: { author: string; count: number }[]
  }
  moderation: {
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    resolutionRate: number
    avgDelayHours: number | null // délai moyen de traitement (createdAt → updatedAt)
    resolvedCount: number
    topContributors: { author: string; count: number }[]
  }
  alerts: {
    total: number
    bySeverity: Record<string, number>
    byType: { type: string; count: number }[]
  }
  users: {
    total: number; active: number
    byRole: { role: string; count: number }[]
  }
  reports: {
    total: number
    byStatus: { status: string; count: number }[]
  }
}

// ---- Module veille terrain (T28) : agents de zone, missions, rapports ----

export type MissionType = "CONTROLE" | "VEILLE_CONCURRENT"
export type MissionStatus = "PLANIFIEE" | "EN_COURS" | "TERMINEE" | "ANNULEE"
export type MissionTaskStatus = "TODO" | "FAITE" | "ANOMALIE"

export type FieldAgentDTO = {
  id: string
  code: string
  name: string
  phone: string
  brandSlug: string
  zone: string
  active: boolean
  createdAt: string
  // statistiques dérivées
  missionsTotal: number
  missionsOpen: number
  missionsDone: number
  reportsCount: number
}

export type MissionTaskDTO = {
  id: string
  missionId: string
  stationCode: string | null
  stationName: string
  competitorSlug: string | null
  targetLabel: string
  lat: number | null
  lng: number | null
  taskType: string
  status: MissionTaskStatus
  order: number
  lastReport: VisitReportDTO | null
}

export type MissionDTO = {
  id: string
  title: string
  type: MissionType
  brandSlug: string
  agentId: string | null
  agentName: string | null
  agentCode: string | null
  zone: string
  status: MissionStatus
  dueDate: string | null
  instructions: string
  createdAt: string
  tasksTotal: number
  tasksDone: number
  tasksAnomaly: number
}

export type MissionDetailDTO = MissionDTO & {
  tasks: MissionTaskDTO[]
}

export type VisitReportDTO = {
  id: string
  taskId: string
  agentId: string
  agentName: string | null
  stationCode: string | null
  gazolePrice: number | null
  essencePrice: number | null
  gplPrice: number | null
  queueMinutes: number | null
  staffCount: number | null
  cleanliness: number | null
  complianceScore: number | null
  anomalies: string
  competitorPractices: string | null
  notes: string
  createdAt: string
}

export type MissionsResponse = {
  missions: MissionDTO[]
  total: number
  agents: FieldAgentDTO[]
}

export type FieldAgentsResponse = {
  agents: FieldAgentDTO[]
}

export type VisitReportInput = {
  taskId: string
  agentCode: string
  stationCode?: string | null
  gazolePrice?: number | null
  essencePrice?: number | null
  gplPrice?: number | null
  queueMinutes?: number | null
  staffCount?: number | null
  cleanliness?: number | null
  complianceScore?: number | null
  anomalies?: string
  competitorPractices?: string | null
  notes?: string
  anomaly?: boolean // true → la tâche passe en ANOMALIE au lieu de FAITE
}

// ---------- V7 : authentification réelle (session serveur + 2FA TOTP) ----------

/** Utilisateur connecté (cookie de session signé httpOnly, TTL 12 h). */
export interface SessionUser {
  id: string
  email: string
  name: string
  /** SUPER_ADMIN | ADMIN | NETWORK | COMMERCIAL | EXPANSION | VIEWER */
  role: string
  brandSlug: string | null
  brandName: string | null
  /** Double authentification TOTP active sur le compte. */
  totpEnabled: boolean
  /** Espaces produit autorisés pour ce profil (Super Administration incluse pour la racine). */
  spaces: string[]
}

/** Compte de démonstration retourné par /api/auth/accounts (écran de connexion + changeur de compte). */
export interface DemoAccount {
  name: string
  email: string
  role: string
  brandSlug: string | null
  brandName: string | null
  totpEnabled: boolean
}

// ---------- T43 : relances de fraîcheur J+7 (cahier des charges §3.2) ----------

/** Station dont la fiche dépasse le seuil de re-vérification (délai de mise à jour < 7 jours). */
export interface RelanceStationDTO {
  code: string
  name: string
  brandSlug: string
  brandName: string
  brandColor: string
  gouvernorat: string
  delegation: string
  lastVerified: string
  daysLate: number
  verifiedBy: string
  /** Dernière relance envoyée pour cette fiche (notification RELANCE, null si jamais). */
  lastReminderAt: string | null
}

export interface RelancesKpis {
  /** Stations actives de l'enseigne (hors projets). */
  total: number
  /** Fiches au-delà du seuil. */
  overdue: number
  /** % de fiches vérifiées dans le délai (cible cahier des charges : > 90 % à 12 mois). */
  freshnessRate: number
  /** Retard moyen des fiches en retard (jours). */
  avgDaysLate: number
  /** Retard de la fiche la plus ancienne non revérifiée (jours). */
  oldestDays: number
  /** Fiches déjà relancées dans les dernières 24 h (anti-spam). */
  relanced24h: number
}

export interface RelancesResponse {
  seuil: number
  stations: RelanceStationDTO[]
  kpis: RelancesKpis
}

export interface RelancePostResponse {
  sent: number
  skipped: number
  notifiedBrand: string
}

// ---------- T44 : module Shadow Market (marché parallèle du carburant) ----------
// Recensement des points de vente informels (vendeurs clandestins), cartographie,
// analyse de cannibalisation et pertes estimées. Accessible à la Super
// Administration (vision nationale) et aux enseignes (leurs pertes).
// Couleurs métier : rouge #E53935 (critique) · orange #FF9800 (modéré) ·
// jaune #FFC107 (vigilance) · vert #4CAF50 (calme) · bleu #2196F3 (info) ·
// gris #9E9E9E (inactif).

export const SHADOW_LEVELS = ["RED", "ORANGE", "YELLOW", "GREEN"] as const
export type ShadowLevel = (typeof SHADOW_LEVELS)[number]

export const SHADOW_STATUS_LABELS: Record<string, string> = {
  BRUT: "Brut",
  VERIFIE: "Vérifié",
  VALIDE: "Validé",
  REJETE: "Rejeté",
  DOUBLON: "Doublon",
}

export const SHADOW_UPDATE_KIND_LABELS: Record<string, string> = {
  APPARITION: "Apparition",
  DISPARITION: "Disparition",
  REAPPARITION: "Réapparition",
  VOLUME: "Volume",
  PRIX: "Prix",
  TYPE: "Typologie",
  DEPLACEMENT: "Déplacement",
  STATUT: "Statut",
}

export const SHADOW_SOURCE_LABELS: Record<string, string> = {
  AGENT: "Agent terrain",
  CONTROLEUR: "Contrôleur mobile",
  AUDIT: "Audit plateforme",
  CONTRIBUTION: "Contribution citoyen",
}

export type ShadowTypologyDTO = {
  code: string
  label: string
  description: string
  icon: string
  color: string
  volumeLJ: number
  active: boolean
  sortOrder: number
}

export type ShadowPointDTO = {
  id: string
  code: string
  typologyCode: string
  status: string
  gouvernorat: string
  delegation: string
  cite: string | null
  lat: number
  lng: number
  volumeLJ: number
  priceMillimes: number | null
  photoUrl: string | null
  notes: string
  source: string
  reporter: string
  brandThreat: string | null
  firstSeenAt: string
  lastCheckAt: string
  active: boolean
  /** Perte mensuelle estimée pour ce point (DT) — calcul serveur. */
  lossTnd: number
  /** Station la plus proche (calcul serveur, distance en mètres). */
  nearestStation: { code: string; name: string; brandSlug: string; brandName: string; distanceM: number } | null
}

export type ShadowPointInput = {
  typologyCode: string
  gouvernorat: string
  delegation: string
  cite?: string | null
  lat: number
  lng: number
  volumeLJ: number
  priceMillimes?: number | null
  photoUrl?: string | null
  notes?: string
  reporter?: string
  source?: string
}

export type ShadowUpdateDTO = {
  id: string
  pointCode: string
  pointTypology: string
  kind: string
  oldValue: string | null
  newValue: string | null
  author: string
  date: string
  gouvernorat: string
}

export type ShadowAuditorDTO = {
  id: string
  name: string
  zone: string
  brandSlug: string
  phone: string
  pointsDone: number
  rechecks: number
  active: boolean
}

export type ShadowCensusEventDTO = {
  id: string
  teamLabel: string
  zone: string
  kind: string
  date: string
  pointsTargeted: number
  pointsFound: number
  status: string
}

export type ShadowAlertDTO = {
  id: string
  severity: string
  kind: string
  title: string
  detail: string
  zone: string
  stationCode: string | null
  stationName: string | null
  lossTnd: number
  date: string
}

export type ShadowMonthlyStatDTO = {
  month: string
  label: string
  activePoints: number
  newPoints: number
  closedPoints: number
  estLossTnd: number
  note: string | null
}

export type ShadowGovLossDTO = {
  gouvernorat: string
  points: number
  volumeLJ: number
  lossTnd: number
  stationsThreatened: number
  level: ShadowLevel
}

export type ShadowThreatStationDTO = {
  code: string
  name: string
  brandSlug: string
  brandName: string
  brandColor: string
  gouvernorat: string
  delegation: string
  lat: number
  lng: number
  traffic: number
  points: number
  volumeStolenLJ: number
  lossTnd: number
  level: ShadowLevel
  worstDistanceM: number | null
}

export type ShadowTypologyStatDTO = {
  code: string
  label: string
  color: string
  count: number
  pct: number
  volumeLJ: number
  lossTnd: number
}

export type ShadowConfigDTO = {
  radiiM: number[]
  cannibRadiusM: number
  redZoneThreshold: number
  lossRedTnd: number
  lossOrangeTnd: number
  notifyRadiusM: number
  notifyActive: boolean
  marginTndPerL: number
}

export type ShadowOverviewKpis = {
  activePoints: number
  estLossTnd: number
  stationsThreatened: number
  stationsThreatenedRed: number
  monthVariationPct: number
  lossVariationPct: number
  marketShareStolenPct: number
  volumeLJ: number
  pendingValidation: number
  newThisWeek: number
}

export type ShadowOverviewResponse = {
  month: string
  monthLabel: string
  scope: "NATIONAL" | "BRAND"
  brandSlug: string | null
  kpis: ShadowOverviewKpis
  alerts: ShadowAlertDTO[]
  govLosses: ShadowGovLossDTO[]
  typologies: ShadowTypologyStatDTO[]
  monthly: ShadowMonthlyStatDTO[]
  topThreats: ShadowThreatStationDTO[]
  calendar: ShadowCensusEventDTO[]
}

export type ShadowMapStationDTO = {
  code: string
  name: string
  brandSlug: string
  brandName: string
  brandColor: string
  gouvernorat: string
  delegation: string
  lat: number
  lng: number
  points: number
  lossTnd: number
  level: ShadowLevel
}

export type ShadowRedZoneDTO = {
  label: string
  gouvernorat: string
  lat: number
  lng: number
  radiusM: number
  points: number
  lossTnd: number
}

export type ShadowRoadStatDTO = {
  code: string
  name: string
  type: string
  tmj: number
  points: number
  lossTnd: number
}

export type ShadowMapResponse = {
  scope: "NATIONAL" | "BRAND"
  points: ShadowPointDTO[]
  stations: ShadowMapStationDTO[]
  govHeat: ShadowGovLossDTO[]
  redZones: ShadowRedZoneDTO[]
  roads: ShadowRoadStatDTO[]
  typologies: ShadowTypologyDTO[]
  config: ShadowConfigDTO
}

export type ShadowPointWithDistanceDTO = ShadowPointDTO & {
  distanceM: number
  capturedLJ: number
}

export type ShadowStationImpactResponse = {
  station: {
    code: string
    name: string
    brandSlug: string
    brandName: string
    brandColor: string
    gouvernorat: string
    delegation: string
    lat: number
    lng: number
    traffic: number
    status: string
  }
  points: ShadowPointWithDistanceDTO[]
  lossTnd: number
  volumeStolenLJ: number
  capturedPct: number
  level: ShadowLevel
  nearbyStations: { code: string; name: string; brandName: string; brandColor: string; lossTnd: number; points: number }[]
  config: ShadowConfigDTO
}

export type ShadowBrandLossDTO = {
  brandSlug: string
  brandName: string
  brandColor: string
  lossTnd: number
  stationsThreatened: number
  points: number
  sharePct: number
}

export type ShadowRegionImpactResponse = {
  gouvernorats: ShadowGovLossDTO[]
  brands: ShadowBrandLossDTO[]
  total: { points: number; lossTnd: number; stationsThreatened: number; volumeLJ: number }
}

export type ShadowSimulationResponse = {
  baseline: { lossTnd: number; points: number; volumeLJ: number }
  projected: { lossTnd: number; points: number; volumeLJ: number; recoveredTnd: number }
  curve: { week: number; baselineTnd: number; projectedTnd: number }[]
  assumptions: { elasticity: number; informalSensitivity: number; priceCutMillimes: number; note: string }
  scopeLabel: string
}

export type ShadowReportsResponse = {
  month: string
  monthLabel: string
  generatedAt: string
  summary: {
    activePoints: number
    estLossTnd: number
    stationsThreatened: number
    newPoints: number
    neutralized: number
    pendingValidation: number
    topGouvernorat: string
  }
  topThreats: ShadowThreatStationDTO[]
  govLosses: ShadowGovLossDTO[]
  recommendations: string[]
  brands: ShadowBrandLossDTO[]
  exports: { id: string; name: string; format: string; sizeKb: number; createdAt: string; scope: string }[]
}

export type ShadowAccessDTO = {
  email: string
  name: string
  role: string
  scope: "NATIONAL" | "BRAND" | "ZONE"
  brandSlug: string | null
  brandName: string | null
  shadowAccess: boolean
  zone: string | null
}
