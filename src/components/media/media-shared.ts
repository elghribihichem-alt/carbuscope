// CarbuScope — T57 — Media Planner : types, méta et helpers partagés entre
// les vues du module (inventaire P1 + estimateur de campagne). 100 % FR,
// palette émeraude/ambre/terracotta + zinc — AUCUN bleu/indigo.

import type { LucideIcon } from "lucide-react"
import {
  Signpost, Bus, Cone, Landmark, Monitor, ScreenShare, Store,
  Droplets, Fuel, LayoutGrid, type LucideIcon as Icon,
} from "lucide-react"

// ---------------------------------------------------------------------------
// DTO (miroir de la sérialisation complète de /api/media/panels — exigence
// « toutes les données attributaires possibles »)
// ---------------------------------------------------------------------------
export interface MediaPanelDTO {
  id: string
  code: string
  name: string
  supportType: string
  format: string
  surfaceM2: number
  orientation: string
  eclairage: string
  reseau: string // EXTERNE | PROPRIETAIRE
  brandSlug: string | null
  regie: string | null
  stationCode: string | null
  gouvernorat: string
  delegation: string
  ville: string | null
  axe: string
  lat: number
  lng: number
  face: string | null
  hauteurM: number
  environnement: string
  visibilite: number
  traficVehJ: number
  fluxPietonsJ: number
  contactsJ: number
  coutMensuel: number
  statut: string
  etat: string
  dernierControle: string | null
  notes: string | null
  cpm: number | null
}

// ---------------------------------------------------------------------------
// Méta des 12 types de supports (« tous types d'affichage et modes »)
// ---------------------------------------------------------------------------
export interface SupportMeta {
  label: string
  famille: "GRAND_FORMAT" | "MOBILIER" | "DIGITAL" | "ENSEIGNE" | "PROPRIETAIRE"
  icon: Icon
  /** Couleur chaude (jamais bleue) — repère carte + légende + badges. */
  color: string
}

export const SUPPORT_META: Readonly<Record<string, SupportMeta>> = {
  PANNEAU_4X3: { label: "Panneau 4×3", famille: "GRAND_FORMAT", icon: Signpost, color: "#c2410c" },
  PANNEAU_8M2: { label: "Panneau 8 m²", famille: "GRAND_FORMAT", icon: Signpost, color: "#9a3412" },
  MURAL: { label: "Panneau mural", famille: "GRAND_FORMAT", icon: Landmark, color: "#7c2d12" },
  ABRI_BUS: { label: "Abribus", famille: "MOBILIER", icon: Bus, color: "#a16207" },
  BORNE: { label: "Borne", famille: "MOBILIER", icon: Cone, color: "#b45309" },
  PRE_ENSEIGNE: { label: "Pré-enseigne", famille: "ENSEIGNE", icon: LayoutGrid, color: "#57534e" },
  TOTEM_DIGITAL: { label: "Totem digital", famille: "DIGITAL", icon: Monitor, color: "#ea580c" },
  ECRAN_DOOH: { label: "Écran DOOH", famille: "DIGITAL", icon: ScreenShare, color: "#d97706" },
  TOTEM_STATION: { label: "Totem station", famille: "PROPRIETAIRE", icon: Fuel, color: "#047857" },
  ECRAN_POMPE: { label: "Écran pompe", famille: "PROPRIETAIRE", icon: Droplets, color: "#059669" },
  HABILLAGE_POMPE: { label: "Habillage pompe", famille: "PROPRIETAIRE", icon: Cone, color: "#065f46" },
  VITRINE_STATION: { label: "Vitrine station", famille: "PROPRIETAIRE", icon: Store, color: "#10b981" },
}

export const SUPPORT_META_DEFAULT: SupportMeta = {
  label: "Support", famille: "ENSEIGNE", icon: Signpost, color: "#78716c",
}

export function supportMeta(type: string): SupportMeta {
  return SUPPORT_META[type] ?? SUPPORT_META_DEFAULT
}

export function supportLabel(type: string): string {
  return supportMeta(type).label
}

// ---------------------------------------------------------------------------
// Statuts / états / listes fermées (libellés FR)
// ---------------------------------------------------------------------------
export const PANEL_STATUT_META: Readonly<Record<string, { label: string; tone: "emerald" | "amber" | "terra" | "zinc" }>> = {
  DISPONIBLE: { label: "Disponible", tone: "emerald" },
  RESERVE: { label: "Réservé", tone: "amber" },
  OCCUPE: { label: "Occupé", tone: "terra" },
  MAINTENANCE: { label: "Maintenance", tone: "zinc" },
}

export const PANEL_ETAT_META: Readonly<Record<string, { label: string }>> = {
  BON: { label: "Bon état" },
  MOYEN: { label: "Moyen" },
  A_RENOVER: { label: "À rénover" },
}

export const ORIENTATION_LABELS: Readonly<Record<string, string>> = {
  HORIZONTALE: "Horizontale",
  VERTICALE: "Verticale",
  DOUBLE_FACE: "Double face",
  TRIVISION: "Trivision",
  DEROULANT: "Déroulant",
}

export const ECLAIRAGE_LABELS: Readonly<Record<string, string>> = {
  AVANT: "Éclairage avant",
  RETRO: "Rétroprojeté",
  NON: "Non éclairé",
}

export const ENVIRONNEMENT_LABELS: Readonly<Record<string, string>> = {
  URBAIN: "Urbain",
  PERIURBAIN: "Périurbain",
  ROUTIER: "Routier",
  COMMERCIAL: "Commercial",
  STATION: "En station",
}

export const RESEAU_LABELS: Readonly<Record<string, string>> = {
  EXTERNE: "Référentiel externe",
  PROPRIETAIRE: "Média propriétaire",
}

// ---------------------------------------------------------------------------
// Populations INS 2024 des 24 gouvernorats (mêmes valeurs que le seed —
// socle du GRP estimé côté client, transparent et documenté)
// ---------------------------------------------------------------------------
export const GOV_POPULATION: Readonly<Record<string, number>> = {
  Tunis: 1119000, Ariana: 576000, "Ben Arous": 640000, Nabeul: 826000,
  Sfax: 955000, Sousse: 700000, Monastir: 425000, Mahdia: 412000,
  Bizerte: 385000, Kairouan: 400000, Zaghouan: 193000, Béja: 285000,
  Jendouba: 265000, "Le Kef": 262000, Siliana: 234000, "Sidi Bouzid": 470000,
  Kasserine: 480000, Gabès: 375000, Médenine: 415000, Tataouine: 150000,
  Gafsa: 350000, Tozeur: 110000, Kébili: 160000, Manouba: 380000,
}

// ---------------------------------------------------------------------------
// Helpers numéraires FR (miroir de shadow-shared, module autonome)
// ---------------------------------------------------------------------------
export function formatTnd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M DT`
  if (abs >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} K DT`
  return `${Math.round(n).toLocaleString("fr-FR")} DT`
}

/** Nombre entier FR (contacts, trafic). */
export function formatNum(n: number): string {
  return Math.round(n).toLocaleString("fr-FR")
}

/** Date « 2 oct. 2026 » — compacte, FR. */
export function formatDateFr(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

// ---------------------------------------------------------------------------
// Moteur d'estimation P1 (EXTRAIT du § 3.2 de docs/media-planner-proposition.md
// — formules volontairement simples, transparentes, affichées à l'utilisateur)
// ---------------------------------------------------------------------------
export const WEEKS_PER_MONTH = 4.345

/** Facteurs de période (pics tunisiens — affichés et choisissables). */
export const PERIODE_FACTEURS: ReadonlyArray<{ id: string; label: string; facteur: number; hint: string }> = [
  { id: "normale", label: "Période normale", facteur: 1, hint: "Base annuelle" },
  { id: "ramadan", label: "Ramadan", facteur: 1.25, hint: "+25 % de trafic vespéral (retrouvailles, sorties nocturnes)" },
  { id: "ete", label: "Été", facteur: 1.15, hint: "+15 % sur les axes balnéaires et littoraux" },
  { id: "rentree", label: "Rentrée", facteur: 1.1, hint: "+10 % trafic urbain (écoles, entreprises)" },
]

export interface CampaignEstimation {
  /** Budget total (DT) : Σ coût mensuel / 4,345 × semaines. */
  budget: number
  /** Contacts bruts de la campagne. */
  contactsBruts: number
  /** Portée nette : contacts × (1 − 0,18 × part de doublons). */
  porteeNette: number
  /** Fréquence moyenne = bruts / nette. */
  frequence: number
  /** GRP = portée nette / population couverte × 100. */
  grp: number
  /** CPM campagne (DT / 1 000 contacts). */
  cpm: number
  /** Part du budget sur le média propriétaire (l'argument « d'abord »). */
  partProprietaireBudget: number
  partProprietaireContacts: number
}

export function estimateCampaign(
  panels: MediaPanelDTO[],
  semaines: number,
  facteurPeriode: number,
): CampaignEstimation {
  const budgetMensuel = panels.reduce((s, p) => s + p.coutMensuel, 0)
  const contactsJour = panels.reduce((s, p) => s + p.contactsJ, 0)
  const budget = budgetMensuel / WEEKS_PER_MONTH * semaines
  const contactsBruts = contactsJour * 7 * semaines * facteurPeriode
  // Doublons inter-supports : 0 support → 0 ; dès 5+, plafond 18 % de perte.
  const doublons = panels.length <= 1 ? 0 : 0.18 * Math.min(1, (panels.length - 1) / 4)
  const porteeNette = contactsBruts * (1 - doublons)
  const popCouverte = new Set(panels.map(p => p.gouvernorat))
  const population = [...popCouverte].reduce((s, g) => s + (GOV_POPULATION[g] ?? 0), 0)
  const grp = population > 0 ? (porteeNette / population) * 100 : 0
  const cpm = contactsBruts > 0 ? budget / (contactsBruts / 1000) : 0
  const prop = panels.filter(p => p.reseau === "PROPRIETAIRE")
  const propBudget = prop.reduce((s, p) => s + p.coutMensuel, 0)
  const propContacts = prop.reduce((s, p) => s + p.contactsJ, 0)
  return {
    budget,
    contactsBruts,
    porteeNette,
    frequence: porteeNette > 0 ? contactsBruts / porteeNette : 0,
    grp,
    cpm,
    partProprietaireBudget: budgetMensuel > 0 ? propBudget / budgetMensuel : 0,
    partProprietaireContacts: contactsJour > 0 ? propContacts / contactsJour : 0,
  }
}

/** Export CSV de la sélection (pattern downloadPointsCsv — shadow-osm-tab). */
export function downloadPanelsCsv(panels: MediaPanelDTO[]): void {
  const HEAD = [
    "Code", "Nom", "Type", "Format", "Réseau", "Régie", "Gouvernorat", "Délégation",
    "Lieu/axe", "Latitude", "Longitude", "Environnement", "Orientation", "Éclairage",
    "Face", "Hauteur (m)", "Surface (m²)", "Visibilité /100", "Trafic véh./j",
    "Piétons/j", "Contacts/j", "CPM (DT)", "Coût mensuel (DT)", "Statut", "État",
    "Dernier contrôle", "Notes",
  ]
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = [HEAD.join(";")]
  for (const p of panels) {
    lines.push([
      p.code, p.name, supportLabel(p.supportType), p.format, p.reseau, p.regie,
      p.gouvernorat, p.delegation, p.axe, p.lat.toFixed(5), p.lng.toFixed(5),
      ENVIRONNEMENT_LABELS[p.environnement] ?? p.environnement,
      ORIENTATION_LABELS[p.orientation] ?? p.orientation,
      ECLAIRAGE_LABELS[p.eclairage] ?? p.eclairage,
      p.face ?? "", p.hauteurM, p.surfaceM2, p.visibilite, p.traficVehJ,
      p.fluxPietonsJ, p.contactsJ, p.cpm ?? "", p.coutMensuel,
      PANEL_STATUT_META[p.statut]?.label ?? p.statut,
      PANEL_ETAT_META[p.etat]?.label ?? p.etat,
      p.dernierControle ? formatDateFr(p.dernierControle) : "",
      p.notes ?? "",
    ].map(esc).join(";"))
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `media-planner-selection-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
