// T51 — Contrats DTO partagés client/serveur des modules « Opportunity Radar »
// et « Mobility Hub Operations ». Source de vérité des échanges /api/opportunity/*
// et /api/mobility/*. Libellés FR partagés (formats, statuts, catégories).

// ===== Paramétrages =====
export interface OpportunitySettingDTO {
  id: string
  brandSlug: string | null
  enabled: boolean
  weightPark: number
  weightPower: number
  weightTraffic: number
  weightCompetition: number
  weightFoncier: number
  alertThreshold: number
  whiteZoneKm: number
  updatedAt: string
  updatedBy: string | null
}

export interface HubSettingDTO {
  id: string
  brandSlug: string | null
  enabled: boolean
  vehicleAlertKm: number
  vehicleAlertDays: number
  equipmentAlertDays: number
  conversionTargetPct: number
  updatedAt: string
  updatedBy: string | null
}

// ===== Opportunity Radar =====
export interface OpportunityZoneDTO {
  id: string
  gouvernorat: string
  delegation: string
  zoneName: string
  lat: number
  lng: number
  areaKm2: number
  population: number
  vehicles: number
  vehicleDensity: number
  trafficDaily: number
  purchasingPowerIdx: number
  competitorCount: number
  nearestStationKm: number
  foncierPriceM2: number
  foncierDispo: string
  isWhiteZone: boolean
  scorePark: number
  scorePower: number
  scoreTraffic: number
  scoreCompetition: number
  scoreFoncier: number
  scoreGlobal: number
  recommendedFormat: string
  status: string
  notes: string | null
  /** Score global recalculé avec les poids du paramétrage (affichage DG). */
  weightedScore: number
  hasStudy: boolean
  hubCode: string | null
}

export interface OpportunityAlertDTO {
  id: string
  zoneId: string | null
  gouvernorat: string
  type: string
  message: string
  score: number
  read: boolean
  createdAt: string
}

export interface EtudeFoncier {
  prixM2: number
  surfaceM2: number
  terrains: { localisation: string; surfaceM2: number; prixM2: number; statut: string }[]
}
export interface EtudeRegulation {
  etape: string
  autorite: string
  delaiJours: number
  statut: string
  commentaire: string
}
export interface EtudeRh {
  profil: string
  effectif: number
  coutMensuelDt: number
  description: string
}
export interface FeasibilityStudyDTO {
  id: string
  zoneId: string
  brandSlug: string
  title: string
  status: string
  pages: number
  investment: number
  foncier: EtudeFoncier | null
  regulation: EtudeRegulation[] | null
  rh: EtudeRh[] | null
  summary: string
  createdAt: string
  updatedAt: string
}

export interface RentabilitySimulationDTO {
  id: string
  zoneId: string
  scenario: string
  investment: number
  caYear1: number
  chargesAnnual: number
  growthPct: number
  horizonYears: number
  breakEvenMonths: number
  netYear5: number
  newClients: number
}

export interface FranchiseCandidateDTO {
  id: string
  name: string
  email: string
  phone: string
  gouvernorat: string
  city: string
  profile: string
  capital: number
  experience: string
  zoneId: string | null
  zoneLabel: string | null
  status: string
  score: number
  createdAt: string
  updatedAt: string
}

export interface FranchiseContractDTO {
  id: string
  reference: string
  candidateId: string
  candidateName: string
  brandSlug: string
  zoneId: string
  entryFee: number
  royaltyPct: number
  durationYears: number
  status: string
  content: string
  createdAt: string
}

export interface FranchiseKitItemDTO {
  id: string
  brandSlug: string
  category: string
  label: string
  description: string
  active: boolean
}

// ===== Mobility Hub Operations =====
export interface HubDTO {
  id: string
  code: string
  name: string
  brandSlug: string
  gouvernorat: string
  delegation: string
  address: string
  lat: number
  lng: number
  franchisee: string
  contractRef: string | null
  status: string
  openedAt: string
  surfaceM2: number
  bays: number
  investment: number
  targetMonthlyCa: number
  rating: number
  reviewsCount: number
  // KPIs calculés serveur
  ca30: number
  caPrev30: number
  targetPct: number
  services30: number
  vehiclesCount: number
  conversions90: number
  conversionsConfirmed90: number
  conversionRate: number
  caCaptured: number
  roiPct: number
  equipmentAlerts: number
  stockAlerts: number
}

export interface HubServiceRecordDTO {
  id: string
  hubId: string
  type: string
  vehicleId: string | null
  plate: string
  performedAt: string
  amount: number
  durationMin: number
  detail: string | null
  hubCode?: string
}

export interface HubConversionDTO {
  id: string
  hubId: string
  plate: string
  reason: string
  targetStationCode: string
  targetStationName: string
  proposedAt: string
  confirmedAt: string | null
  status: string
  amount: number
  followed: boolean
  hubCode?: string
}

export interface VehicleAlert {
  level: "URGENT" | "INFO"
  kind: "ECHEANCE_DEPASSEE" | "ECHEANCE_PROCHE"
  message: string
}

export interface HubVehicleDTO {
  id: string
  hubId: string
  plate: string
  brand: string
  model: string
  year: number
  fuel: string
  km: number
  ownerName: string
  ownerPhone: string
  firstSeenAt: string
  lastServiceAt: string | null
  nextServiceDueAt: string | null
  servicesCount: number
  totalSpent: number
  loyaltyPoints: number
  loyaltyTier: string
  notes: string | null
  hubCode?: string
  alert: VehicleAlert | null
}

export interface HubStockItemDTO {
  id: string
  hubId: string
  sku: string
  label: string
  category: string
  quantity: number
  minQuantity: number
  unitCost: number
  updatedAt: string
  hubCode?: string
}

export interface HubEquipmentDTO {
  id: string
  hubId: string
  name: string
  model: string
  installedAt: string
  lastMaintenanceAt: string | null
  nextMaintenanceAt: string | null
  status: string
  operatingHours: number
  hubCode?: string
}

export interface HubPriceItemDTO {
  id: string
  brandSlug: string
  serviceType: string
  label: string
  price: number
  durationMin: number
  active: boolean
  updatedAt: string
}

export interface HubTireProductDTO {
  id: string
  ref: string
  brand: string
  model: string
  size: string
  season: string
  price: number
  stockHint: number
  active: boolean
}

export interface HubDiagnosticTemplateDTO {
  id: string
  brandSlug: string
  code: string
  name: string
  systems: { systeme: string; points: string[] }[]
  active: boolean
  updatedAt: string
}

export interface HubLoyaltyRuleDTO {
  id: string
  brandSlug: string
  action: string
  points: number
  rewardLabel: string
  rewardThreshold: number
  active: boolean
}

// ===== Libellés FR partagés =====
export const FORMAT_LABELS: Record<string, string> = {
  STATION: "Station classique",
  MICRO_HUB_EXPRESS: "Micro-station express",
  MOBILITY_HUB: "Mobility Hub",
}
export const FORMAT_HINTS: Record<string, string> = {
  STATION: "Carburant + boutique + services rapides — investissement ~2,8 M DT",
  MICRO_HUB_EXPRESS: "Vidange express + pneus + diagnostic — investissement ~480 k DT",
  MOBILITY_HUB: "Micro-hub franchisé complet (TMP) — investissement ~890 k DT",
}
export const ZONE_STATUS_LABELS: Record<string, string> = {
  IDENTIFIEE: "Identifiée",
  QUALIFIEE: "Qualifiée",
  ETUDE: "En étude",
  SIGNEE: "Signée",
  EQUIPEE: "Équipée",
}
export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  NOUVEAU: "Nouveau",
  CONTACTE: "Contacté",
  EN_NEGOCIATION: "En négociation",
  SIGNE: "Signé",
  REFUSE: "Refusé",
}
export const HUB_STATUS_LABELS: Record<string, string> = {
  EN_CONSTRUCTION: "En construction",
  PILOTE: "Pilote",
  OPERATIONNEL: "Opérationnel",
  SUSPENDU: "Suspendu",
}
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  VIDANGE: "Vidange express",
  PNEUS_VENTE: "Vente pneus",
  PNEUS_MONTAGE: "Montage pneus",
  DIAGNOSTIC: "Diagnostic électronique",
}
export const PRICE_SERVICE_LABELS: Record<string, string> = {
  VIDANGE_STANDARD: "Vidange standard",
  VIDANGE_PREMIUM: "Vidange premium",
  PNEUS_MONTAGE: "Montage pneus",
  EQUILIBRAGE: "Équilibrage",
  DIAGNOSTIC_COMPLET: "Diagnostic complet",
  DIAGNOSTIC_EXPRESS: "Diagnostic express",
}
export const LOYALTY_ACTION_LABELS: Record<string, string> = {
  VIDANGE: "Chaque vidange",
  DIAGNOSTIC: "Chaque diagnostic",
  PNEUS: "Chaque achat de pneus",
  CONVERSION: "Chaque conversion vers station",
}
export const TIER_LABELS: Record<string, string> = {
  BRONZE: "Bronze",
  ARGENT: "Argent",
  OR: "Or",
  PLATINE: "Platine",
}
export const CONV_STATUS_LABELS: Record<string, string> = {
  PROPOSEE: "Proposée",
  CONFIRMEE: "Confirmée",
  PERDUE: "Perdue",
}
export const KIT_CATEGORY_LABELS: Record<string, string> = {
  ENSEIGNE: "Enseigne",
  FORMATION: "Formation",
  LOGICIEL: "Logiciel",
  EQUIPEMENT: "Équipement",
  SUPPORT: "Support",
}
export const STOCK_CATEGORY_LABELS: Record<string, string> = {
  PIECE: "Pièce",
  CONSOMMABLE: "Consommable",
  PNEU: "Pneu",
}
export const TIRE_SEASON_LABELS: Record<string, string> = {
  ETE: "Été",
  HIVER: "Hiver",
  TOUTES_SAISONS: "Toutes saisons",
}
export const DISPO_LABELS: Record<string, string> = {
  FORTE: "Forte",
  MOYENNE: "Moyenne",
  FAIBLE: "Faible",
}
export const SCENARIO_LABELS: Record<string, string> = {
  PESSIMISTE: "Pessimiste",
  REALISTE: "Réaliste",
  OPTIMISTE: "Optimiste",
}
