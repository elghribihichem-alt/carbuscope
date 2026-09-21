// Super Administration — types partagés (client-safe) : DTOs sérialisés,
// formatage monétaire (millimes → DT), libellés et pastilles de statut.
// Convention : tous les montants circulent en MILLIMES (1 DT = 1 000).
import type { ReactNode } from "react"

// ---------------------------------------------------------------- formats

const nf0 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const nf3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/** 6 000 000 millimes → « 6 000,000 DT » (format facture) */
export function formatDT(millimes: number): string {
  return `${nf3.format(millimes / 1000)} DT`
}
/** 6 000 000 millimes → « 6 000 DT » (KPI, condensé) */
export function formatDTCourt(millimes: number): string {
  return `${nf0.format(Math.round(millimes / 1000))} DT`
}
/** 24560 DT → « 24 560 DT » depuis un montant déjà en dinars */
export function formatDTNombre(dinars: number): string {
  return `${nf0.format(dinars)} DT`
}
export function formatInt(n: number): string {
  return nf0.format(n)
}
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("fr-FR", opts).format(new Date(iso))
}
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}
export function formatMois(moisConcerne: string): string {
  const [y, m] = moisConcerne.split("-").map(Number)
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1))
}
export function joursEntre(iso: string, ref: Date = new Date()): number {
  return Math.round((new Date(iso).getTime() - ref.getTime()) / 86400000)
}

// ---------------------------------------------------------------- DTOs

export interface AvenantDTO {
  id: string
  numero: string
  objet: string
  contenu: string
  dateEffet: string
  statut: string
  createdAt: string
}

export interface UsageDTO {
  missions: number
  rapports: number
  notifications: number
  avisRepondes: number
  controlesConformite: number | null
}

export interface ContratDTO {
  id: string
  numero: string
  brandSlug: string | null
  nomClient: string
  contactNom: string
  contactRole: string
  contactEmail: string
  contactTel: string
  statut: string
  dateSignature: string | null
  dateDebut: string | null
  dateFin: string | null
  fraisAdhesionMillimes: number
  adhesionPayee: boolean
  periodiciteDefaut: string
  conditions: string
  notes: string
  createdAt: string
  updatedAt: string
  // Enrichissements (liste & fiche)
  avenants: AvenantDTO[]
  stationsSouscrites: number
  stationsReseau: number
  abonnementsMensuels: number
  abonnementsAnnuels: number
  mrrMillimes: number
  facturesTotal: number
  facturesPayees: number
  facturesEnRetard: number
  impayesTtcMillimes: number
  comptesActifs: number
  usage: UsageDTO
  joursAvantEcheance: number | null
}

export interface ClientListResponse {
  clients: ContratDTO[]
}

export interface Fiche360Response {
  client: ContratDTO
  factures: FactureDTO[]
  abonnements: AbonnementDTO[]
  comptes: CompteDTO[]
  audit: AuditLogDTO[]
}

export interface AbonnementDTO {
  id: string
  brandSlug: string
  stationCode: string
  stationNom: string
  periodicite: string
  prixMillimes: number
  dateDebut: string
  dateFin: string | null
  statut: string
}

export interface FactureLigneDTO {
  id: string
  libelle: string
  quantite: number
  prixUnitaireMillimes: number
  montantHtMillimes: number
  ordre: number
}

export interface FactureDTO {
  id: string
  numero: string
  brandSlug: string
  moisConcerne: string
  dateEmission: string
  dateEcheance: string
  statut: string
  montantHtMillimes: number
  montantTvaMillimes: number
  montantTtcMillimes: number
  datePaiement: string | null
  modePaiement: string | null
  notes: string
  lignes: FactureLigneDTO[]
  lignesCount?: number
  clientNom?: string
}

export interface CompteDTO {
  id: string
  email: string
  name: string
  role: string
  brandSlug: string | null
  brandName: string | null
  active: boolean
  totpEnabled: boolean
  createdAt: string
}

export interface AuditLogDTO {
  id: string
  acteurNom: string
  acteurEmail: string
  acteurRole: string
  module: string
  action: string
  cibleType: string
  cibleLabel: string
  details: string
  severite: string
  ip: string
  createdAt: string
}

export interface ParametreDTO {
  cle: string
  valeur: string
  type: string
  categorie: string
  libelle: string
  description: string
  modifiable: boolean
  updatedAt: string
}

export interface CleApiDTO {
  id: string
  label: string
  prefixe: string
  cleMasquee: string
  brandSlug: string | null
  scopes: string
  active: boolean
  derniereUtilisation: string | null
  nbAppels: number
  createdAt: string
}

export interface SauvegardeDTO {
  id: string
  nomFichier: string
  type: string
  statut: string
  tailleKo: number
  nbTables: number
  dureeMs: number
  note: string
  createdAt: string
}

export interface JobDTO {
  id: string
  code: string
  nom: string
  description: string
  periodicite: string
  actif: boolean
  dernierRun: string | null
  statutDernierRun: string
  dureeDernierRunMs: number
  resultat: string
}

export interface AnnonceDTO {
  id: string
  titre: string
  corps: string
  audience: string
  severite: string
  dateDebut: string
  dateFin: string | null
  active: boolean
  dissmissible: boolean
  auteur: string
  createdAt: string
}

export interface TicketMessageDTO {
  id: string
  auteur: string
  estStaff: boolean
  contenu: string
  createdAt: string
}

export interface TicketDTO {
  id: string
  numero: string
  brandSlug: string
  demandeur: string
  sujet: string
  priorite: string
  statut: string
  assigneA: string | null
  createdAt: string
  updatedAt: string
  messagesCount: number
  dernierMessage: TicketMessageDTO | null
  messages?: TicketMessageDTO[]
}

export interface IncidentDTO {
  id: string
  titre: string
  composant: string
  severite: string
  statut: string
  debut: string
  fin: string | null
  impact: string
  description: string
  resolution: string
}

// ---------------------------------------------------------------- supervision

export interface TableSanteDTO {
  table: string
  lignes: number
  latenceMs: number
}

export interface EndpointSanteDTO {
  chemin: string
  statut: "OK" | "LENT" | "ERREUR"
  latenceMs: number
}

export interface SupervisionResponse {
  base: {
    fichier: string
    tailleKo: number
    nbTables: number
    totalLignes: number
    tables: TableSanteDTO[]
    latenceMs: number
    integrityOk: boolean
  }
  api: { endpoints: EndpointSanteDTO[]; ok: number; total: number }
  jobs: JobDTO[]
  sauvegardes: SauvegardeDTO[]
  incidents: IncidentDTO[]
  maintenance: { mode: boolean; message: string }
  charge: { missionsEnCours: number; signalementsEnAttente: number; alertesCritiques: number }
}

// ---------------------------------------------------------------- analytics

export interface SerieMoisDTO {
  mois: string // 2026-05
  encaisseMillimes: number // factures payées (TTC)
  factureMillimes: number // payées + émises (TTC)
  mrrMillimes: number // MRR de fin de mois (abonnements actifs)
}

export interface RevenuClientDTO {
  brandSlug: string
  nomClient: string
  mrrMillimes: number
  partPct: number
  encaisse12mTtcMillimes: number
  facturesEnRetard: number
}

export interface UsageModuleDTO {
  module: string
  libelle: string
  unite: string
  valeur: number
  tendance: "hausse" | "stable" | "baisse"
}

export interface AnalyticsResponse {
  kpis: {
    mrrMillimes: number
    arrMillimes: number
    clientsActifs: number
    prospects: number
    churnPct: number
    tauxRetentionPct: number
    arpeMillimes: number
    stationsSouscrites: number
    encaisseMoisTtcMillimes: number
    enAttenteTtcMillimes: number
    enRetardTtcMillimes: number
    croissanceMrrPct: number | null
  }
  serie: SerieMoisDTO[]
  revenusParClient: RevenuClientDTO[]
  usageModules: UsageModuleDTO[]
  cohortes: { libelle: string; nb: number; mrrMillimes: number }[]
}

// ---------------------------------------------------------------- libellés & pastilles

export type Pastille = { label: string; className: string; point?: string }

export const CONTRAT_STATUT_META: Record<string, Pastille> = {
  PROSPECT: { label: "Prospect", className: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300", point: "bg-slate-400" },
  ESSAI: { label: "Essai", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400", point: "bg-amber-500" },
  ACTIF: { label: "Actif", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", point: "bg-emerald-500" },
  SUSPENDU: { label: "Suspendu", className: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400", point: "bg-orange-500" },
  RESILIE: { label: "Résilié", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400", point: "bg-red-500" },
}

export const FACTURE_STATUT_META: Record<string, Pastille> = {
  BROUILLON: { label: "Brouillon", className: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" },
  EMISE: { label: "Émise", className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400" },
  PAYEE: { label: "Payée", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  EN_RETARD: { label: "En retard", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
  ANNULEE: { label: "Annulée", className: "border-slate-300 bg-slate-100 text-slate-500 line-through dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500" },
}

export const MODE_PAIEMENT_META: Record<string, string> = {
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  ESPECES: "Espèces",
}

export const TICKET_STATUT_META: Record<string, Pastille> = {
  OUVERT: { label: "Ouvert", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
  EN_COURS: { label: "En cours", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  EN_ATTENTE_CLIENT: { label: "Attente client", className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400" },
  RESOLU: { label: "Résolu", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  FERME: { label: "Fermé", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
}

export const PRIORITE_META: Record<string, Pastille> = {
  BASSE: { label: "Basse", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  NORMALE: { label: "Normale", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  HAUTE: { label: "Haute", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  URGENTE: { label: "Urgente", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

export const INCIDENT_STATUT_META: Record<string, Pastille> = {
  EN_COURS: { label: "En cours", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
  SURVEILLE: { label: "Surveillé", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  RESOLU: { label: "Résolu", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
}

export const SEVERITE_META: Record<string, Pastille> = {
  NORMALE: { label: "Normale", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  SENSIBLE: { label: "Sensible", className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400" },
  CRITIQUE: { label: "Critique", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
  INFO: { label: "Info", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  ATTENTION: { label: "Attention", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  MINEUR: { label: "Mineur", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  MAJEUR: { label: "Majeur", className: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400" },
}

export const JOB_STATUT_META: Record<string, Pastille> = {
  OK: { label: "OK", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  ERREUR: { label: "Erreur", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
  JAMAIS: { label: "Jamais exécuté", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
}

export const AUDIENCE_META: Record<string, string> = {
  TOUTES: "Tous les espaces",
  ENSEIGNES: "Enseignes (B2B + portail)",
  B2C: "Application mobile B2C",
  B2B: "Observatoire B2B",
}

export const MODULE_META: Record<string, string> = {
  CLIENTS: "Clients & contrats",
  FACTURATION: "Facturation",
  COMPTES: "Comptes",
  CONFIG: "Configuration",
  SUPERVISION: "Supervision",
  SUPPORT: "Support",
  SECURITE: "Sécurité",
  AGENT_IA: "Agent IA",
}

export const PERIODICITE_META: Record<string, { label: string; classe: string }> = {
  MENSUEL: { label: "Mensuel", classe: "text-emerald-700 dark:text-emerald-400" },
  ANNUEL: { label: "Annuel", classe: "text-violet-700 dark:text-violet-400" },
}

export const SA_ROLE_META: Record<string, string> = {
  SUPER_ADMIN: "Super Administrateur",
  ADMIN: "Administrateur",
  NETWORK: "Direction Réseau",
  COMMERCIAL: "Direction Commerciale",
  EXPANSION: "Direction Expansion",
  VIEWER: "Observateur",
}

export function pastille(meta: Record<string, Pastille>, key: string): Pastille {
  return meta[key] ?? { label: key, className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" }
}

/** Badges compacts de module d'audit (teintes SA — aucun bleu/indigo).
 *  Mêmes classes que le MODULE_BADGE local historique de sa-comptes.tsx,
 *  exposé ici pour tous les consommateurs — AGENT_IA (E-1) en violet. */
export const MODULE_BADGE: Record<string, string> = {
  CLIENTS: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  FACTURATION: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  COMPTES: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400",
  CONFIG: "border-yellow-400/70 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  SUPERVISION: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  SUPPORT: "border-lime-300 bg-lime-50 text-lime-700 dark:border-lime-800 dark:bg-lime-950 dark:text-lime-400",
  SECURITE: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  AGENT_IA: "border-violet-400/70 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400",
}

export type AuditModule = "CLIENTS" | "FACTURATION" | "COMPTES" | "CONFIG" | "SUPERVISION" | "SUPPORT" | "SECURITE" | "AGENT_IA"

export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: string }

/** Petit composant badge-clé générique utilisé par les modules SA. */
export interface Kv { k: string; v: ReactNode }
