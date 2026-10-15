// CarbuScope — T58 — Module « Publicité » : types, méta et helpers partagés
// entre les vues (Listing des supports / Simulateur publicitaire / Rapports).
// Supports publicitaires des RÉGIES EXTERNES (ce qui existe sur le terrain,
// par mode : Cartographie / RFR / Metro / Urbain). 100 % FR, palette chaude
// émeraude/ambre/terracotta + zinc — AUCUN bleu/indigo.
//
// Miroir de la sérialisation complète de /api/pub/supports (exigence
// « toutes les données attributaires possibles » du listing) et des
// snapshots de /api/pub/campaigns (volet Rapports).

import {
  Map as MapIcon, TrainFront, TramFront, Building2, Signpost, Landmark,
  LayoutGrid, Monitor, ScreenShare, Frame, Tv, Image as ImageIcon, Ticket,
  Bus, Cone, Store,
  type LucideIcon,
} from "lucide-react"

// ---------------------------------------------------------------------------
// DTO supports (miroir /api/pub/supports — 27 champs + CPM dérivé)
// ---------------------------------------------------------------------------
export interface PubSupportDTO {
  id: string
  code: string
  mode: string // CARTOGRAPHIE | RFR | METRO | URBAIN
  name: string
  supportType: string
  format: string
  surfaceM2: number
  orientation: string
  eclairage: string
  regie: string
  gouvernorat: string
  delegation: string
  lieu: string
  lat: number
  lng: number
  environnement: string
  visibilite: number
  traficVehJ: number
  fluxPietonsJ: number
  contactsJ: number
  coutMensuel: number
  dureeMinMois: number
  statut: string
  etat: string
  dernierControle: string | null
  notes: string | null
  cpm: number | null
}

// ---------------------------------------------------------------------------
// Les 4 MODES du listing (onglets « Cartographie - RFR - Metro - Urbain »)
// ---------------------------------------------------------------------------
export interface PubModeMeta {
  label: string
  description: string
  icon: LucideIcon
  /** Couleur d'accent du mode (chaude, jamais bleue). */
  color: string
}

export const PUB_MODES: ReadonlyArray<string> = ["CARTOGRAPHIE", "RFR", "METRO", "URBAIN"]

export const PUB_MODE_META: Readonly<Record<string, PubModeMeta>> = {
  CARTOGRAPHIE: {
    label: "Cartographie",
    description: "Grands formats géolocalisés sur les axes routiers (RN, autoroutes, boulevards) — panneaux, muraux, totems digitaux, écrans DOOH.",
    icon: MapIcon,
    color: "#d97706",
  },
  RFR: {
    label: "RFR",
    description: "Réseau ferré rapide : habillages de quais et de rames, écrans et vitrines des gares de la banlieue tunisoise — flux captif quotidien.",
    icon: TrainFront,
    color: "#c2410c",
  },
  METRO: {
    label: "Metro",
    description: "Métro léger du Grand Tunis : habillages de quais, écrans embarqués, vitrines et tourniquets des stations à fort trafic.",
    icon: TramFront,
    color: "#047857",
  },
  URBAIN: {
    label: "Urbain",
    description: "Mobilier urbain : abribus, colonnes, bornes et panneaux sucursals des artères commerçantes des grandes villes.",
    icon: Building2,
    color: "#a16207",
  },
}

export function pubModeMeta(mode: string): PubModeMeta {
  return PUB_MODE_META[mode] ?? {
    label: mode, description: "", icon: MapIcon, color: "#78716c",
  }
}

// ---------------------------------------------------------------------------
// Types de supports par mode (couleur chaude + icône — repère carte/légende)
// ---------------------------------------------------------------------------
export interface PubSupportMeta {
  label: string
  icon: LucideIcon
  color: string
}

export const PUB_SUPPORT_META: Readonly<Record<string, PubSupportMeta>> = {
  // Cartographie
  PANNEAU_4X3: { label: "Panneau 4×3", icon: Signpost, color: "#c2410c" },
  PANNEAU_8M2: { label: "Panneau 8 m²", icon: Signpost, color: "#9a3412" },
  MURAL: { label: "Panneau mural", icon: Landmark, color: "#7c2d12" },
  PRE_ENSEIGNE: { label: "Pré-enseigne", icon: LayoutGrid, color: "#57534e" },
  TOTEM_DIGITAL: { label: "Totem digital", icon: Monitor, color: "#ea580c" },
  ECRAN_DOOH: { label: "Écran DOOH", icon: ScreenShare, color: "#d97706" },
  // Transport (METRO / RFR)
  HABILLAGE_QUAI: { label: "Habillage quai", icon: Frame, color: "#b45309" },
  ECRAN_QUAI: { label: "Écran quai", icon: Monitor, color: "#d97706" },
  HABILLAGE_TRAIN: { label: "Habillage rame", icon: Tv, color: "#92400e" },
  ECRAN_TRAIN: { label: "Écran embarqué", icon: ScreenShare, color: "#f59e0b" },
  VITRINE_GARE: { label: "Vitrine gare", icon: ImageIcon, color: "#a16207" },
  CAISSE: { label: "Habillage tourniquet", icon: Ticket, color: "#78716c" },
  // Mobilier urbain
  ABRI_BUS: { label: "Abribus", icon: Bus, color: "#a16207" },
  COLONNE: { label: "Colonne", icon: Cone, color: "#b45309" },
  BORNE: { label: "Borne", icon: Cone, color: "#92400e" },
  PANNEAU_SUCCURSALE: { label: "Panneau sucursal", icon: Store, color: "#78716c" },
  ECRAN_MOBILIER: { label: "Écran mobilier", icon: Monitor, color: "#d97706" },
}

export const PUB_SUPPORT_META_DEFAULT: PubSupportMeta = {
  label: "Support", icon: Signpost, color: "#78716c",
}

export function pubSupportMeta(type: string): PubSupportMeta {
  return PUB_SUPPORT_META[type] ?? PUB_SUPPORT_META_DEFAULT
}

export function pubSupportLabel(type: string): string {
  return pubSupportMeta(type).label
}

// ---------------------------------------------------------------------------
// Listes fermées (libellés FR)
// ---------------------------------------------------------------------------
export const PUB_STATUT_META: Readonly<Record<string, { label: string }>> = {
  DISPONIBLE: { label: "Disponible" },
  RESERVE: { label: "Réservé" },
  OCCUPE: { label: "Occupé" },
  MAINTENANCE: { label: "Maintenance" },
}

export const PUB_ETAT_META: Readonly<Record<string, { label: string }>> = {
  BON: { label: "Bon état" },
  MOYEN: { label: "Moyen" },
  A_RENOVER: { label: "À rénover" },
}

export const PUB_ORIENTATION_LABELS: Readonly<Record<string, string>> = {
  HORIZONTALE: "Horizontale",
  VERTICALE: "Verticale",
  DOUBLE_FACE: "Double face",
  TRIVISION: "Trivision",
}

export const PUB_ECLAIRAGE_LABELS: Readonly<Record<string, string>> = {
  AVANT: "Éclairage avant",
  RETRO: "Rétroprojeté",
  NON: "Non éclairé",
}

export const PUB_ENVIRONNEMENT_LABELS: Readonly<Record<string, string>> = {
  URBAIN: "Urbain",
  PERIURBAIN: "Périurbain",
  ROUTIER: "Routier",
  COMMERCIAL: "Commercial",
  TRANSPORT: "Réseau de transport",
}

// ---------------------------------------------------------------------------
// Objectifs & périodes (simulateur — miroir serveur /api/pub/campaigns)
// ---------------------------------------------------------------------------
export const PUB_OBJECTIFS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: "NOTORIETE", label: "Notoriété enseigne", hint: "Maximiser la portée nette et la couverture géographique" },
  { id: "TRAFFIC_STATION", label: "Trafic en station", hint: "Viser les flux autour des stations et axes à forte proximité réseau" },
  { id: "PROMO_PRODUIT", label: "Promotion produit", hint: "Flux court et répétitif autour des points de vente" },
  { id: "LANCEMENT", label: "Lancement", hint: "Bourrage ponctuel et massif sur une zone ciblée" },
]

export const PUB_PERIODE_FACTEURS: ReadonlyArray<{ id: string; label: string; facteur: number; hint: string }> = [
  { id: "normale", label: "Période normale", facteur: 1, hint: "Base annuelle" },
  { id: "ramadan", label: "Ramadan", facteur: 1.25, hint: "+25 % de trafic vespéral (retrouvailles, sorties nocturnes)" },
  { id: "ete", label: "Été", facteur: 1.15, hint: "+15 % sur les axes balnéaires et littoraux" },
  { id: "rentree", label: "Rentrée", facteur: 1.1, hint: "+10 % trafic urbain (écoles, entreprises)" },
]

// ---------------------------------------------------------------------------
// Helpers numéraires FR (miroir media-shared, module autonome)
// ---------------------------------------------------------------------------
export function formatTnd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M DT`
  if (abs >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} K DT`
  return `${Math.round(n).toLocaleString("fr-FR")} DT`
}

export function formatNum(n: number): string {
  return Math.round(n).toLocaleString("fr-FR")
}

export function formatDateFr(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

// ---------------------------------------------------------------------------
// Populations INS 2024 (GRP estimé — mêmes valeurs que seed/API)
// ---------------------------------------------------------------------------
export const PUB_GOV_POPULATION: Readonly<Record<string, number>> = {
  Tunis: 1119000, Ariana: 576000, "Ben Arous": 640000, Nabeul: 826000,
  Sfax: 955000, Sousse: 700000, Monastir: 425000, Mahdia: 412000,
  Bizerte: 385000, Kairouan: 400000, Zaghouan: 193000, Béja: 285000,
  Jendouba: 265000, "Le Kef": 262000, Siliana: 234000, "Sidi Bouzid": 470000,
  Kasserine: 480000, Gabès: 375000, Médenine: 415000, Tataouine: 150000,
  Gafsa: 350000, Tozeur: 110000, Kébili: 160000, Manouba: 380000,
}

// ---------------------------------------------------------------------------
// Moteur d'estimation (formules transparentes, affichées à l'utilisateur —
// le serveur /api/pub/campaigns recalcule les mêmes au moment d'enregistrer)
// ---------------------------------------------------------------------------
export const WEEKS_PER_MONTH = 4.345

export interface PubEstimation {
  budget: number
  contactsBruts: number
  porteeNette: number
  frequence: number
  grp: number
  cpm: number
}

export function estimatePubCampaign(
  supports: PubSupportDTO[],
  semaines: number,
  facteurPeriode: number,
): PubEstimation {
  const budgetMensuel = supports.reduce((s, p) => s + p.coutMensuel, 0)
  const contactsJour = supports.reduce((s, p) => s + p.contactsJ, 0)
  const budget = (budgetMensuel / WEEKS_PER_MONTH) * semaines
  const contactsBruts = contactsJour * 7 * semaines * facteurPeriode
  // Doublons inter-supports : 0 support → 0 ; dès 5+, plafond 18 % de perte.
  const doublons = supports.length <= 1 ? 0 : 0.18 * Math.min(1, (supports.length - 1) / 4)
  const porteeNette = contactsBruts * (1 - doublons)
  const population = [...new Set(supports.map(p => p.gouvernorat))]
    .reduce((s, g) => s + (PUB_GOV_POPULATION[g] ?? 0), 0)
  return {
    budget,
    contactsBruts,
    porteeNette,
    frequence: porteeNette > 0 ? contactsBruts / porteeNette : 0,
    grp: population > 0 ? (porteeNette / population) * 100 : 0,
    cpm: contactsBruts > 0 ? budget / (contactsBruts / 1000) : 0,
  }
}

// ---------------------------------------------------------------------------
// Campagnes (miroir /api/pub/campaigns — snapshot supports désérialisé)
// ---------------------------------------------------------------------------
export interface PubSupportSnapshot {
  code: string
  mode: string
  name: string
  supportType: string
  regie: string
  gouvernorat: string
  coutMensuel: number
  contactsJ: number
}

export interface PubCampaignDTO {
  id: string
  nom: string
  objectif: string
  brandSlug: string
  auteur: string
  semaines: number
  periode: string
  facteur: number
  budgetCible: number
  budgetEstime: number
  contactsBruts: number
  porteeNette: number
  frequence: number
  grp: number
  cpm: number
  statut: string
  supports: PubSupportSnapshot[]
  createdAt: string
}

export function pubObjectifLabel(id: string): string {
  return PUB_OBJECTIFS.find(o => o.id === id)?.label ?? id
}

export function pubPeriodeLabel(id: string): string {
  return PUB_PERIODE_FACTEURS.find(p => p.id === id)?.label ?? id
}

// ---------------------------------------------------------------------------
// T59 (P2) — Cycle de vie des campagnes : statuts + transitions (miroir
// exact de la machine à états SERVEUR de PATCH /api/pub/campaigns).
// Palette chaude : zinc (simulé) → ambre (validé) → émeraude (en cours) →
// stone (terminé) → terracotta (annulé). AUCUN bleu.
// ---------------------------------------------------------------------------

export interface PubStatutMeta {
  label: string
  /** Classes Tailwind d'un Badge outline (miroir des conventions du module). */
  badge: string
  /** Point de couleur solide (légendes, points de timeline). */
  dot: string
  description: string
}

export const PUB_CAMPAGNE_STATUTS: Readonly<Record<string, PubStatutMeta>> = {
  SIMULEE: {
    label: "Simulée",
    badge: "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    dot: "bg-zinc-400",
    description: "Simulation enregistrée — estimation transparente, aucun budget engagé.",
  },
  VALIDEE: {
    label: "Validée",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-400",
    description: "Budget engagé par l'enseigne — prête au lancement de la diffusion.",
  },
  EN_COURS: {
    label: "En cours",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
    description: "Diffusion active sur les supports réservés du snapshot.",
  },
  TERMINEE: {
    label: "Terminée",
    badge: "border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400",
    dot: "bg-stone-400",
    description: "Campagne clôturée — le rapport d'exploitation reste consultable.",
  },
  ANNULEE: {
    label: "Annulée",
    badge: "border-[var(--c-terra)]/50 bg-orange-50 text-[var(--c-terra)] dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
    dot: "bg-[var(--c-terra)]",
    description: "Campagne abandonnée avant ou pendant la diffusion.",
  },
}

export function pubCampagneStatutMeta(statut: string): PubStatutMeta {
  return PUB_CAMPAGNE_STATUTS[statut] ?? {
    label: statut,
    badge: "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    dot: "bg-zinc-400",
    description: "Statut inconnu.",
  }
}

/** Actions possibles depuis chaque statut (miroir du PATCH serveur). */
export const PUB_CAMPAGNE_ACTIONS: Readonly<Record<string, ReadonlyArray<{ action: "valider" | "lancer" | "terminer" | "annuler"; label: string }>>> = {
  SIMULEE: [
    { action: "valider", label: "Valider la campagne" },
    { action: "annuler", label: "Annuler" },
  ],
  VALIDEE: [
    { action: "lancer", label: "Lancer la diffusion" },
    { action: "annuler", label: "Annuler" },
  ],
  EN_COURS: [
    { action: "terminer", label: "Clôturer la campagne" },
    { action: "annuler", label: "Annuler la diffusion" },
  ],
  TERMINEE: [],
  ANNULEE: [],
}

// ---------------------------------------------------------------------------
// Export CSV des supports (pattern downloadPanelsCsv — BOM + ; FR)
// ---------------------------------------------------------------------------
export function downloadPubSupportsCsv(supports: PubSupportDTO[], context: string): void {
  if (supports.length === 0) return
  const HEAD = [
    "Code", "Mode", "Type", "Format", "Régie", "Gouvernorat", "Délégation",
    "Lieu", "Latitude", "Longitude", "Environnement", "Orientation", "Éclairage",
    "Surface (m²)", "Visibilité /100", "Trafic véh./j", "Piétons/j",
    "Contacts/j", "CPM (DT)", "Coût mensuel (DT)", "Engagement min (mois)",
    "Statut", "État", "Dernier contrôle", "Notes",
  ]
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = [HEAD.join(";")]
  for (const p of supports) {
    lines.push([
      p.code, pubModeMeta(p.mode).label, pubSupportLabel(p.supportType), p.format,
      p.regie, p.gouvernorat, p.delegation, p.lieu, p.lat.toFixed(5), p.lng.toFixed(5),
      PUB_ENVIRONNEMENT_LABELS[p.environnement] ?? p.environnement,
      PUB_ORIENTATION_LABELS[p.orientation] ?? p.orientation,
      PUB_ECLAIRAGE_LABELS[p.eclairage] ?? p.eclairage,
      p.surfaceM2, p.visibilite, p.traficVehJ, p.fluxPietonsJ, p.contactsJ,
      p.cpm ?? "", p.coutMensuel, p.dureeMinMois,
      PUB_STATUT_META[p.statut]?.label ?? p.statut,
      PUB_ETAT_META[p.etat]?.label ?? p.etat,
      p.dernierControle ? formatDateFr(p.dernierControle) : "",
      p.notes ?? "",
    ].map(esc).join(";"))
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `publicite-${context}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Export CSV d'une campagne (volet Rapports)
// ---------------------------------------------------------------------------
export function downloadPubCampaignCsv(c: PubCampaignDTO): void {
  const HEAD = [
    "Champ", "Valeur",
  ]
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const rowsCsv: Array<[string, string | number]> = [
    ["Campagne", c.nom],
    ["Objectif", pubObjectifLabel(c.objectif)],
    ["Statut", c.statut],
    ["Enseigne", c.brandSlug],
    ["Auteur", c.auteur],
    ["Créée le", formatDateFr(c.createdAt)],
    ["Durée (semaines)", c.semaines],
    ["Période", `${pubPeriodeLabel(c.periode)} (×${c.facteur.toLocaleString("fr-FR")})`],
    ["Budget cible (DT)", Math.round(c.budgetCible)],
    ["Budget estimé (DT)", Math.round(c.budgetEstime)],
    ["Contacts bruts", Math.round(c.contactsBruts)],
    ["Portée nette", Math.round(c.porteeNette)],
    ["Fréquence", c.frequence.toLocaleString("fr-FR", { maximumFractionDigits: 2 })],
    ["GRP", c.grp.toLocaleString("fr-FR", { maximumFractionDigits: 1 })],
    ["CPM (DT)", c.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 2 })],
  ]
  const lines = [HEAD.join(";")]
  for (const r of rowsCsv) lines.push([r[0], r[1]].map(esc).join(";"))
  lines.push("")
  lines.push(["Code", "Mode", "Type", "Régie", "Gouvernorat", "Coût mensuel (DT)", "Contacts/j"].map(esc).join(";"))
  for (const s of c.supports) {
    lines.push([
      s.code, pubModeMeta(s.mode).label, pubSupportLabel(s.supportType),
      s.regie, s.gouvernorat, Math.round(s.coutMensuel), s.contactsJ,
    ].map(esc).join(";"))
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `rapport-campagne-${c.nom.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// T60 (P3 « optimiseur de plan média ») — DTO du plan renvoyé par
// POST /api/pub/optimize (miroir exact de la réponse serveur).
// ---------------------------------------------------------------------------
export interface PubOptimizeParMode {
  mode: string
  nb: number
  budgetMensuel: number
  contactsJ: number
}

export interface PubOptimizeParGouv {
  gouvernorat: string
  nb: number
  budgetMensuel: number
  contactsJ: number
}

export interface PubOptimizePlanDTO {
  nbSupports: number
  supports: PubSupportDTO[]
  budgetEstime: number
  contactsBruts: number
  porteeNette: number
  frequence: number
  grp: number
  cpm: number
  resteBudget: number
  coutEffectifTotal: number
  parMode: PubOptimizeParMode[]
  parGouv: PubOptimizeParGouv[]
  engagesLongs: Array<{ code: string; dureeMinMois: number }>
}

export interface PubOptimizeResponseDTO {
  plan: PubOptimizePlanDTO
  explication: string[]
  nbCandidats: number
  generatedAt: string
}

// ---------------------------------------------------------------------------
// T59 (P2) — Export PDF d'un rapport de campagne (socle src/lib/report-pdf.ts
// — même gabarit que les rapports B2B / Shadow / Radar : bandeau CarbuScope,
// KPI encadrés, tableaux autotable, pied de page horodaté). Thème ÉMERAUDE
// (famille « Publicité »), classification « Diffusion interne ».
// ---------------------------------------------------------------------------

export function downloadPubCampaignPdf(c: PubCampaignDTO): void {
  // Import dynamique : jsPDF ne vit que côté navigateur (pattern
  // demographie-io.ts) — jamais évalué au rendu serveur.
  const budgetMensuel = c.supports.reduce((s, p) => s + p.coutMensuel, 0)
  const parMode = [...new Set(c.supports.map(s => s.mode))]
    .map(mode => {
      const sups = c.supports.filter(s => s.mode === mode)
      return {
        mode,
        nb: sups.length,
        budget: sups.reduce((s, p) => s + p.coutMensuel, 0),
        contacts: sups.reduce((s, p) => s + p.contactsJ, 0),
      }
    })
    .sort((a, b) => b.budget - a.budget)
  const gouv = [...new Set(c.supports.map(s => s.gouvernorat))].sort()

  // Esbuild/Turbopack : require dynamique interdit dans un module ESM client
  // → double import() (pattern radar-faisabilite l.91-99).
  void Promise.all([
    import("@/lib/report-pdf"),
  ]).then(([{ createReportPdf, sectionTitle, kpiGrid, table, paragraph, bulletList, finish }]) => {
    const statutMeta = pubCampagneStatutMeta(c.statut)
    const pdf = createReportPdf({
      title: `Rapport de campagne — ${c.nom}`,
      subtitle: `Module Publicité · ${pubObjectifLabel(c.objectif)} · ${statutMeta.label}`,
      classification: "Diffusion interne",
      brandColor: "#059669",
      metaLines: [
        `Enseigne : ${c.brandSlug}`,
        `Auteur : ${c.auteur}`,
        `Créée le : ${formatDateFr(c.createdAt)}`,
        `Statut : ${statutMeta.label} — ${statutMeta.description}`,
      ],
    })

    sectionTitle(pdf, "Cadrage de la campagne")
    paragraph(pdf, `Durée : ${c.semaines} semaine${c.semaines > 1 ? "s" : ""} · Période : ${pubPeriodeLabel(c.periode)} (facteur ×${c.facteur.toLocaleString("fr-FR")}) · Budget cible : ${formatTnd(c.budgetCible)}.`, { size: 9 })
    paragraph(pdf, `Estimation recalculée côté serveur avec les formules transparentes du simulateur (contacts = flux × 7 × semaines × facteur de période ; doublons 18 % au-delà d'un support).`, { muted: true, size: 8 })

    sectionTitle(pdf, "Indicateurs estimés")
    kpiGrid(pdf, [
      { label: "Budget estimé", value: formatTnd(c.budgetEstime), sub: `cible ${formatTnd(c.budgetCible)}` },
      { label: "Contacts bruts", value: formatNum(c.contactsBruts) },
      { label: "Portée nette", value: formatNum(c.porteeNette) },
      { label: "Fréquence", value: `${c.frequence.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}×` },
      { label: "GRP", value: c.grp > 0 ? c.grp.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—" },
      { label: "CPM", value: c.cpm > 0 ? `${c.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} DT` : "—" },
    ])

    sectionTitle(pdf, `Mix par mode (${parMode.length})`)
    table(pdf, {
      head: ["Mode", "Supports", "Budget mensuel (DT)", "Contacts/j", "Part budget"],
      body: parMode.map(m => [
        pubModeMeta(m.mode).label,
        String(m.nb),
        Math.round(m.budget).toLocaleString("fr-FR"),
        Math.round(m.contacts).toLocaleString("fr-FR"),
        budgetMensuel > 0 ? `${Math.round((m.budget / budgetMensuel) * 100)} %` : "—",
      ]),
      colStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "center" } },
    })

    sectionTitle(pdf, `Supports de la campagne (${c.supports.length})`)
    table(pdf, {
      head: ["Code", "Type", "Régie", "Gouvernorat", "Coût/mois (DT)", "Contacts/j"],
      body: c.supports.map(s => [
        s.code,
        pubSupportLabel(s.supportType),
        s.regie,
        s.gouvernorat,
        Math.round(s.coutMensuel).toLocaleString("fr-FR"),
        Math.round(s.contactsJ).toLocaleString("fr-FR"),
      ]),
      colStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
      fontSize: 7.5,
    })

    sectionTitle(pdf, "Couverture géographique")
    bulletList(pdf, gouv.map(g => `${g} — ${c.supports.filter(s => s.gouvernorat === g).length} support(s)`), { size: 9 })

    paragraph(pdf, "Rapport généré depuis le volet « Rapports » du module Publicité — snapshot des supports archivé à l'enregistrement.", { muted: true, size: 8 })
    finish(pdf, `rapport-campagne-${c.nom.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`)
  })
}

// ---------------------------------------------------------------------------
// T60 (P3) — Export PDF du PORTEFEUILLE de campagnes (volet Rapports côté
// enseigne, console SA côté supervision) : synthèse par statut, KPIs du
// portefeuille, détail de chaque campagne, mix par mode et couverture
// géographique agrégés sur les snapshots. Même socle report-pdf.ts.
// ---------------------------------------------------------------------------
export function downloadPubPortfolioPdf(campaigns: PubCampaignDTO[], context: string): void {
  if (campaigns.length === 0) return
  const budgetEngage = campaigns
    .filter(c => c.statut === "VALIDEE" || c.statut === "EN_COURS")
    .reduce((s, c) => s + c.budgetEstime, 0)
  const contacts = campaigns.reduce((s, c) => s + c.contactsBruts, 0)
  const budgetTotal = campaigns.reduce((s, c) => s + c.budgetEstime, 0)

  // Agrégats sur les snapshots supports de TOUTES les campagnes.
  const modeAgg = new Map<string, { nb: number; budget: number; contacts: number }>()
  const gouvAgg = new Map<string, number>()
  for (const c of campaigns) {
    for (const s of c.supports) {
      const m = modeAgg.get(s.mode) ?? { nb: 0, budget: 0, contacts: 0 }
      m.nb += 1
      m.budget += s.coutMensuel
      m.contacts += s.contactsJ
      modeAgg.set(s.mode, m)
      gouvAgg.set(s.gouvernorat, (gouvAgg.get(s.gouvernorat) ?? 0) + 1)
    }
  }
  const parMode = [...modeAgg.entries()]
    .map(([mode, v]) => ({ mode, ...v }))
    .sort((a, b) => b.budget - a.budget)
  const gouv = [...gouvAgg.entries()].sort((a, b) => b[1] - a[1])

  const brands = [...new Set(campaigns.map(c => c.brandSlug))].sort()

  void Promise.all([
    import("@/lib/report-pdf"),
  ]).then(([{ createReportPdf, sectionTitle, kpiGrid, table, paragraph, bulletList, finish }]) => {
    const pdf = createReportPdf({
      title: "Portefeuille publicitaire",
      subtitle: `Module Publicité · ${campaigns.length} campagne${campaigns.length > 1 ? "s" : ""} · ${context}`,
      classification: "Diffusion interne",
      brandColor: "#059669",
      metaLines: [
        `Enseigne${brands.length > 1 ? "s" : ""} : ${brands.join(", ")}`,
        `Généré le : ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`,
        `Budget engagé (validées + en cours) : ${formatTnd(budgetEngage)} sur ${formatTnd(budgetTotal)} estimés au total.`,
      ],
    })

    sectionTitle(pdf, "Synthèse du portefeuille")
    kpiGrid(pdf, [
      { label: "Campagnes", value: String(campaigns.length) },
      { label: "En diffusion", value: String(campaigns.filter(c => c.statut === "EN_COURS").length) },
      { label: "Budget engagé", value: formatTnd(budgetEngage) },
      { label: "Budget estimé total", value: formatTnd(budgetTotal) },
      { label: "Contacts cumulés", value: formatNum(contacts) },
      { label: "Gouvernorats couverts", value: String(gouv.length) },
    ])

    sectionTitle(pdf, "Cycle de vie (répartition par statut)")
    table(pdf, {
      head: ["Statut", "Campagnes", "Part"],
      body: ["SIMULEE", "VALIDEE", "EN_COURS", "TERMINEE", "ANNULEE"].map(st => {
        const n = campaigns.filter(c => c.statut === st).length
        return [
          pubCampagneStatutMeta(st).label,
          String(n),
          campaigns.length > 0 ? `${Math.round((n / campaigns.length) * 100)} %` : "—",
        ]
      }),
      colStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
    })

    sectionTitle(pdf, `Détail des campagnes (${campaigns.length})`)
    table(pdf, {
      head: ["Campagne", "Enseigne", "Statut", "Objectif", "Sem.", "Budget (DT)", "Contacts", "CPM (DT)"],
      body: campaigns.map(c => [
        c.nom,
        c.brandSlug,
        pubCampagneStatutMeta(c.statut).label,
        pubObjectifLabel(c.objectif),
        String(c.semaines),
        Math.round(c.budgetEstime).toLocaleString("fr-FR"),
        Math.round(c.contactsBruts).toLocaleString("fr-FR"),
        c.cpm > 0 ? c.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—",
      ]),
      colStyles: { 4: { halign: "center" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      fontSize: 7.5,
    })

    sectionTitle(pdf, `Mix par mode — supports réservés (${parMode.reduce((s, m) => s + m.nb, 0)})`)
    table(pdf, {
      head: ["Mode", "Supports", "Budget mensuel (DT)", "Contacts/j cumulés"],
      body: parMode.map(m => [
        pubModeMeta(m.mode).label,
        String(m.nb),
        Math.round(m.budget).toLocaleString("fr-FR"),
        Math.round(m.contacts).toLocaleString("fr-FR"),
      ]),
      colStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
    })

    sectionTitle(pdf, "Couverture géographique agrégée")
    bulletList(pdf, gouv.map(g => `${g[0]} — ${g[1]} support(s) réservé(s)`), { size: 9 })

    paragraph(pdf, "Portefeuille généré depuis le module Publicité — chiffres recalculés serveur à l'enregistrement de chaque campagne (formules transparentes du simulateur).", { muted: true, size: 8 })
    finish(pdf, `portefeuille-publicite-${new Date().toISOString().slice(0, 10)}`)
  })
}
