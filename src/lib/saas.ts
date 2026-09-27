// CarbuScope — Types & helpers partagés du module Super Administration (T33)
// (aucune dépendance serveur : utilisable côté client)

export type SaaSPlan = "ESSENTIEL" | "PRO" | "ENTERPRISE"
export type SaaSContractStatus = "ESSAI" | "ACTIF" | "SUSPENDU" | "RESILIE"
export type SaaSInvoiceStatus = "PAYEE" | "IMPAYEE" | "RETARD"

export const PLAN_LABELS: Record<string, string> = {
  ESSENTIEL: "Essentiel",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
}

export const CONTRACT_STATUS_META: Record<string, { label: string; className: string }> = {
  ESSAI: { label: "Essai", className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  ACTIF: { label: "Actif", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  SUSPENDU: { label: "Suspendu", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  RESILIE: { label: "Résilié", className: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
}

export const INVOICE_STATUS_META: Record<string, { label: string; className: string }> = {
  PAYEE: { label: "Payée", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  IMPAYEE: { label: "Impayée", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  RETARD: { label: "En retard", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

// Statuts d'une tâche de l'agent IA interne (Phase 3 Super Admin).
export const AI_TASK_STATUS_META: Record<string, { label: string; className: string }> = {
  ENREGISTREE: { label: "Enregistrée", className: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  EN_COURS: { label: "En cours", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  TERMINEE: { label: "Terminée", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  ECHEC: { label: "Échec", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

export const AUDIT_KIND_META: Record<string, { label: string; className: string }> = {
  AUTH: { label: "Connexion", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  CONTRAT: { label: "Contrat", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  FACTURE: { label: "Facture", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  UTILISATEUR: { label: "Utilisateur", className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  IMPERSONATION: { label: "Prise de main", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  SYSTEME: { label: "Système", className: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
  AGENT_IA: { label: "Agent IA", className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400" },
  DEMOGRAPHIE: { label: "Démographie", className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
}

/** Statut effectif d'une facture : impayée + échéance dépassée ⇒ retard. */
export function effectiveInvoiceStatus(status: string, dueAtISO: string): SaaSInvoiceStatus {
  if (status === "PAYEE") return "PAYEE"
  return new Date(dueAtISO).getTime() < Date.now() ? "RETARD" : "IMPAYEE"
}

/** Format monétaire tunisien : 1 690,00 DT */
export function fmtDT(v: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} DT`
}

// ---- DTO sérialisés (ISO) ----

export interface SaasContractDTO {
  id: string
  brandSlug: string
  brandName: string
  color: string
  plan: string
  status: string
  startedAt: string
  renewsAt: string
  monthlyFee: number
  seats: number
  stationQuota: number
  contactName: string
  contactEmail: string
  contactPhone: string
  stationCount: number // stations réellement référencées
  invoiceCount: number
  totalBilled: number
  unpaidCount: number
  unpaidTotal: number
}

export interface SaasInvoiceDTO {
  id: string
  number: string
  contractId: string
  brandName: string
  brandSlug: string
  color: string
  issuedAt: string
  dueAt: string
  amount: number
  status: string
  paidAt: string | null
  // Relances d'échéance (T30)
  reminderCount: number
  lastReminderAt: string | null
}

export interface SaasUserDTO {
  id: string
  email: string
  name: string
  role: string
  brandSlug: string | null
  active: boolean
  lastLoginAt: string | null
  personaId: string | null // compte de démonstration associé (prise de main)
  totpEnabled: boolean // V7 : double authentification TOTP active sur ce compte
}

export interface SaasAuditDTO {
  id: string
  kind: string
  message: string
  actor: string
  brandSlug: string | null
  createdAt: string
}

export interface SaasPlanDTO {
  id: string
  code: string
  label: string
  monthlyFee: number
  seatsIncluded: number
  stationQuota: number
  features: string[] // features FR (séparées par « | » en base)
  sortOrder: number
  active: boolean
  // stats dérivées des contrats
  contractsCount: number // tous statuts confondus
  contractsActive: number // contrats ACTIF uniquement
  mrr: number // somme des tarifs des contrats ACTIF du plan (DT)
}

export interface SaasOverviewDTO {
  kpis: {
    activeContracts: number
    trials: number
    suspended: number
    mrr: number
    arr: number
    invoicesUnpaid: number
    unpaidTotal: number
    invoicesOverdue: number
    activeUsers: number
    stationsManaged: number
  }
  renewals: SaasContractDTO[]
  recentInvoices: SaasInvoiceDTO[]
  audit: SaasAuditDTO[]
}

// ---- Agent IA interne (Phase 3 Super Admin) ----

export interface AiTaskDTO {
  id: string
  title: string
  instruction: string
  status: string // ENREGISTREE | EN_COURS | TERMINEE | ECHEC
  result: string | null
  error: string | null
  launchedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** Membre du personnel d'une enseigne, avec activation de l'agent IA. */
export interface AiUserSettingDTO {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  enabled: boolean
}

/** Enseigne cliente avec activation de l'agent IA (le personnel suit). */
export interface AiBrandSettingDTO {
  brandSlug: string
  brandName: string
  color: string
  plan: string
  contractStatus: string
  enabled: boolean
  users: AiUserSettingDTO[]
}

// ---- Paramètre cartographique (Phase 3 Super Admin) ----

export interface CartoBoundaryDTO {
  id: string
  name: string
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  active: boolean
  updatedAt: string | null
  isDefault: boolean
}

/** Bornes par défaut de la zone de couverture (Tunisie entière). */
export const CARTO_DEFAULTS = {
  minLat: 30.2,
  maxLat: 37.4,
  minLng: 7.5,
  maxLng: 11.6,
  name: "Zone de couverture — Tunisie",
} as const

// ---- Module Démographie (Phase 4 Super Admin, T35) ----

/** Catégories du parc automobile (classification tunisienne usuelle, sans
 *  notion de motorisation — chiffres à alimenter par délégation). */
export const VEHICLE_CATEGORIES: { key: string; label: string; short: string }[] = [
  { key: "vehiclesLight", label: "Voitures légères", short: "Véh. légères" },
  { key: "vehiclesUtility", label: "Utilitaires & pick-up", short: "Utilitaires" },
  { key: "vehiclesHeavy", label: "Poids lourds", short: "Poids lourds" },
  { key: "vehiclesBuses", label: "Autocars & bus", short: "Autocars" },
  { key: "vehiclesMotorcycles", label: "Deux-roues motorisés", short: "Deux-roues" },
]

/** Référence INS 2024 d'un gouvernorat — éditable en ligne depuis le volet
 *  « Gouvernorats » (T37) : population, H/F, superficie, urbain/rural et
 *  colonnes historiques (véhicules, motorisation, âge du parc). */
export interface DemographicGouvernoratDTO {
  id: string
  name: string
  isoCode: string | null
  population: number
  menPct: number | null
  womenPct: number | null
  areaKm2: number | null
  urbanPct: number | null
  ruralPct: number | null
  estimated: boolean
  delegationCount: number
  vehicles: number
  motorizationRate: number
  avgFleetAge: number
  updatedAt: string | null
  updatedBy: string | null
}

/** Ligne éditable : une délégation du tableau démographique. */
export interface DemographicDelegationDTO {
  id: string
  gouvernorat: string
  isoCode: string
  delegation: string
  population: number | null
  urbanPct: number | null
  ruralPct: number | null
  vehiclesLight: number | null
  vehiclesUtility: number | null
  vehiclesHeavy: number | null
  vehiclesBuses: number | null
  vehiclesMotorcycles: number | null
  updatedAt: string | null
  updatedBy: string | null
}

// ---- Module Démographie (T45) : niveau « cité » du découpage administratif
// (gouvernorat → délégation → cité) — population et parc automobile par cité,
// alimentés en masse par la Super Administration (import scope « cites »).

/** Ligne éditable (Super Admin uniquement) : une cité. */
export interface DemographicCiteDTO {
  id: string
  gouvernorat: string
  delegation: string
  cite: string
  population: number | null
  urbanPct: number | null
  vehiclesLight: number | null
  vehiclesUtility: number | null
  vehiclesHeavy: number | null
  vehiclesBuses: number | null
  vehiclesMotorcycles: number | null
  source: string
  updatedAt: string | null
  updatedBy: string | null
}

// ---- Module Démographie (T37, volet « Paramétrage ») : visibilité par
// utilisateur — accès accordé depuis la Super Administration, effet dans
// l'Observatoire B2B de l'utilisateur (onglet « Démographie »).

export type DemographicAccessLevel = "GOUVERNORATS" | "DELEGATIONS" | "CITES"

export interface DemographicAccessDTO {
  userId: string
  email: string
  name: string
  brandSlug: string | null
  level: DemographicAccessLevel
  canEdit: boolean
  updatedAt: string | null
  updatedBy: string | null
}

/** Niveaux de visibilité du module (libellés FR du volet Paramétrage). */
export const DEMOGRAPHIC_LEVELS: { value: DemographicAccessLevel; label: string; hint: string }[] = [
  { value: "GOUVERNORATS", label: "Gouvernorats", hint: "Vue des 24 gouvernorats (lecture des délégations masquée)" },
  { value: "DELEGATIONS", label: "Gouvernorats + délégations", hint: "Vue complète : gouvernorats et 277 délégations" },
  { value: "CITES", label: "Gouvernorats + délégations + cités", hint: "Vue complète : gouvernorats, délégations et cités (3ᵉ niveau)" },
]
