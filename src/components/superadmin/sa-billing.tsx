"use client"

// Super Administration — ② Abonnements & Facturation (Task B-1).
// Le moteur de revenu de CarbuScope SAS : génération mensuelle des factures
// (grille 40 DT/station/mois ou 400 DT/an, TVA 19 %, règlement à 30 jours),
// suivi des encaissements, relances, 636 abonnements stations pilotables.
// Identité graphite/violet : emerald = encaissé, amber = en attente, red = retard.
// Montants en millimes (1 DT = 1 000) — formatDT pour les factures, formatDTCourt pour les KPI.
// Task C-1 (Vague 3) : facture imprimable A4 (#facture-print → window.print, styles
// d'impression dans globals.css) + section « Relances & retards » (séniorité du retard,
// historique des relances parsé des notes, envoi via PATCH relancer).

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import {
  CONTRAT_STATUT_META, FACTURE_STATUT_META, MODE_PAIEMENT_META, PERIODICITE_META, pastille,
  formatDT, formatDTCourt, formatDTNombre, formatDate, formatInt, formatMois,
  type FactureDTO, type AbonnementDTO, type ContratDTO,
} from "@/lib/sa-types"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle, CHART_PALETTE, num } from "@/lib/chart"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts"
import {
  AlertTriangle, ArrowLeftRight, Ban, BellRing, Building2, Calculator, CalendarClock, CheckCircle2, Clock,
  Download, Eye, Fuel, Loader2, Pause, Percent, Play, Printer, Receipt, ReceiptText, RefreshCw, Search, Send, Zap,
} from "lucide-react"

// ---------------------------------------------------------------- utilitaires

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

/** « 2026-09 » → « sept. 26 » (axe du graphique, condensé). */
function formatMoisCourt(moisConcerne: string): string {
  const [y, m] = moisConcerne.split("-").map(Number)
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(new Date(y, m - 1, 1))
}

type FactureKpis = {
  total: number
  payees: number
  emises: number
  enRetard: number
  encaisseTtcMillimes: number
  enAttenteTtcMillimes: number
  enRetardTtcMillimes: number
  moisCourant: string
}

type FacturesResponse = { factures: FactureDTO[]; kpis: FactureKpis }

// Palette graphique : emerald = encaissé, prune = facturé (identité SA, pas de bleu).
const [EMERALD, , , PRUNE] = CHART_PALETTE

const JSON_HEADERS = { "Content-Type": "application/json" }

function FactureBadge({ statut }: { statut: string }) {
  const p = pastille(FACTURE_STATUT_META, statut)
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1.5 whitespace-nowrap text-[10px]", p.className)}>
      {p.point && <span className={cn("h-1.5 w-1.5 rounded-full", p.point)} aria-hidden />}
      {p.label}
    </Badge>
  )
}

function AbonnementStatutBadge({ statut }: { statut: string }) {
  const p = pastille(CONTRAT_STATUT_META, statut)
  return (
    <Badge variant="outline" className={cn("shrink-0 whitespace-nowrap text-[10px]", p.className)}>
      {p.point && <span className={cn("h-1.5 w-1.5 rounded-full", p.point)} aria-hidden />}
      {p.label}
    </Badge>
  )
}

const FACTURE_STATUTS = Object.keys(FACTURE_STATUT_META)
const FACTURE_STATUT_ORDRE = ["EN_RETARD", "EMISE", "PAYEE", "BROUILLON", "ANNULEE"]

// ---------------------------------------------- relances & impression (Task C-1)

/** Jours de retard d'une facture (0 si l'échéance n'est pas dépassée) — même formule partout. */
function joursRetard(f: FactureDTO): number {
  return Math.max(0, -Math.round((new Date(f.dateEcheance).getTime() - Date.now()) / 86400000))
}

/** Historique des relances, concaténé dans `notes` par l'API (« · Relance envoyée le 20/09/2026 »). */
const RELANCE_RE = /Relance envoyée le (\d{1,2}\/\d{1,2}\/\d{4})/g

function parseRelances(notes: string): { count: number; derniere: string | null } {
  const dates = Array.from(notes.matchAll(RELANCE_RE), (m) => m[1] ?? "").filter((d) => d.length > 0)
  return { count: dates.length, derniere: dates.length > 0 ? dates[dates.length - 1] : null }
}

/** Ligne de la section « Relances & retards » : facture dépassée + séniorité + relances déjà envoyées. */
type RetardRow = {
  facture: FactureDTO
  jours: number
  relances: { count: number; derniere: string | null }
}

/** Badge de séniorité du retard : ≥ 30 j rouge · 15–29 j ambre · < 15 j terracotta. */
function RetardBadge({ jours }: { jours: number }) {
  const cls = jours >= 30
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
    : jours >= 15
      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
      : "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
  return (
    <Badge variant="outline" className={cn("shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums", cls)}>
      {jours} j de retard
    </Badge>
  )
}

/**
 * Facture A4 imprimable (Task C-1) — rendu dans le div racine #facture-print, caché à
 * l'écran (Tailwind .hidden) et rempli avec la facture sélectionnée (même état que le
 * dialog de détail). Noir sur blanc — seule la marque « CarbuScope SAS » porte
 * l'émeraude #059669. Typographie ~10,5 pt et styles portés par le bloc
 * « --- Impression facture (Super Admin) --- » de globals.css ; à l'impression
 * (window.print) tout le reste de la page — dialog Radix compris — passe en
 * visibility:hidden pour n'imprimer que ce document.
 */
function FacturePrintDocument({ f, nomClient }: { f: FactureDTO; nomClient: string }) {
  const lignes = [...f.lignes].sort((a, b) => a.ordre - b.ordre)
  const dateLongue = (iso: string) => formatDate(iso, { day: "numeric", month: "long", year: "numeric" })
  return (
    <div className="bg-white text-black">
      {/* En-tête émetteur */}
      <div className="flex items-start justify-between gap-8 border-b-2 border-black pb-3">
        <div className="flex items-start gap-2.5">
          <Fuel className="fp-logo-icon mt-1 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="fp-logo">CarbuScope SAS</p>
            <p className="fp-sub">Éditeur de la plateforme CarbuScope — Observatoire du carburant Tunisie</p>
            <p className="fp-sub">Les Berges du Lac, Tunis · contact@carbuscope.tn · +216 71 000 000</p>
            <p className="fp-sub">Matricule fiscal TVA : 1234567A/M/000</p>
          </div>
        </div>
        <p className="fp-title shrink-0 pt-0.5">Facture</p>
      </div>

      {/* Bloc client + bloc méta */}
      <div className="flex items-stretch justify-between gap-5 py-3">
        <div className="w-[86mm] border border-black/60 p-3">
          <p className="fp-label">Facturé à</p>
          <p className="fp-strong mb-1 leading-snug">{nomClient}</p>
          <p className="fp-sub">Enseigne : {nomClient}</p>
          <p className="fp-sub">Référence contrat : {f.brandSlug}</p>
        </div>
        <dl className="w-[86mm] space-y-1 border border-black/60 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="fp-sub">Numéro de facture</dt>
            <dd className="fp-mono fp-strong text-right">{f.numero}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="fp-sub">Mois concerné</dt>
            <dd className="text-right">{formatMois(f.moisConcerne)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="fp-sub">Date d'émission</dt>
            <dd className="text-right">{dateLongue(f.dateEmission)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="fp-sub">Date d'échéance</dt>
            <dd className="text-right">{dateLongue(f.dateEcheance)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="fp-sub">Statut</dt>
            <dd className="fp-strong text-right">
              {FACTURE_STATUT_META[f.statut]?.label ?? f.statut}
              {f.statut === "EN_RETARD" ? ` — ${joursRetard(f)} j de retard` : ""}
            </dd>
          </div>
          {f.statut === "PAYEE" && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="fp-sub">Mode de règlement</dt>
              <dd className="text-right">
                {MODE_PAIEMENT_META[f.modePaiement ?? ""] ?? "—"}
                {f.datePaiement ? ` — le ${dateLongue(f.datePaiement)}` : ""}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Table des lignes */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="fp-th">
            <th className="fp-td border border-black/50 text-left font-semibold">Libellé</th>
            <th className="fp-td border border-black/50 text-right font-semibold">Qté</th>
            <th className="fp-td border border-black/50 text-right font-semibold">PU HT</th>
            <th className="fp-td border border-black/50 text-right font-semibold">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td className="fp-td border border-black/50 align-top">{l.libelle}</td>
              <td className="fp-td border border-black/50 text-right align-top tabular-nums">{formatInt(l.quantite)}</td>
              <td className="fp-td border border-black/50 text-right align-top tabular-nums">{formatDT(l.prixUnitaireMillimes)}</td>
              <td className="fp-td border border-black/50 text-right align-top font-semibold tabular-nums">{formatDT(l.montantHtMillimes)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totaux */}
      <div className="ml-auto mt-3 w-[86mm] space-y-1">
        <div className="flex items-baseline justify-between gap-4">
          <span>Total HT</span>
          <span className="tabular-nums">{formatDT(f.montantHtMillimes)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span>TVA (19 %)</span>
          <span className="tabular-nums">{formatDT(f.montantTvaMillimes)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t-2 border-black pt-1.5">
          <span className="font-bold">Total TTC</span>
          <span className="font-bold tabular-nums">{formatDT(f.montantTtcMillimes)}</span>
        </div>
      </div>

      {/* Conditions de règlement */}
      <div className="mt-5 space-y-1 border-t border-black/50 pt-2">
        <p className="fp-sub">Règlement par virement — RIB 08 000 000 0000000000 12 · Référence à rappeler : {f.numero}</p>
        <p className="fp-sub">Pénalités de retard : 1 % par mois entamé.</p>
      </div>

      {/* Pied de page honnête */}
      <p className="fp-footer mt-8 border-t border-black/40 pt-2 text-center">
        Document généré par CarbuScope — plateforme de démonstration
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- module ②

export function SaBilling() {
  // ---- factures : jeu global (KPI + graphique + encart TVA) et liste filtrée
  const [all, setAll] = useState<FacturesResponse | null>(null)
  const [clients, setClients] = useState<ContratDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [liste, setListe] = useState<FactureDTO[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [brand, setBrand] = useState("all")
  const [statut, setStatut] = useState("all")
  const [q, setQ] = useState("")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modePaiement, setModePaiement] = useState("VIREMENT")
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // ---- abonnements stations
  const [abo, setAbo] = useState<{ abonnements: AbonnementDTO[]; total: number } | null>(null)
  const [aboErr, setAboErr] = useState<string | null>(null)
  const [aboBrand, setAboBrand] = useState("all")
  const [aboPer, setAboPer] = useState("all")
  const [aboStatut, setAboStatut] = useState("all")
  const [aboQ, setAboQ] = useState("")
  const [aboBusyId, setAboBusyId] = useState<string | null>(null)

  // ---- relances & retards (Task C-1) : facture en cours de relance depuis la section dédiée
  const [busyRelanceId, setBusyRelanceId] = useState<string | null>(null)

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  // ------------------------------------------------------------- chargements
  const loadGlobal = useCallback(async (signal: AbortSignal) => {
    const [f, c] = await Promise.all([
      apiJson<FacturesResponse>("/api/super/factures", { signal }),
      apiJson<{ clients: ContratDTO[] }>("/api/super/clients", { signal }),
    ])
    setAll(f)
    setClients(c.clients)
    setError(null)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    loadGlobal(ac.signal).catch((e) => {
      if (!isAbort(e)) setError(errMsg(e))
    })
    return () => ac.abort()
  }, [loadGlobal, refreshKey])

  // Liste filtrée : fetch avec paramètres serveur (brand / statut / q), recherche débouncée.
  const loadListe = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams()
    if (brand !== "all") params.set("brand", brand)
    if (statut !== "all") params.set("statut", statut)
    if (q.trim()) params.set("q", q.trim())
    const d = await apiJson<FacturesResponse>(`/api/super/factures${params.toString() ? `?${params.toString()}` : ""}`, { signal })
    setListe(d.factures)
    setListError(null)
  }, [brand, statut, q])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => {
      loadListe(ac.signal).catch((e) => {
        if (!isAbort(e)) setListError(errMsg(e))
      })
    }, 250)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [loadListe, refreshKey])

  const fetchAbo = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: "1000" })
    if (aboBrand !== "all") params.set("brand", aboBrand)
    if (aboPer !== "all") params.set("periodicite", aboPer)
    if (aboStatut !== "all") params.set("statut", aboStatut)
    if (aboQ.trim()) params.set("q", aboQ.trim())
    const d = await apiJson<{ abonnements: AbonnementDTO[]; total: number }>(`/api/super/abonnements?${params.toString()}`, { signal })
    setAbo(d)
    setAboErr(null)
  }, [aboBrand, aboPer, aboStatut, aboQ])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => {
      fetchAbo(ac.signal).catch((e) => {
        if (!isAbort(e)) setAboErr(errMsg(e))
      })
    }, 250)
    return () => {
      clearTimeout(t)
      ac.abort()
    }
  }, [fetchAbo, refreshKey])

  // Reset du mode de paiement à l'ouverture d'une facture
  useEffect(() => {
    setModePaiement("VIREMENT")
  }, [selectedId])

  // ------------------------------------------------------------- dérivés
  const nomMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clients ?? []) {
      if (c.brandSlug) m.set(c.brandSlug, c.nomClient)
    }
    return m
  }, [clients])

  const brandOptions = useMemo(
    () => Array.from(new Set([...(clients ?? []).map((c) => c.brandSlug).filter((s): s is string => !!s)])).sort(),
    [clients],
  )

  const selected = useMemo(
    () => (liste ?? []).find((f) => f.id === selectedId) ?? null,
    [liste, selectedId],
  )

  const kpis = all?.kpis

  const tvaCollectee = useMemo(
    () => (all?.factures ?? []).filter((f) => f.statut === "PAYEE").reduce((s, f) => s + f.montantTvaMillimes, 0),
    [all],
  )

  /** CA TTC par mois — 12 derniers mois, séries encaissé (PAYEE) / facturé (hors annulées & brouillons), en DT. */
  const chartData = useMemo(() => {
    if (!all) return []
    const map = new Map<string, { facture: number; encaisse: number }>()
    for (const f of all.factures) {
      if (f.statut === "ANNULEE" || f.statut === "BROUILLON") continue
      const e = map.get(f.moisConcerne) ?? { facture: 0, encaisse: 0 }
      e.facture += f.montantTtcMillimes
      if (f.statut === "PAYEE") e.encaisse += f.montantTtcMillimes
      map.set(f.moisConcerne, e)
    }
    return Array.from(map.keys()).sort().slice(-12).map((m) => ({
      mois: m,
      label: formatMoisCourt(m),
      encaisse: Math.round((map.get(m)?.encaisse ?? 0) / 1000),
      facture: Math.round((map.get(m)?.facture ?? 0) / 1000),
    }))
  }, [all])

  /** Chiffres réels du mois courant pour l'encart pédagogique TVA. */
  const tvaMois = useMemo(() => {
    const fs = (all?.factures ?? []).filter(
      (f) => f.moisConcerne === all?.kpis.moisCourant && f.statut !== "ANNULEE" && f.statut !== "BROUILLON",
    )
    return {
      nb: fs.length,
      ht: fs.reduce((s, f) => s + f.montantHtMillimes, 0),
      tva: fs.reduce((s, f) => s + f.montantTvaMillimes, 0),
      ttc: fs.reduce((s, f) => s + f.montantTtcMillimes, 0),
    }
  }, [all])

  const aboCompteurs = useMemo(() => {
    const list = abo?.abonnements ?? []
    return {
      mensuels: list.filter((a) => a.periodicite === "MENSUEL" && a.statut === "ACTIF").length,
      annuels: list.filter((a) => a.periodicite === "ANNUEL" && a.statut === "ACTIF").length,
      suspendus: list.filter((a) => a.statut === "SUSPENDU").length,
      resilie: list.filter((a) => a.statut === "RESILIE").length,
    }
  }, [abo])

  /** Factures en retard (jeu global, insensible aux filtres de la liste) — séniorité + relances envoyées. */
  const retards = useMemo<RetardRow[]>(() => {
    if (!all) return []
    const now = Date.now()
    return all.factures
      .filter((f) => f.statut === "EN_RETARD")
      .map((f) => ({
        facture: f,
        jours: Math.max(0, -Math.round((new Date(f.dateEcheance).getTime() - now) / 86400000)),
        relances: parseRelances(f.notes),
      }))
      .sort((a, b) => b.jours - a.jours || b.facture.montantTtcMillimes - a.facture.montantTtcMillimes)
  }, [all])

  // ------------------------------------------------------------- mutations
  const generer = async () => {
    setGenerating(true)
    try {
      const r = await apiJson<{ creees: number; mois: string }>("/api/super/factures", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action: "generer" }),
      })
      if (r.creees > 0) {
        toast.success(`${r.creees} facture${r.creees > 1 ? "s" : ""} émise${r.creees > 1 ? "s" : ""}`, {
          description: `Génération pour ${formatMois(r.mois)} — grille 40 DT/station/mois · 400 DT/an, TVA 19 %, échéance à 30 jours.`,
        })
      } else {
        toast.info("Facturation déjà à jour", {
          description: `Aucune facture manquante pour ${formatMois(r.mois)} — tous les clients actifs ont déjà été facturés ce mois.`,
        })
      }
      bump()
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "billing-generation" } }))
    } catch (e) {
      toast.error("Génération impossible", { description: errMsg(e) })
    } finally {
      setGenerating(false)
    }
  }

  /** Applique une action facture (payer | relancer | annuler) puis synchronise l'état local. */
  const factureAction = async (f: FactureDTO, action: "payer" | "relancer" | "annuler", body: Record<string, string>) => {
    setBusyAction(action)
    try {
      const r = await apiJson<{ facture: FactureDTO }>(`/api/super/factures?id=${f.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action, ...body }),
      })
      setListe((prev) => (prev ? prev.map((x) => (x.id === r.facture.id ? r.facture : x)) : prev))
      if (action === "payer") {
        toast.success(`Facture ${r.facture.numero} encaissée`, {
          description: `${MODE_PAIEMENT_META[r.facture.modePaiement ?? "VIREMENT"]} — ${formatDTCourt(r.facture.montantTtcMillimes)} TTC.`,
        })
      } else if (action === "relancer") {
        const retard = joursRetard(r.facture)
        toast.success(`Relance envoyée pour ${r.facture.numero}`, {
          description: `Le client a été notifié${retard > 0 ? ` — retard de ${retard} jour${retard > 1 ? "s" : ""}` : ""}.`,
        })
      } else {
        toast.success(`Facture ${r.facture.numero} annulée`, {
          description: "La facture passe au statut « Annulée » — un avoir pourra être émis si nécessaire.",
        })
      }
      bump()
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "billing-factures" } }))
    } catch (e) {
      toast.error("Action impossible", { description: errMsg(e) })
    } finally {
      setBusyAction(null)
    }
  }

  const mutateAbo = async (a: AbonnementDTO, body: { periodicite?: string; statut?: string }, msg: { title: string; desc: string }) => {
    setAboBusyId(a.id)
    try {
      await apiJson<{ abonnement: AbonnementDTO }>(`/api/super/abonnements?id=${a.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      })
      toast.success(msg.title, { description: msg.desc })
      await fetchAbo().catch(() => undefined)
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "billing-abonnements" } }))
    } catch (e) {
      toast.error("Modification impossible", { description: errMsg(e) })
    } finally {
      setAboBusyId(null)
    }
  }

  const toggleFormule = (a: AbonnementDTO) => {
    const cible = a.periodicite === "MENSUEL" ? "ANNUEL" : "MENSUEL"
    mutateAbo(
      a,
      { periodicite: cible },
      {
        title: "Formule modifiée, tarif recalculé",
        desc: `${a.stationCode} — ${a.stationNom} passe en ${cible === "MENSUEL" ? "mensuel (40 DT/mois)" : "annuel (400 DT/an)"} à la prochaine échéance.`,
      },
    )
  }

  const toggleAboStatut = (a: AbonnementDTO) => {
    const cible = a.statut === "ACTIF" ? "SUSPENDU" : "ACTIF"
    mutateAbo(
      a,
      { statut: cible },
      {
        title: cible === "SUSPENDU" ? "Abonnement suspendu" : "Abonnement réactivé",
        desc: `${a.stationCode} — ${a.stationNom}${cible === "SUSPENDU" ? " (n'est plus facturé)" : " (facturation reprise)"}.`,
      },
    )
  }

  /** Ouvre le dialog de détail puis lance l'impression navigateur de la facture A4 (Task C-1). */
  const ouvrirEtImprimer = useCallback((f: FactureDTO) => {
    setSelectedId(f.id)
    setTimeout(() => window.print(), 150)
  }, [])

  /** Relance depuis la section « Relances & retards » : PATCH relancer → toast + refresh (via factureAction). */
  const relancerDepuisRetards = async (r: RetardRow) => {
    setBusyRelanceId(r.facture.id)
    try {
      await factureAction(r.facture, "relancer", {})
    } finally {
      setBusyRelanceId(null)
    }
  }

  // ------------------------------------------------------------- colonnes factures
  const factureColumns: DataViewColumn<FactureDTO>[] = [
    {
      key: "numero", header: "Numéro",
      sortValue: (f) => f.numero,
      render: (f) => (
        <div className="min-w-[170px]">
          <p className="font-mono text-xs font-semibold leading-tight">{f.numero}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{nomMap.get(f.brandSlug) ?? f.brandSlug}</p>
        </div>
      ),
    },
    {
      key: "mois", header: "Mois",
      sortValue: (f) => f.moisConcerne,
      render: (f) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatMois(f.moisConcerne)}</span>,
    },
    {
      key: "emission", header: "Émission",
      sortValue: (f) => new Date(f.dateEmission).getTime(),
      render: (f) => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{formatDate(f.dateEmission)}</span>,
    },
    {
      key: "echeance", header: "Échéance",
      sortValue: (f) => new Date(f.dateEcheance).getTime(),
      render: (f) => {
        const retard = f.statut === "EN_RETARD" ? joursRetard(f) : null
        return (
          <div className="whitespace-nowrap text-xs">
            <span className="tabular-nums text-muted-foreground">{formatDate(f.dateEcheance)}</span>
            {retard !== null && (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">retard {retard} j</p>
            )}
          </div>
        )
      },
    },
    {
      key: "ttc", header: "Montant TTC", align: "right",
      sortValue: (f) => f.montantTtcMillimes,
      render: (f) => <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatDTCourt(f.montantTtcMillimes)}</span>,
    },
    {
      key: "ht", header: "HT", align: "right", hideInCards: true,
      sortValue: (f) => f.montantHtMillimes,
      render: (f) => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{formatDTCourt(f.montantHtMillimes)}</span>,
    },
    {
      key: "tva", header: "TVA", align: "right", hideInCards: true,
      sortValue: (f) => f.montantTvaMillimes,
      render: (f) => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{formatDTCourt(f.montantTvaMillimes)}</span>,
    },
    {
      key: "statut", header: "Statut",
      sortValue: (f) => FACTURE_STATUT_ORDRE.indexOf(f.statut),
      render: (f) => <FactureBadge statut={f.statut} />,
    },
    {
      key: "paiement", header: "Paiement",
      render: (f) => (
        <div className="whitespace-nowrap text-xs">
          {f.modePaiement ? (
            <>
              <p>{MODE_PAIEMENT_META[f.modePaiement] ?? f.modePaiement}</p>
              {f.datePaiement && <p className="text-[11px] text-muted-foreground">{formatDate(f.datePaiement)}</p>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: "actions", header: "", align: "right", hideInCards: true,
      render: (f) => (
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                aria-label={`Imprimer la facture ${f.numero}`}
                onClick={() => ouvrirEtImprimer(f)}
              >
                <Printer className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Imprimer / PDF — facture A4</TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label={`Ouvrir le détail de la facture ${f.numero}`}
            onClick={() => setSelectedId(f.id)}
          >
            <Eye className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ),
    },
  ]

  // ------------------------------------------------------------- colonnes abonnements
  const aboColumns: DataViewColumn<AbonnementDTO>[] = [
    {
      key: "station", header: "Station",
      sortValue: (a) => a.stationCode,
      render: (a) => (
        <div className="min-w-[200px]">
          <p className="font-mono text-xs font-semibold leading-tight">{a.stationCode}</p>
          <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-muted-foreground" title={a.stationNom}>{a.stationNom}</p>
        </div>
      ),
    },
    {
      key: "brand", header: "Enseigne",
      sortValue: (a) => a.brandSlug,
      render: (a) => <span className="text-xs font-medium">{a.brandSlug}</span>,
    },
    {
      key: "formule", header: "Formule",
      sortValue: (a) => a.periodicite,
      render: (a) => (
        <Badge variant="outline" className={cn("whitespace-nowrap text-[11px] font-medium", PERIODICITE_META[a.periodicite]?.classe)}>
          {PERIODICITE_META[a.periodicite]?.label ?? a.periodicite} · {formatDTCourt(a.prixMillimes)}
        </Badge>
      ),
    },
    {
      key: "pu", header: "Prix", align: "right",
      sortValue: (a) => a.prixMillimes,
      render: (a) => (
        <span className="whitespace-nowrap text-xs tabular-nums">
          {formatDTCourt(a.prixMillimes)}<span className="text-muted-foreground"> /{a.periodicite === "MENSUEL" ? "mois" : "an"}</span>
        </span>
      ),
    },
    {
      key: "debut", header: "Depuis",
      sortValue: (a) => new Date(a.dateDebut).getTime(),
      render: (a) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(a.dateDebut)}</span>,
    },
    {
      key: "statut", header: "Statut",
      sortValue: (a) => a.statut,
      render: (a) => <AbonnementStatutBadge statut={a.statut} />,
    },
    {
      key: "actions", header: "Actions", align: "right", hideInCards: false,
      render: (a) => {
        const busy = aboBusyId === a.id
        return (
          <div className="flex justify-end gap-1">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" aria-label="Modification en cours" />
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      disabled={a.statut === "RESILIE"}
                      aria-label={`Basculer la formule de ${a.stationNom}`}
                      onClick={() => toggleFormule(a)}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Passer en {a.periodicite === "MENSUEL" ? "annuel — 400 DT/an" : "mensuel — 40 DT/mois"} · tarif recalculé à la prochaine échéance.
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      aria-label={a.statut === "ACTIF" ? `Suspendre l'abonnement de ${a.stationNom}` : `Réactiver l'abonnement de ${a.stationNom}`}
                      onClick={() => toggleAboStatut(a)}
                    >
                      {a.statut === "ACTIF"
                        ? <Pause className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                        : <Play className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{a.statut === "ACTIF" ? "Suspendre l'abonnement (facturation interrompue)." : "Réactiver l'abonnement (facturation reprise)."}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        )
      },
    },
  ]

  // ------------------------------------------------------------- colonnes relances & retards
  const relanceColumns: DataViewColumn<RetardRow>[] = [
    {
      key: "facture", header: "Facture",
      sortValue: (r) => r.facture.numero,
      render: (r) => (
        <div className="min-w-[180px]">
          <p className="font-mono text-xs font-semibold leading-tight">{r.facture.numero}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {nomMap.get(r.facture.brandSlug) ?? r.facture.clientNom ?? r.facture.brandSlug}
          </p>
        </div>
      ),
    },
    {
      key: "echeance", header: "Échéance",
      sortValue: (r) => new Date(r.facture.dateEcheance).getTime(),
      render: (r) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{formatDate(r.facture.dateEcheance)}</span>
      ),
    },
    {
      key: "retard", header: "Retard",
      sortValue: (r) => r.jours,
      render: (r) => <RetardBadge jours={r.jours} />,
    },
    {
      key: "ttc", header: "Montant TTC", align: "right",
      sortValue: (r) => r.facture.montantTtcMillimes,
      render: (r) => (
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
          {formatDTCourt(r.facture.montantTtcMillimes)}
        </span>
      ),
    },
    {
      key: "relances", header: "Relances envoyées",
      sortValue: (r) => r.relances.count,
      render: (r) => r.relances.count > 0 ? (
        <div className="text-xs leading-snug">
          <p className="font-semibold text-violet-700 dark:text-violet-400">
            {r.relances.count} relance{r.relances.count > 1 ? "s" : ""} envoyée{r.relances.count > 1 ? "s" : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">dernière le {r.relances.derniere}</p>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">aucune</span>
      ),
    },
    {
      key: "actions", header: "", align: "right",
      render: (r) => {
        const busy = busyRelanceId === r.facture.id
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 whitespace-nowrap border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
            disabled={busy || busyAction === "relancer"}
            aria-label={`Envoyer la relance pour la facture ${r.facture.numero}`}
            onClick={() => relancerDepuisRetards(r)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
            Envoyer la relance
          </Button>
        )
      },
    },
  ]

  const loading = all === null && error === null
  const selectedCanPayer = selected?.statut === "EMISE" || selected?.statut === "EN_RETARD"
  const selectedCanAnnuler = selected && selected.statut !== "PAYEE" && selected.statut !== "ANNULEE"

  // ------------------------------------------------------------- rendu
  return (
    <div className="space-y-4">
      {/* ---------- hero : générer les factures du mois ---------- */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 via-background to-background dark:border-violet-900 dark:from-violet-950/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
              <Receipt className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Facturation & abonnements — CarbuScope SAS</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Facturation mensuelle des clients actifs, TVA 19 %, règlement à 30 jours
                {kpis ? ` · mois courant : ${formatMois(kpis.moisCourant)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
              disabled={loading}
              title="Télécharger toutes les factures (HT/TVA/TTC en millimes, règlements, relances) au format CSV — séparateur « ; », dates ISO."
              aria-label="Exporter les factures au format CSV"
              onClick={() => { window.location.href = "/api/super/export?type=factures" }}
            >
              <Download className="h-4 w-4" aria-hidden /> Exporter CSV
            </Button>
            <Button onClick={generer} disabled={generating} className="bg-violet-600 text-white hover:bg-violet-700">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
              Générer les factures du mois
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- 5 KPI ---------- */}
      <section aria-label="Indicateurs de facturation" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {loading || !kpis ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Encaissé TTC"
              value={formatDTCourt(kpis.encaisseTtcMillimes)}
              icon={CheckCircle2}
              tone="success"
              sub={`${formatInt(kpis.payees)} factures réglées`}
            />
            <KpiCard
              label="En attente (émises)"
              value={formatDTCourt(kpis.enAttenteTtcMillimes)}
              icon={Clock}
              tone="info"
              sub={`${formatInt(kpis.emises)} factures à régler`}
            />
            <KpiCard
              label="En retard"
              value={kpis.enRetardTtcMillimes > 0 ? formatDTCourt(kpis.enRetardTtcMillimes) : "0 DT"}
              icon={AlertTriangle}
              tone={kpis.enRetard > 0 ? "danger" : "default"}
              sub={kpis.enRetard > 0 ? `${formatInt(kpis.enRetard)} facture(s) à relancer` : "aucun retard"}
            />
            <KpiCard
              label="TVA collectée"
              value={formatDTCourt(tvaCollectee)}
              icon={Percent}
              sub="19 % sur les factures réglées"
            />
            <KpiCard
              label="Factures au total"
              value={formatInt(kpis.total)}
              icon={ReceiptText}
              sub={`tous statuts · ${formatMois(kpis.moisCourant)} courant`}
            />
          </>
        )}
      </section>

      {error && (
        <Card className="border-red-300 dark:border-red-900">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={bump}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------- graphique CA + encart TVA ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Évolution du CA TTC</CardTitle>
            <CardDescription>12 derniers mois — CA encaissé (payées) vs CA facturé (émises + en retard), hors annulées.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || chartData.length === 0 ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <div className="h-64" role="img" aria-label="Graphique du chiffre d'affaires TTC par mois">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradEncaisse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={EMERALD} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradFacture" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PRUNE} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={PRUNE} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} tickLine={false} dy={4} />
                    <YAxis
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v) => (v === 0 ? "0" : `${num(v / 1000)} k`)}
                    />
                    <RTooltip
                      contentStyle={tooltipStyle()}
                      formatter={(v) => `${formatDTNombre(Number(v))} TTC`}
                      labelFormatter={(l) => String(l)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                    <Area type="monotone" dataKey="facture" name="Facturé TTC" stroke={PRUNE} strokeWidth={2} fill="url(#gradFacture)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="encaisse" name="Encaissé TTC" stroke={EMERALD} strokeWidth={2} fill="url(#gradEncaisse)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------- encart pédagogique TVA ---------- */}
        <Card className="border-violet-200 dark:border-violet-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              La mécanique TVA 19 %
            </CardTitle>
            <CardDescription>Comment se construit chaque facture CarbuScope</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Les abonnements sont facturés <strong className="text-foreground">hors taxes</strong> —
              40 DT/station/mois ou 400 DT/station/an — puis la TVA de 19 % s'ajoute.
              Le client règle le TTC ; l'adhésion de 6 000 DT (facturée le premier mois) suit la même mécanique.
            </p>
            {loading || !kpis ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Base HT facturée — {formatMois(kpis.moisCourant)}</span>
                  <span className="font-semibold tabular-nums">{formatDT(tvaMois.ht)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Percent className="h-3 w-3" aria-hidden /> TVA 19 %
                  </span>
                  <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">+ {formatDT(tvaMois.tva)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Total TTC dû par les clients</span>
                  <span className="font-bold tabular-nums text-violet-700 dark:text-violet-400">{formatDT(tvaMois.ttc)}</span>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {tvaMois.nb} facture(s) émise(s) ce mois. La TVA collectée est déclarée sur les règlements
                  ({formatDTCourt(tvaCollectee)} encaissés à ce jour).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- section relances & retards (Task C-1) ---------- */}
      <Card className={retards.length > 0 ? "border-red-200 dark:border-red-900" : "border-emerald-200 dark:border-emerald-900"}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing
                  className={cn("h-4 w-4", retards.length > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}
                  aria-hidden
                />
                Relances &amp; retards
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Factures ayant dépassé leur échéance de règlement (30 jours) — séniorité du retard,
                relances déjà envoyées et envoi d'une nouvelle relance.
              </CardDescription>
            </div>
            {retards.length > 0 && (
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums leading-tight text-red-600 dark:text-red-400">
                  {formatDT(retards.reduce((s, r) => s + r.facture.montantTtcMillimes, 0))} TTC en retard
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatInt(retards.length)} facture{retards.length > 1 ? "s" : ""} · plus ancien : {retards[0].jours} j
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : retards.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Aucun retard — encaissement à jour ✓
              </p>
              <p className="text-xs text-muted-foreground">
                Aucune facture n'a dépassé son échéance de 30 jours.
              </p>
            </div>
          ) : (
            <>
              <DataViews
                viewKey="sa-relances"
                columns={relanceColumns}
                rows={retards}
                rowKey={(r) => r.facture.id}
                maxHeightClassName="max-h-96"
                emptyMessage="Aucune facture en retard."
                onRowClick={(r) => setSelectedId(r.facture.id)}
                renderCard={(r) => (
                  <Card
                    className={cn(
                      "border-l-4 transition-shadow hover:shadow-md",
                      r.jours >= 30 ? "border-l-red-500" : r.jours >= 15 ? "border-l-amber-500" : "border-l-orange-400",
                    )}
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold leading-tight">{r.facture.numero}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {nomMap.get(r.facture.brandSlug) ?? r.facture.clientNom ?? r.facture.brandSlug}
                          </p>
                        </div>
                        <RetardBadge jours={r.jours} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Montant TTC</p>
                          <p className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
                            {formatDTCourt(r.facture.montantTtcMillimes)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">éch. {formatDate(r.facture.dateEcheance)}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Relances</p>
                          <p className="text-sm font-semibold leading-tight">
                            {r.relances.count > 0 ? `${r.relances.count} envoyée${r.relances.count > 1 ? "s" : ""}` : "aucune"}
                          </p>
                          {r.relances.derniere && (
                            <p className="text-[10px] text-muted-foreground">dernière le {r.relances.derniere}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-full border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                        disabled={busyRelanceId === r.facture.id || busyAction === "relancer"}
                        aria-label={`Envoyer la relance pour la facture ${r.facture.numero}`}
                        onClick={() => relancerDepuisRetards(r)}
                      >
                        {busyRelanceId === r.facture.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          : <Send className="h-3.5 w-3.5" aria-hidden />}
                        Envoyer la relance
                      </Button>
                    </CardContent>
                  </Card>
                )}
              />
              <p className="text-xs leading-snug text-muted-foreground">
                Envoi simulé en démonstration — chaque relance est tracée dans le journal d'audit (onglet Audit).
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- liste des factures ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                Factures
              </CardTitle>
              <CardDescription>
                {liste === null
                  ? "Chargement des factures…"
                  : `${formatInt(liste.length)} facture(s) affichée(s) — clique sur une ligne pour le détail, le règlement ou la relance.`}
              </CardDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger size="sm" className="w-[190px]" aria-label="Filtrer par enseigne">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les enseignes</SelectItem>
                {brandOptions.map((b) => (
                  <SelectItem key={b} value={b}>{nomMap.get(b) ?? b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statut} onValueChange={setStatut}>
              <SelectTrigger size="sm" className="w-[150px]" aria-label="Filtrer par statut de facture">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {FACTURE_STATUTS.map((s) => (
                  <SelectItem key={s} value={s}>{FACTURE_STATUT_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un numéro de facture…"
                className="h-8 pl-8 text-xs"
                aria-label="Rechercher une facture par numéro"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {liste === null && !listError ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : listError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {listError}
              </p>
              <Button variant="outline" size="sm" onClick={bump}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
              </Button>
            </div>
          ) : (
            <DataViews
              viewKey="sa-factures"
              columns={factureColumns}
              rows={liste ?? []}
              rowKey={(f) => f.id}
              emptyMessage="Aucune facture ne correspond à ces filtres."
              onRowClick={(f) => setSelectedId(f.id)}
              nested={{
                groupKey: (f) => f.statut,
                groupLabel: (gk, rows) => (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <FactureBadge statut={gk} />
                    <span className="text-xs font-normal text-primary/70">
                      {rows.length} facture{rows.length > 1 ? "s" : ""} · {formatDTCourt(rows.reduce((s, f) => s + f.montantTtcMillimes, 0))} TTC
                    </span>
                  </span>
                ),
                groupSortValue: (gk) => FACTURE_STATUT_ORDRE.indexOf(gk),
                hideColumnKeyInGroups: "statut",
                defaultOpen: "first",
              }}
              renderCard={(f) => (
                <Card className={cn(
                  "border-l-4 transition-shadow hover:shadow-md",
                  f.statut === "EN_RETARD" ? "border-l-red-500" : f.statut === "PAYEE" ? "border-l-emerald-500" : "border-l-violet-500",
                )}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold leading-tight">{f.numero}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{nomMap.get(f.brandSlug) ?? f.brandSlug}</p>
                      </div>
                      <FactureBadge statut={f.statut} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Montant TTC</p>
                        <p className="text-sm font-bold tabular-nums">{formatDTCourt(f.montantTtcMillimes)}</p>
                        <p className="text-[10px] text-muted-foreground">dont TVA {formatDTCourt(f.montantTvaMillimes)}</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Mois</p>
                        <p className="text-sm font-semibold leading-tight">{formatMois(f.moisConcerne)}</p>
                        <p className="text-[10px] text-muted-foreground">éch. {formatDate(f.dateEcheance)}</p>
                      </div>
                    </div>
                    {f.statut === "EN_RETARD" && (
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        En retard — relance recommandée
                      </p>
                    )}
                    {f.modePaiement && f.datePaiement && (
                      <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        {MODE_PAIEMENT_META[f.modePaiement] ?? f.modePaiement} — {formatDate(f.datePaiement)}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 min-w-0 flex-1" onClick={() => setSelectedId(f.id)}>
                        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden /> Détail de la facture
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-9 shrink-0 border-violet-200 p-0 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
                            aria-label={`Imprimer la facture ${f.numero}`}
                            onClick={() => ouvrirEtImprimer(f)}
                          >
                            <Printer className="h-4 w-4" aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Imprimer / PDF — facture A4</TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* ---------- section abonnements stations ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Fuel className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                Abonnements stations
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Chaque station paie son abonnement — 40 DT/mois ou 400 DT/an. La formule est modifiable
                à tout moment, le tarif est recalculé à la prochaine échéance.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                {formatInt(aboCompteurs.mensuels)} mensuels
              </Badge>
              <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
                {formatInt(aboCompteurs.annuels)} annuels
              </Badge>
              {aboCompteurs.suspendus > 0 && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                  {formatInt(aboCompteurs.suspendus)} suspendus
                </Badge>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={aboBrand} onValueChange={setAboBrand}>
              <SelectTrigger size="sm" className="w-[170px]" aria-label="Filtrer les abonnements par enseigne">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les enseignes</SelectItem>
                {brandOptions.map((b) => (
                  <SelectItem key={b} value={b}>{nomMap.get(b) ?? b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={aboPer} onValueChange={setAboPer}>
              <SelectTrigger size="sm" className="w-[150px]" aria-label="Filtrer les abonnements par formule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les formules</SelectItem>
                <SelectItem value="MENSUEL">Mensuel — 40 DT/mois</SelectItem>
                <SelectItem value="ANNUEL">Annuel — 400 DT/an</SelectItem>
              </SelectContent>
            </Select>
            <Select value={aboStatut} onValueChange={setAboStatut}>
              <SelectTrigger size="sm" className="w-[150px]" aria-label="Filtrer les abonnements par statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="ACTIF">Actifs</SelectItem>
                <SelectItem value="SUSPENDU">Suspendus</SelectItem>
                <SelectItem value="RESILIE">Résiliés</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={aboQ}
                onChange={(e) => setAboQ(e.target.value)}
                placeholder="Rechercher une station (code, nom)…"
                className="h-8 pl-8 text-xs"
                aria-label="Rechercher un abonnement par station"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {abo === null && !aboErr ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : aboErr ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {aboErr}
              </p>
              <Button variant="outline" size="sm" onClick={() => fetchAbo().catch((e) => setAboErr(errMsg(e)))}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
              </Button>
            </div>
          ) : abo ? (
            <>
              <DataViews
                viewKey="sa-abonnements"
                columns={aboColumns}
                rows={abo.abonnements}
                rowKey={(a) => a.id}
                maxHeightClassName="max-h-96"
                emptyMessage="Aucun abonnement ne correspond à ces filtres."
                nested={{
                  groupKey: (a) => a.brandSlug,
                  groupLabel: (gk, rows) => {
                    const mens = rows.filter((a) => a.periodicite === "MENSUEL" && a.statut === "ACTIF").length
                    const ann = rows.filter((a) => a.periodicite === "ANNUEL" && a.statut === "ACTIF").length
                    return (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="truncate">{nomMap.get(gk) ?? gk}</span>
                        <span className="text-xs font-normal text-primary/70">
                          {rows.length} station{rows.length > 1 ? "s" : ""} · {mens} mens. · {ann} ann.
                        </span>
                      </span>
                    )
                  },
                  groupSortValue: (gk, rows) => rows.length,
                  hideColumnKeyInGroups: "brand",
                  defaultOpen: "first",
                }}
                renderCard={(a) => (
                  <Card className="border-l-4 border-l-violet-400 transition-shadow hover:shadow-md">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold leading-tight">{a.stationCode}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={a.stationNom}>{a.stationNom}</p>
                        </div>
                        <AbonnementStatutBadge statut={a.statut} />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <Badge variant="outline" className={cn("text-[11px] font-medium", PERIODICITE_META[a.periodicite]?.classe)}>
                          {PERIODICITE_META[a.periodicite]?.label ?? a.periodicite} · {formatDTCourt(a.prixMillimes)}
                        </Badge>
                        <span className="text-muted-foreground">depuis {formatDate(a.dateDebut)} · {nomMap.get(a.brandSlug) ?? a.brandSlug}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {aboBusyId === a.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-violet-500" aria-label="Modification en cours" />
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 flex-1 border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
                              disabled={a.statut === "RESILIE"}
                              onClick={() => toggleFormule(a)}
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                              {a.periodicite === "MENSUEL" ? "Passer en annuel" : "Passer en mensuel"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              aria-label={a.statut === "ACTIF" ? `Suspendre l'abonnement de ${a.stationNom}` : `Réactiver l'abonnement de ${a.stationNom}`}
                              onClick={() => toggleAboStatut(a)}
                            >
                              {a.statut === "ACTIF"
                                ? <Pause className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                                : <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {formatInt(abo.abonnements.length)} abonnement(s) affiché(s) sur {formatInt(abo.total)} correspondant aux filtres
                — les MRR et factures se recalculent à la prochaine génération mensuelle.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------- dialog : détail facture ---------- */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2.5 font-mono text-base">
                  {selected.numero}
                  <FactureBadge statut={selected.statut} />
                </DialogTitle>
                <DialogDescription>
                  {nomMap.get(selected.brandSlug) ?? selected.brandSlug} · {formatMois(selected.moisConcerne)} ·
                  émise le {formatDate(selected.dateEmission, { day: "numeric", month: "long", year: "numeric" })}
                </DialogDescription>
              </DialogHeader>

              {/* repères de règlement */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <CalendarClock className="h-3 w-3" aria-hidden /> Échéance
                  </p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums">{formatDate(selected.dateEcheance)}</p>
                  {selected.statut === "EN_RETARD" && (
                    <p className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                      retard {joursRetard(selected)} j
                    </p>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3 w-3" aria-hidden /> Enseigne
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold">{nomMap.get(selected.brandSlug) ?? selected.brandSlug}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden /> Paiement
                  </p>
                  {selected.datePaiement ? (
                    <p className="mt-0.5 text-xs font-semibold">
                      {MODE_PAIEMENT_META[selected.modePaiement ?? ""] ?? "—"}
                      <span className="block text-[10px] font-normal text-muted-foreground">{formatDate(selected.datePaiement)}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">en attente</p>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 p-2.5">
                  <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <ReceiptText className="h-3 w-3" aria-hidden /> Lignes
                  </p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums">{formatInt(selected.lignes.length)} ligne(s)</p>
                </div>
              </div>

              {/* lignes de facture */}
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="h-8 text-primary">Désignation</TableHead>
                      <TableHead className="h-8 text-right text-primary">Qté</TableHead>
                      <TableHead className="h-8 text-right text-primary">PU HT</TableHead>
                      <TableHead className="h-8 text-right text-primary">Montant HT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...selected.lignes].sort((a, b) => a.ordre - b.ordre).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="max-w-[320px] py-2 text-xs leading-snug">{l.libelle}</TableCell>
                        <TableCell className="py-2 text-right text-xs tabular-nums text-muted-foreground">{formatInt(l.quantite)}</TableCell>
                        <TableCell className="py-2 text-right text-xs tabular-nums">{formatDT(l.prixUnitaireMillimes)}</TableCell>
                        <TableCell className="py-2 text-right text-xs font-semibold tabular-nums">{formatDT(l.montantHtMillimes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* totaux */}
              <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Total HT</span>
                  <span className="font-semibold tabular-nums">{formatDT(selected.montantHtMillimes)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">TVA 19 %</span>
                  <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">+ {formatDT(selected.montantTvaMillimes)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">Total TTC</span>
                  <span className={cn(
                    "text-base font-bold tabular-nums",
                    selected.statut === "PAYEE" ? "text-emerald-600 dark:text-emerald-400" : "text-violet-700 dark:text-violet-400",
                  )}>
                    {formatDT(selected.montantTtcMillimes)}
                  </span>
                </div>
              </div>

              {selected.notes && (
                <p className="border-l-2 border-violet-300 pl-2.5 text-xs italic leading-relaxed text-muted-foreground dark:border-violet-700">
                  {selected.notes}
                </p>
              )}

              {/* actions selon le statut */}
              <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                {selectedCanPayer ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="mode-paiement" className="text-[11px] text-muted-foreground">Mode de règlement</Label>
                      <Select value={modePaiement} onValueChange={setModePaiement}>
                        <SelectTrigger id="mode-paiement" size="sm" className="h-8 w-[150px]" aria-label="Mode de règlement">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(MODE_PAIEMENT_META).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={busyAction !== null}
                      onClick={() => factureAction(selected, "payer", { modePaiement })}
                    >
                      {busyAction === "payer"
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                      Marquer payée — {formatDTCourt(selected.montantTtcMillimes)}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    {selected.statut === "PAYEE"
                      ? "Facture réglée — aucune action de règlement disponible."
                      : selected.statut === "ANNULEE"
                        ? "Facture annulée — un avoir peut être émis si nécessaire."
                        : "Facture en brouillon — générez le mois pour l'émettre."}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
                    onClick={() => setTimeout(() => window.print(), 150)}
                  >
                    <Printer className="h-4 w-4" aria-hidden />
                    Imprimer / PDF
                  </Button>
                  {selectedCanPayer && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                      disabled={busyAction !== null}
                      onClick={() => factureAction(selected, "relancer", {})}
                    >
                      {busyAction === "relancer"
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        : <Send className="h-4 w-4" aria-hidden />}
                      Envoyer relance
                    </Button>
                  )}
                  {selectedCanAnnuler && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                          disabled={busyAction !== null}
                        >
                          <Ban className="h-4 w-4" aria-hidden /> Annuler la facture
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Annuler la facture {selected.numero} ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            La facture de {formatDTCourt(selected.montantTtcMillimes)} TTC passera au statut « Annulée »
                            et sortira des relances. Un avoir pourra être émis le cas échéant. Action sensible, tracée
                            dans la piste d'audit.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Retour</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => factureAction(selected, "annuler", {})}
                          >
                            Confirmer l'annulation
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </DialogFooter>
            </>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Facture introuvable dans la sélection courante.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- document A4 imprimable (Task C-1) ----------
          Div racine #facture-print, MONTÉ EN PORTAIL directement sous <body>
          (createPortal) : ainsi le sélecteur CSS d'impression
          `body > *:not(#facture-print) { display: none }` masque tout le reste
          (racine React + portails Radix du dialog + toasts) et la facture
          s'imprime seule, en exactement 1 page A4, sans flux résiduel.
          SSR-safe : ne se monte qu'une fois `selected` défini — interaction
          client uniquement, `document` est donc toujours disponible. */}
      {selected &&
        createPortal(
          <div id="facture-print" className="hidden" aria-hidden="true">
            <FacturePrintDocument
              f={selected}
              nomClient={selected.clientNom ?? nomMap.get(selected.brandSlug) ?? selected.brandSlug}
            />
          </div>,
          document.body
        )}
    </div>
  )
}
