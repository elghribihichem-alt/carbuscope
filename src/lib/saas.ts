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

export const AUDIT_KIND_META: Record<string, { label: string; className: string }> = {
  AUTH: { label: "Connexion", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  CONTRAT: { label: "Contrat", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  FACTURE: { label: "Facture", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  UTILISATEUR: { label: "Utilisateur", className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  IMPERSONATION: { label: "Prise de main", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  SYSTEME: { label: "Système", className: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
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
}

export interface SaasAuditDTO {
  id: string
  kind: string
  message: string
  actor: string
  brandSlug: string | null
  createdAt: string
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
