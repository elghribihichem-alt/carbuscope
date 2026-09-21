"use client"

// Super Administration — ⑩ Devis SaaS : configurateur interactif (Vague 7, G-2).
// L'éditeur CarbuScope SAS simule en direct l'abonnement d'un prospect /
// enseigne — grille adhésion 6 000 DT + 40 DT/station/mois ou 400 DT/station/an,
// TVA 19 % — génère un devis PDF A4 professionnel (iframe srcdoc autonome,
// pattern du rapport analytics : print + afterprint + garde-fou 60 s), le
// persiste via /api/super/devis (calcul serveur = source de vérité) et suit
// son statut BROUILLON → ENVOYE → ACCEPTE | REFUSE.
// Identité graphite/violet de l'espace SA — montants formatés fr-FR + « DT ».

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { PERIODICITE_META, pastille, type Pastille } from "@/lib/sa-types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Calculator, CalendarCheck, CalendarDays, CheckCircle2, Coins, FileText, Layers,
  Loader2, Mail, Percent, Printer, RefreshCw, Sigma, Zap,
} from "lucide-react"

// ---------------------------------------------------------------- utilitaires

/** Fetch typé relatif : lit { error } du serveur et la transforme en exception. */
async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // corps de réponse vide
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new Error(msg ?? `Erreur HTTP ${res.status}`)
  }
  return data as T
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError"
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Erreur inconnue"
}

// Formats FR — 0 décimale pour les KPI (cohérent avec formatDTCourt de
// l'espace SA), 3 décimales pour le document PDF (montants de devis).
const nf0 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const nf3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDT = (dt: number) => `${nf0.format(Math.round(dt))} DT`
const fmtDT3 = (dt: number) => `${nf3.format(dt)} DT`

/** « il y a 3 min » / « il y a 2 j » — âge relatif français compact. */
function ilYA(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 45) return "à l'instant"
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  if (j < 31) return `il y a ${j} j`
  const mois = Math.floor(j / 30)
  if (mois < 12) return `il y a ${mois} mois`
  return `il y a ${Math.floor(mois / 12)} an${mois >= 24 ? "s" : ""}`
}

// ---------------------------------------------------------------- types & métier

/** DTO de /api/super/devis — montants en DT (3 décimales), dates ISO. */
interface DevisDTO {
  id: string
  numero: string
  enseigneNom: string
  contactEmail: string
  nbStations: number
  modeFacturation: string
  adhesionOfferte: boolean
  montantHt: number
  montantTva: number
  montantTtc: number
  statut: string
  creePar: string
  createdAt: string
  updatedAt: string
}

// Grille SaaS (miroir client de la constante serveur — l'affichage seul ;
// le POST /api/super/devis recalcule tout côté serveur).
const ADHESION_DT = 6_000
const MENSUEL_MOIS_DT = 40
const MENSUEL_AN_DT = 480 // 40 × 12
const ANNUEL_AN_DT = 400
const TAUX_TVA = 0.19

const DEVIS_STATUTS = ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE"] as const

const DEVIS_STATUT_META: Record<string, Pastille> = {
  BROUILLON: { label: "Brouillon", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  ENVOYE: { label: "Envoyé", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  ACCEPTE: { label: "Accepté", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  REFUSE: { label: "Refusé", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

/** Badge mode de facturation — mêmes teintes que PERIODICITE_META (sa-types). */
const MODE_BADGE: Record<string, string> = {
  MENSUEL: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  ANNUEL: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400",
}

const MODES: { valeur: "MENSUEL" | "ANNUEL"; label: string; pu: string; desc: string; icon: typeof CalendarDays; badge?: string }[] = [
  { valeur: "MENSUEL", label: "Mensuel", pu: "40 DT / station / mois", desc: "Facturation mensuelle, souplesse maximale", icon: CalendarDays },
  {
    valeur: "ANNUEL", label: "Annuel", pu: "400 DT / station / an", desc: "Règlement annuel d’avance, meilleure grille",
    icon: CalendarCheck, badge: "2 mois offerts ≈ −17 %",
  },
]

interface Simulation {
  adhesionDt: number
  abonnementDt: number
  htDt: number
  tvaDt: number
  ttcDt: number
  equivalentMensuelTtcDt: number
  economieAnnuelDt: number | null
}

/** Calcul miroir du serveur (millimes arrondis) — panneau d'affichage live. */
function simuler(nbStations: number, mode: string, adhesionOfferte: boolean): Simulation {
  const adhesionDt = adhesionOfferte ? 0 : ADHESION_DT
  const abonnementDt = nbStations * (mode === "ANNUEL" ? ANNUEL_AN_DT : MENSUEL_AN_DT)
  const htMill = (adhesionDt + abonnementDt) * 1000
  const tvaMill = Math.round(htMill * TAUX_TVA)
  const ttcDt = (htMill + tvaMill) / 1000
  return {
    adhesionDt,
    abonnementDt,
    htDt: htMill / 1000,
    tvaDt: tvaMill / 1000,
    ttcDt,
    equivalentMensuelTtcDt: ttcDt / 12,
    economieAnnuelDt: mode === "ANNUEL" ? nbStations * (MENSUEL_AN_DT - ANNUEL_AN_DT) : null,
  }
}

// ---------------------------------------------------------------------------
// Devis PDF A4 — document autonome dans une iframe (srcdoc), mêmes conventions
// que le rapport analytics (E-3) : styles préfixés dv-*, aucune classe
// partagée, échappement systématique des données dynamiques, @page A4.
// ---------------------------------------------------------------------------

/** Échappe une donnée dynamique avant insertion dans le srcdoc HTML. */
function ech(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Construit le devis CarbuScope SAS : document HTML complet A4, noir sur
 * blanc — la marque et le filet portent le violet éditeur #6d28d9 (identité
 * graphite/violet de la Super Administration). Fonction pure, testable avec
 * un DevisDTO figé. Montants en DT à 3 décimales (facture-style).
 */
function construireDevisHtml(d: DevisDTO): string {
  const emis = new Date(d.createdAt)
  const validite = new Date(emis.getTime() + 30 * 86400000)
  const dateLongue = (x: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(x)
  const modeLibelle = d.modeFacturation === "ANNUEL" ? "annuelle (400 DT/station/an)" : "mensuelle (40 DT/station/mois)"

  // Lignes du devis — l'adhésion offerte reste visible (barrée, 0 DT).
  const lignes: { libelle: string; detail: string; qte: string; pu: string; montant: string }[] = []
  lignes.push(
    d.adhesionOfferte
      ? { libelle: "Adhésion à la plateforme CarbuScope", detail: "offerte — geste commercial", qte: "1", pu: fmtDT3(ADHESION_DT), montant: fmtDT3(0) }
      : { libelle: "Adhésion à la plateforme CarbuScope", detail: "accès unique à la 1re année", qte: "1", pu: fmtDT3(ADHESION_DT), montant: fmtDT3(ADHESION_DT) },
  )
  lignes.push(
    d.modeFacturation === "ANNUEL"
      ? {
          libelle: `Abonnement SaaS — ${nf0.format(d.nbStations)} stations`,
          detail: `formule ${modeLibelle}`,
          qte: nf0.format(d.nbStations),
          pu: fmtDT3(ANNUEL_AN_DT),
          montant: fmtDT3(ANNUEL_AN_DT * d.nbStations),
        }
      : {
          libelle: `Abonnement SaaS — ${nf0.format(d.nbStations)} stations`,
          detail: `formule mensuelle — ${nf0.format(d.nbStations)} × 40 DT × 12 mois`,
          qte: nf0.format(d.nbStations * 12),
          pu: fmtDT3(MENSUEL_MOIS_DT),
          montant: fmtDT3(MENSUEL_AN_DT * d.nbStations),
        },
  )
  const corps = lignes
    .map(
      l =>
        `<tr><td><span class="dv-lib">${ech(l.libelle)}</span><span class="dv-detail">${ech(l.detail)}</span></td><td class="dv-num">${ech(l.qte)}</td><td class="dv-num">${ech(l.pu)}</td><td class="dv-num dv-montant">${ech(l.montant)}</td></tr>`,
    )
    .join("")

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Devis ${ech(d.numero)} — CarbuScope SAS</title>
<style>
  @page { size: A4; margin: 14mm }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0 }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.5; color: #0f172a; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .dv-entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; border-bottom: 2pt solid #0f172a; padding-bottom: 3mm }
  .dv-marque { margin: 0; color: #6d28d9; font-size: 17pt; font-weight: 700; letter-spacing: 0.02em }
  .dv-soustitre { margin: 1mm 0 0; font-size: 9.5pt; font-weight: 600; color: #0f172a }
  .dv-meta { margin: 0.5mm 0 0; font-size: 8pt; color: #64748b }
  .dv-titre-bloc { text-align: right; shrink: 0 }
  .dv-titre { margin: 0; font-size: 22pt; font-weight: 800; letter-spacing: 0.1em; color: #0f172a; line-height: 1.1 }
  .dv-numero { margin: 1mm 0 0; font-size: 11pt; font-weight: 700; color: #6d28d9 }
  .dv-blocs { display: flex; gap: 5mm; margin-top: 4mm }
  .dv-bloc { width: 50%; border: 0.75pt solid #cbd5e1; padding: 3mm 4mm }
  .dv-label { margin: 0; font-size: 8pt; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em }
  .dv-strong { margin: 1mm 0 0; font-size: 11pt; font-weight: 700 }
  .dv-table { width: 100%; border-collapse: collapse; margin-top: 5mm; font-size: 9.5pt }
  .dv-table th { padding: 2mm 2.5mm; border-bottom: 1pt solid #94a3b8; text-align: left; font-size: 7.5pt; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.07em }
  .dv-table td { padding: 2mm 2.5mm; border-bottom: 0.5pt solid #e2e8f0; vertical-align: top }
  .dv-table th.dv-num, .dv-table td.dv-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums }
  .dv-table tr { page-break-inside: avoid }
  .dv-lib { display: block; font-weight: 600 }
  .dv-detail { display: block; font-size: 8pt; color: #64748b }
  .dv-montant { font-weight: 700 }
  .dv-totaux { margin: 4mm 0 0 auto; width: 86mm; border-collapse: collapse; font-size: 10pt }
  .dv-totaux td { padding: 1.2mm 2.5mm }
  .dv-totaux .dv-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
  .dv-total-ttc td { border-top: 1.5pt solid #6d28d9; font-weight: 800; font-size: 12pt; padding-top: 2mm }
  .dv-total-ttc td.dv-num { color: #6d28d9 }
  .dv-conditions { margin-top: 6mm; border: 0.75pt solid #cbd5e1; border-left: 2.5pt solid #6d28d9; background: #f8fafc; padding: 3mm 4.5mm; page-break-inside: avoid }
  .dv-conditions h2 { margin: 0; font-size: 8.5pt; font-weight: 700; color: #6d28d9; text-transform: uppercase; letter-spacing: 0.14em }
  .dv-conditions ul { margin: 1.5mm 0 0; padding-left: 4mm }
  .dv-conditions li { margin: 0.8mm 0 0; font-size: 9pt }
  .dv-accord { display: flex; gap: 5mm; margin-top: 6mm; page-break-inside: avoid }
  .dv-accord > div { width: 50%; border: 0.75pt solid #cbd5e1; padding: 3mm 4mm; min-height: 18mm }
  .dv-pied { margin-top: 8mm; padding-top: 2.5mm; border-top: 0.5pt solid #cbd5e1; text-align: center; font-size: 8pt; color: #64748b }
  .dv-pied strong { color: #6d28d9 }
</style>
</head>
<body>
  <header class="dv-entete">
    <div>
      <p class="dv-marque">CarbuScope SAS</p>
      <p class="dv-soustitre">Éditeur de la plateforme CarbuScope — observatoire du carburant en Tunisie</p>
      <p class="dv-meta">Les Berges du Lac, Tunis · contact@carbuscope.tn · +216 71 000 000</p>
      <p class="dv-meta">Matricule fiscal TVA : 1234567A/M/000</p>
    </div>
    <div class="dv-titre-bloc">
      <p class="dv-titre">DEVIS</p>
      <p class="dv-numero">N° ${ech(d.numero)}</p>
      <p class="dv-meta">Émis le ${ech(dateLongue(emis))}</p>
      <p class="dv-meta">Validité 30 jours — jusqu’au ${ech(dateLongue(validite))}</p>
    </div>
  </header>

  <section class="dv-blocs">
    <div class="dv-bloc">
      <p class="dv-label">Émetteur</p>
      <p class="dv-strong">CarbuScope SAS — Tunis</p>
      <p class="dv-meta">Les Berges du Lac, 1053 Tunis</p>
      <p class="dv-meta">contact@carbuscope.tn · +216 71 000 000</p>
    </div>
    <div class="dv-bloc">
      <p class="dv-label">Destinataire</p>
      <p class="dv-strong">${ech(d.enseigneNom)}</p>
      <p class="dv-meta">${d.contactEmail ? ech(d.contactEmail) : "e-mail de contact non renseigné"}</p>
      <p class="dv-meta">${ech(nf0.format(d.nbStations))} stations · formule ${ech(modeLibelle)}</p>
    </div>
  </section>

  <table class="dv-table">
    <thead><tr><th>Désignation</th><th class="dv-num">Qté</th><th class="dv-num">PU HT</th><th class="dv-num">Montant HT</th></tr></thead>
    <tbody>${corps}</tbody>
  </table>

  <table class="dv-totaux">
    <tbody>
      <tr><td>Total HT (1re année)</td><td class="dv-num">${ech(fmtDT3(d.montantHt))}</td></tr>
      <tr><td>TVA (19 %)</td><td class="dv-num">${ech(fmtDT3(d.montantTva))}</td></tr>
      <tr class="dv-total-ttc"><td>Total TTC</td><td class="dv-num">${ech(fmtDT3(d.montantTtc))}</td></tr>
      <tr><td colspan="2" style="font-size:8pt;color:#64748b">Équivalent mensuel TTC sur la 1re année : ${ech(fmtDT3(d.montantTtc / 12))}/mois${d.modeFacturation === "ANNUEL" ? ` · formule annuelle : 2 mois offerts vs mensuel (−16,7 %)` : ""}</td></tr>
    </tbody>
  </table>

  <aside class="dv-conditions">
    <h2>Conditions</h2>
    <ul>
      <li>Devis valable 30 jours à compter de la date d’émission ; règlement à 30 jours après acceptation.</li>
      <li>Abonnement SaaS reconduit tacitement après la 1re année — même grille : 40 DT/station/mois (mensuel) ou 400 DT/station/an (annuel) ; résiliation avec préavis de 60 jours.</li>
      <li>Adhésion unique de 6 000 DT ${d.adhesionOfferte ? "<strong>offerte</strong> (geste commercial CarbuScope)" : "acquittée avec la 1re échéance"}.</li>
      <li>Grille indicative, TVA 19 % incluse dans les montants ci-dessus — hors prestations optionnelles (API dédiée, formation terrain).</li>
      <li>L’ajout ou le retrait de stations en cours d’année est proratisé au mois le plus proche.</li>
    </ul>
  </aside>

  <section class="dv-accord">
    <div>
      <p class="dv-label">Bon pour accord — client</p>
      <p class="dv-meta" style="margin-top:8mm">Date et signature :</p>
    </div>
    <div>
      <p class="dv-label">CarbuScope SAS</p>
      <p class="dv-meta" style="margin-top:8mm">Nadia Ben Amor — Super Administration</p>
    </div>
  </section>

  <footer class="dv-pied">
    Généré depuis la <strong>Super Administration</strong> — démo CarbuScope · Devis ${ech(d.numero)} · ${ech(new Intl.DateTimeFormat("fr-FR").format(emis))}
  </footer>
</body>
</html>`
}

/**
 * Ouvre la boîte d'impression du navigateur sur le devis A4 autonome monté
 * dans une iframe hors écran (srcdoc) — pattern du rapport analytics :
 * afterprint retire l'iframe, garde-fou 60 s (print() no-op en headless,
 * l'iframe reste alors montée pour la QA).
 */
function ouvrirDevisImpression(html: string): void {
  const iframe = document.createElement("iframe")
  iframe.title = "Devis CarbuScope (impression)"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;background:#fff"
  iframe.srcdoc = html
  let nettoye = false
  let garde: number | undefined
  const nettoyer = () => {
    if (nettoye) return
    nettoye = true
    window.clearTimeout(garde)
    iframe.remove()
  }
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      // Environnement sans dialogue d'impression (headless) : la garde
      // temporelle ci-dessous nettoie — l'iframe reste entre-temps pour la QA.
    }
    try {
      iframe.contentWindow?.addEventListener("afterprint", nettoyer, { once: true })
    } catch {
      // afterprint indisponible : la garde temporelle nettoie l'iframe.
    }
    // Garde-fou 60 s : print() peut être un no-op (headless), on laisse
    // l'iframe montée le temps de la QA puis on la retire du DOM.
    garde = window.setTimeout(nettoyer, 60_000)
  }
  document.body.appendChild(iframe)
}

// ---------------------------------------------------------------------------
// Module ⑩ — Devis SaaS (configurateur interactif)
// ---------------------------------------------------------------------------
export function SaDevis() {
  // Formulaire du configurateur
  const [enseigneNom, setEnseigneNom] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [nbStations, setNbStations] = useState(10)
  const [nbSaisi, setNbSaisi] = useState("10")
  const [mode, setMode] = useState<"MENSUEL" | "ANNUEL">("MENSUEL")
  const [adhesionOfferte, setAdhesionOfferte] = useState(false)

  // Historique persisté
  const [devis, setDevis] = useState<DevisDTO[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [patchId, setPatchId] = useState<string | null>(null)

  const charger = useCallback(async (signal?: AbortSignal) => {
    setChargement(true)
    setErreur(null)
    try {
      const j = await apiJson<{ devis: DevisDTO[] }>("/api/super/devis", { signal })
      setDevis(j.devis)
      setChargement(false)
    } catch (e) {
      if (isAbort(e)) return
      setErreur(errMsg(e))
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void charger(ac.signal)
    return () => ac.abort()
  }, [charger, refreshKey])

  const reessayer = useCallback(() => setRefreshKey(k => k + 1), [])

  // Calcul live (miroir serveur — l'affichage seul, le POST recalcule tout).
  const sim = useMemo(() => simuler(nbStations, mode, adhesionOfferte), [nbStations, mode, adhesionOfferte])
  const pctEconomie = nf1.format((1 - ANNUEL_AN_DT / MENSUEL_AN_DT) * 100)

  /** Slider + champ nombre synchronisés (bornes 1–500). */
  const majStations = useCallback((n: number) => {
    const c = Math.min(500, Math.max(1, Math.round(n)))
    setNbStations(c)
    setNbSaisi(String(c))
  }, [])

  /** Pré-remplit le prospect connu du portefeuille (CTR-2025-003). */
  const preremplir = useCallback(() => {
    setEnseigneNom("Med Petroleum (prospect)")
    setContactEmail("s.gharbi@medpetroleum.tn")
    majStations(12)
    toast.info("Prospect pré-rempli", {
      description: "Med Petroleum (prospect) — 12 stations, e-mail du contact du contrat CTR-2025-003.",
    })
  }, [majStations])

  /** POST → 201 : toast + impression PDF + refresh de l'historique. */
  const generer = useCallback(async () => {
    const nom = enseigneNom.trim()
    if (nom.length < 1) {
      toast.error("Nom manquant", { description: "Le nom de l'enseigne / prospect est obligatoire (1 à 80 caractères)." })
      return
    }
    if (envoiEnCours) return
    setEnvoiEnCours(true)
    try {
      const j = await apiJson<{ devis: DevisDTO }>("/api/super/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enseigneNom: nom,
          contactEmail: contactEmail.trim(),
          nbStations,
          modeFacturation: mode,
          adhesionOfferte,
        }),
      })
      toast.success(`Devis ${j.devis.numero} créé`, {
        description: `${j.devis.enseigneNom} — ${fmtDT(j.devis.montantTtc)} TTC (TVA 19 % incluse) · impression PDF ouverte.`,
      })
      ouvrirDevisImpression(construireDevisHtml(j.devis))
      setRefreshKey(k => k + 1)
    } catch (e) {
      toast.error("Génération impossible", { description: errMsg(e) })
    } finally {
      setEnvoiEnCours(false)
    }
  }, [enseigneNom, contactEmail, nbStations, mode, adhesionOfferte, envoiEnCours])

  /** Réimprime un devis existant — depuis l'enregistrement, SANS re-POST. */
  const reimprimer = useCallback((d: DevisDTO) => {
    toast.info(`Réimpression — ${d.numero}`, { description: `${d.enseigneNom} · ${fmtDT(d.montantTtc)} TTC · document régénéré depuis l'enregistrement.` })
    ouvrirDevisImpression(construireDevisHtml(d))
  }, [])

  /** PATCH statut → mise à jour du badge + toast (calcul serveur). */
  const changerStatut = useCallback(async (d: DevisDTO, statut: string) => {
    if (statut === d.statut || patchId) return
    setPatchId(d.id)
    try {
      const j = await apiJson<{ devis: DevisDTO }>("/api/super/devis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, statut }),
      })
      setDevis(prev => prev.map(x => (x.id === j.devis.id ? j.devis : x)))
      toast.success(`Statut mis à jour — ${pastille(DEVIS_STATUT_META, statut).label.toLowerCase()}`, {
        description: `${d.numero} — ${d.enseigneNom}.`,
      })
    } catch (e) {
      toast.error("Changement de statut impossible", { description: errMsg(e) })
    } finally {
      setPatchId(null)
    }
  }, [patchId])

  return (
    <div className="space-y-4">
      {/* En-tête du module */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
            <Calculator className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight">Devis SaaS — configurateur</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Simulez l&apos;abonnement d&apos;un prospect en direct, générez un devis PDF A4, persistez-le
              et suivez son statut (brouillon → envoyé → accepté / refusé). Le calcul est confirmé côté
              serveur — source de vérité unique.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
              <Coins className="h-3 w-3" aria-hidden /> 6 000 DT d&apos;adhésion
            </Badge>
            <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              <CalendarDays className="h-3 w-3" aria-hidden /> 40 DT/mois · 400 DT/an
            </Badge>
            <Badge variant="outline" className="gap-1 border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              TVA 19 %
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Configurateur + panneau de calcul live */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ---- Colonne gauche : formulaire ---- */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Configurer l&apos;abonnement</CardTitle>
            <CardDescription>
              Prospect ou enseigne — les paramètres alimentent le panneau de calcul en direct.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Raccourci démo</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={preremplir}
              >
                <Zap className="h-3.5 w-3.5 text-violet-600" aria-hidden /> Pré-remplir Med Petroleum
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="devis-enseigne">Nom de l&apos;enseigne / prospect</Label>
                <Input
                  id="devis-enseigne"
                  value={enseigneNom}
                  maxLength={80}
                  onChange={e => setEnseigneNom(e.target.value)}
                  placeholder="Ex. Med Petroleum (prospect)"
                  aria-describedby="devis-enseigne-hint"
                />
                <p id="devis-enseigne-hint" className="text-xs text-muted-foreground">
                  Obligatoire — 80 caractères maximum.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="devis-email">E-mail contact (optionnel)</Label>
                <Input
                  id="devis-email"
                  type="email"
                  value={contactEmail}
                  maxLength={120}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="Ex. contact@enseigne.tn"
                  aria-describedby="devis-email-hint"
                />
                <p id="devis-email-hint" className="text-xs text-muted-foreground">
                  Apparaît sur le devis PDF — laissé vide s&apos;il est inconnu.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="devis-stations">Nombre de stations</Label>
                <p className="text-xs text-muted-foreground">de 1 à 500</p>
              </div>
              <div className="flex items-end gap-4">
                <p className="w-24 shrink-0 text-4xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100" aria-live="polite">
                  {nf0.format(nbStations)}
                </p>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs text-muted-foreground">station{nbStations > 1 ? "s" : ""} souscrite{nbStations > 1 ? "s" : ""} au SaaS CarbuScope</p>
                </div>
                <Input
                  id="devis-stations"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={nbSaisi}
                  onChange={e => {
                    const s = e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                    setNbSaisi(s)
                    const n = Number.parseInt(s, 10)
                    if (Number.isFinite(n) && n >= 1) setNbStations(Math.min(500, n))
                  }}
                  onBlur={() => setNbSaisi(String(nbStations))}
                  className="h-9 w-24 shrink-0 text-right tabular-nums"
                  aria-label="Nombre de stations (saisie)"
                />
              </div>
              <Slider
                min={1}
                max={500}
                step={1}
                value={[nbStations]}
                onValueChange={v => majStations(v[0] ?? 1)}
                aria-label="Nombre de stations (curseur)"
                aria-valuetext={`${nbStations} stations`}
              />
              <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
                <span>1</span>
                <span>100</span>
                <span>250</span>
                <span>500</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mode de facturation</Label>
              <div role="radiogroup" aria-label="Mode de facturation" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {MODES.map(m => {
                  const actif = mode === m.valeur
                  const Icon = m.icon
                  return (
                    <button
                      key={m.valeur}
                      type="button"
                      role="radio"
                      aria-checked={actif}
                      onClick={() => setMode(m.valeur)}
                      className={cn(
                        "rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                        actif
                          ? "border-violet-400 bg-violet-50/60 ring-1 ring-violet-300 dark:border-violet-700 dark:bg-violet-950/40 dark:ring-violet-800"
                          : "border-border hover:border-violet-300 hover:bg-violet-50/30 dark:hover:border-violet-800 dark:hover:bg-violet-950/20",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            actif ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground",
                          )}>
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold leading-tight">{m.label}</span>
                            <span className="block text-xs text-muted-foreground">{m.desc}</span>
                          </span>
                        </div>
                        {actif && <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold tabular-nums">{m.pu}</span>
                        {m.badge && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                            {m.badge}
                          </Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-violet-200 bg-violet-50/40 p-3.5 dark:border-violet-900 dark:bg-violet-950/30">
              <div className="space-y-1">
                <Label htmlFor="devis-adhesion" className="text-sm font-medium">
                  Adhésion offerte <span className="font-normal text-muted-foreground">(geste commercial)</span>
                </Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {adhesionOfferte
                    ? "L'adhésion unique de 6 000 DT est offerte : elle apparaît barrée dans la simulation et à 0 DT sur le devis."
                    : "L'adhésion unique de 6 000 DT est facturée sur la 1re année (conforme à la grille publique)."}
                </p>
              </div>
              <Switch
                id="devis-adhesion"
                checked={adhesionOfferte}
                onCheckedChange={setAdhesionOfferte}
                aria-label="Adhésion offerte (geste commercial)"
              />
            </div>
          </CardContent>
        </Card>

        {/* ---- Colonne droite : panneau de calcul live ---- */}
        <Card className="lg:col-span-2 self-start">
          <CardHeader>
            <CardTitle className="text-base">Simulation en direct</CardTitle>
            <CardDescription>
              1re année d&apos;abonnement — recalculée à chaque réglage, confirmée par le serveur à la génération.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Adhésion HT"
                icon={Coins}
                tone="default"
                value={
                  adhesionOfferte ? (
                    <span className="line-through text-muted-foreground" title="Offerte — geste commercial">{fmtDT(ADHESION_DT)}</span>
                  ) : (
                    fmtDT(sim.adhesionDt)
                  )
                }
                sub={adhesionOfferte ? "offerte — geste commercial" : "adhésion unique, 1re année"}
              />
              <KpiCard
                label="Abonnement 1re année HT"
                icon={Layers}
                tone="info"
                value={fmtDT(sim.abonnementDt)}
                sub={mode === "ANNUEL" ? `${nf0.format(nbStations)} × 400 DT` : `${nf0.format(nbStations)} × 40 DT × 12 mois`}
              />
              <KpiCard
                label="Total HT"
                icon={Sigma}
                tone="default"
                value={fmtDT(sim.htDt)}
                sub="hors taxes, 1re année"
              />
              <KpiCard
                label="TVA 19 %"
                icon={Percent}
                tone="warning"
                value={fmtDT(sim.tvaDt)}
                sub="taux normal tunisien"
              />
            </div>

            <div className="rounded-lg border border-violet-300 bg-gradient-to-br from-violet-50 to-slate-50 p-4 dark:border-violet-800 dark:from-violet-950/50 dark:to-slate-900">
              <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-400">Total TTC — 1re année</p>
              <p className="mt-1 text-3xl font-bold tabular-nums leading-none text-violet-700 dark:text-violet-300" aria-live="polite">
                {fmtDT(sim.ttcDt)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                soit {fmtDT(sim.equivalentMensuelTtcDt)} TTC / mois en équivalent mensuel
              </p>
              {sim.economieAnnuelDt !== null && (
                <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Économie vs mensuel : {fmtDT(sim.economieAnnuelDt)} (−{pctEconomie} %)
                </p>
              )}
            </div>

            <Button
              type="button"
              size="lg"
              className="w-full gap-2 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => void generer()}
              disabled={envoiEnCours}
            >
              {envoiEnCours ? <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden /> : <FileText className="h-4.5 w-4.5" aria-hidden />}
              {envoiEnCours ? "Génération en cours…" : "Générer le devis PDF"}
            </Button>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Le devis est persisté (statut Brouillon) puis l&apos;impression PDF A4 s&apos;ouvre —
              boîte « Enregistrer au format PDF » du navigateur.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Historique des devis ---- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Historique des devis</CardTitle>
            <CardDescription>
              {chargement && devis.length === 0
                ? "Chargement de l'historique…"
                : `${nf0.format(devis.length)} devis enregistré${devis.length > 1 ? "s" : ""} — réimpression et suivi de statut.`}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={reessayer}
            disabled={chargement}
            aria-label="Actualiser l'historique des devis"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", chargement && "animate-spin")} aria-hidden /> Actualiser
          </Button>
        </CardHeader>
        <CardContent>
          {erreur && !chargement ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Impossible de charger l&apos;historique des devis</p>
              <p className="text-xs text-red-600 dark:text-red-400">{erreur}</p>
              <Button type="button" variant="outline" size="sm" onClick={reessayer} className="gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
              </Button>
            </div>
          ) : chargement && devis.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" aria-label="Chargement" />
              ))}
            </div>
          ) : devis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Aucun devis</p>
              <p className="text-xs text-muted-foreground">Configurez une simulation ci-dessus puis générez votre premier devis PDF.</p>
            </div>
          ) : (
            <div className="relative max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-[9rem]">N° devis</TableHead>
                    <TableHead>Enseigne / prospect</TableHead>
                    <TableHead className="text-right">Stations</TableHead>
                    <TableHead className="w-[6.5rem]">Mode</TableHead>
                    <TableHead className="text-right">TTC</TableHead>
                    <TableHead className="w-[7rem]">Statut</TableHead>
                    <TableHead className="w-[8.5rem]">Créé</TableHead>
                    <TableHead className="w-[19rem]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devis.map(d => {
                    const p = pastille(DEVIS_STATUT_META, d.statut)
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs font-semibold">{d.numero}</TableCell>
                        <TableCell className="max-w-[16rem]">
                          <p className="truncate font-medium" title={d.enseigneNom}>{d.enseigneNom}</p>
                          {d.contactEmail && (
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground" title={d.contactEmail}>
                              <Mail className="h-3 w-3 shrink-0" aria-hidden /> {d.contactEmail}
                            </p>
                          )}
                          {d.adhesionOfferte && (
                            <Badge variant="outline" className="mt-1 h-4 border-emerald-300 bg-emerald-50 px-1 text-[9px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                              adhésion offerte
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{nf0.format(d.nbStations)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("shrink-0 whitespace-nowrap text-[10px]", MODE_BADGE[d.modeFacturation] ?? "")}>
                            {PERIODICITE_META[d.modeFacturation]?.label ?? d.modeFacturation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums" title={`HT ${fmtDT3(d.montantHt)} · TVA ${fmtDT3(d.montantTva)}`}>
                          {fmtDT(d.montantTtc)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("shrink-0 whitespace-nowrap text-[11px] font-medium", p.className)}>
                            {p.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" title={new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d.createdAt))}>
                          {ilYA(d.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => reimprimer(d)}
                              aria-label={`Réimprimer le devis ${d.numero}`}
                            >
                              <Printer className="h-3.5 w-3.5" aria-hidden /> Réimprimer
                            </Button>
                            <Select
                              value={d.statut}
                              onValueChange={v => void changerStatut(d, v)}
                              disabled={patchId === d.id}
                            >
                              <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label={`Statut du devis ${d.numero}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DEVIS_STATUTS.map(s => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {pastille(DEVIS_STATUT_META, s).label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {!chargement && !erreur && devis.length > 0 && (
            <Separator className="my-3" />
          )}
          {!chargement && !erreur && devis.length > 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Les montants sont stockés en millimes et recalculés côté serveur à la création (TVA 19 %,
              arrondi au millime). « Réimprimer » régénère le PDF A4 depuis l&apos;enregistrement, sans
              recréer le devis — la traçabilité complète figure dans l&apos;onglet Audit (module Clients).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
