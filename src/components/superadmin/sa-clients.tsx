"use client"

// Super Administration — ① Clients & Contrats (Task B-1) — enrichi Task C-2.
// Portefeuille SaaS de CarbuScope : 6 contrats (5 enseignes actives + 1 prospect),
// KPI consolidés, cycle de vie validé (PROSPECT → ESSAI → ACTIF → SUSPENDU →
// RÉSILIÉ), avenants, fiche 360° latérale (contrat + factures + comptes + audit),
// notes éditables, bandeau de renouvellement et alertes d'expiration
// automatiques (« Échéances & renouvellements », GET /api/super/echeances).
// Identité visuelle : graphite/violet (espace éditeur), emerald = encaissé,
// amber = attente, red = retard. Montants en millimes (1 DT = 1 000).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import {
  CONTRAT_STATUT_META, FACTURE_STATUT_META, SEVERITE_META, MODULE_META, pastille,
  formatDT, formatDTCourt, formatDate, formatDateTime, formatInt,
  type ContratDTO, type AvenantDTO, type Fiche360Response,
} from "@/lib/sa-types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  AlertTriangle, ArrowRight, BadgeCheck, Ban, Bell, CalendarClock, ChevronRight, ClipboardList,
  Coins, Download, FileSignature, FileSearch, FileText, FlaskConical, History, Layers,
  Loader2, Mail, MapPin, MoreHorizontal, PauseCircle, Phone, Receipt,
  RefreshCw, Rocket, Save, ScrollText, Undo2, UserPlus, UserRound, Users,
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

/** Badge de statut contrat à partir du méta partagé (point + libellé). */
function StatutBadge({ statut }: { statut: string }) {
  const p = pastille(CONTRAT_STATUT_META, statut)
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1.5 whitespace-nowrap text-[11px] font-medium", p.className)}>
      {p.point && <span className={cn("h-1.5 w-1.5 rounded-full", p.point)} aria-hidden />}
      {p.label}
    </Badge>
  )
}

function FactureBadge({ statut }: { statut: string }) {
  const p = pastille(FACTURE_STATUT_META, statut)
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1.5 whitespace-nowrap text-[10px]", p.className)}>
      {p.label}
    </Badge>
  )
}

function SeveriteBadge({ severite }: { severite: string }) {
  const p = pastille(SEVERITE_META, severite)
  return (
    <Badge variant="outline" className={cn("h-5 shrink-0 whitespace-nowrap px-1.5 text-[10px]", p.className)}>
      {p.label}
    </Badge>
  )
}

const AVENANT_STATUT_LABEL: Record<string, { label: string; className: string }> = {
  APPLIQUE: { label: "Appliqué", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  BROUILLON: { label: "Brouillon", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
}

// --------------------------------------- échéances & renouvellements (C-2)

type EcheanceType = "RENOUVELLEMENT_CONTRAT" | "PREAVIS_RESILIATION" | "RENOUVELLEMENT_ABONNEMENT"
type Gravite = "DEPASSE" | "CRITIQUE" | "WARNING" | "INFO"

/** DTO de GET /api/super/echeances — alertes calculées à la volée côté serveur. */
interface EcheanceDTO {
  id: string
  type: EcheanceType
  clientSlug: string
  clientNom: string
  reference: string
  libelle: string
  dateEcheance: string
  joursRestants: number
  gravite: Gravite
  detail: string
}

interface EcheancesResponse {
  echeances: EcheanceDTO[]
  stats: { total: number; depasse: number; critique: number; warning: number; info: number }
}

const ECHEANCE_TYPE_META: Record<EcheanceType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  RENOUVELLEMENT_CONTRAT: { label: "Renouvellement de contrat", icon: CalendarClock },
  PREAVIS_RESILIATION: { label: "Préavis de résiliation", icon: Bell },
  RENOUVELLEMENT_ABONNEMENT: { label: "Renouvellement d'abonnements", icon: Layers },
}

const ECHEANCE_TYPE_ORDRE: EcheanceType[] = [
  "RENOUVELLEMENT_CONTRAT", "PREAVIS_RESILIATION", "RENOUVELLEMENT_ABONNEMENT",
]

const GRAVITE_ORDRE: Gravite[] = ["DEPASSE", "CRITIQUE", "WARNING", "INFO"]

/** Pastilles gravité : rouge (dépassée / critique ≤ 7 j), ambre (≤ 30 j), ardoise (≤ 90 j). */
const GRAVITE_META: Record<Gravite, { label: string; chip: string; badge: string; bord: string }> = {
  DEPASSE: {
    label: "Dépassées",
    chip: "border-red-300 bg-red-50/70 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
    badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
    bord: "border-l-red-500",
  },
  CRITIQUE: {
    label: "Critiques ≤ 7 j",
    chip: "border-red-200 bg-red-50/50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400",
    badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
    bord: "border-l-red-500",
  },
  WARNING: {
    label: "À surveiller ≤ 30 j",
    chip: "border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    bord: "border-l-amber-500",
  },
  INFO: {
    label: "Préavis & renouvellements ≤ 90 j",
    chip: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400",
    badge: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
    bord: "border-l-slate-400",
  },
}

/** « J-42 » (à venir) · « J+3 » (dépassée de 3 jours). */
function fmtJours(j: number): string {
  return j >= 0 ? `J-${j}` : `J+${Math.abs(j)}`
}

function JoursBadge({ jours, gravite }: { jours: number; gravite: Gravite }) {
  return (
    <Badge variant="outline" className={cn("h-5 shrink-0 whitespace-nowrap px-1.5 text-[10px] font-semibold tabular-nums", GRAVITE_META[gravite].badge)}>
      {fmtJours(jours)}
    </Badge>
  )
}

// ------------------------------------------------- cycle de vie (miroir API)

/** Mêmes règles que PATCH /api/super/clients — seules les transitions valides sont proposées. */
const TRANSITIONS: Record<string, string[]> = {
  PROSPECT: ["ESSAI"],
  ESSAI: ["ACTIF", "PROSPECT", "RESILIE"],
  ACTIF: ["SUSPENDU", "RESILIE"],
  SUSPENDU: ["ACTIF", "RESILIE"],
  RESILIE: ["PROSPECT"],
}

const TRANSITION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  ESSAI: { label: "Lancer la période d'essai", icon: FlaskConical },
  ACTIF: { label: "Activer le contrat", icon: Rocket },
  PROSPECT: { label: "Revenir à prospect", icon: Undo2 },
  SUSPENDU: { label: "Suspendre le client", icon: PauseCircle },
  RESILIE: { label: "Résilier le contrat", icon: Ban },
}

/** Conséquences réellement appliquées par l'API, affichées avant confirmation. */
const TRANSITION_CONSEQUENCES: Record<string, string[]> = {
  ESSAI: [
    "La date de début est fixée à aujourd'hui (début de l'essai).",
    "L'adhésion de 6 000 DT est marquée non payée en attendant l'activation.",
  ],
  ACTIF: [
    "La date de signature est fixée (aujourd'hui si absente).",
    "L'adhésion est marquée payée.",
    "La facturation mensuelle des stations souscrites démarre.",
  ],
  PROSPECT: [
    "Les dates de signature, début et fin sont effacées.",
    "L'adhésion est marquée non payée.",
    "Le client reprend la qualification commerciale initiale.",
  ],
  SUSPENDU: [
    "Le compte client est suspendu : la génération des factures l'ignore jusqu'à réactivation.",
    "Les abonnements stations restent enregistrés mais ne sont plus facturés.",
  ],
  RESILIE: [
    "La date de fin est fixée à aujourd'hui — le contrat est clos.",
    "Le client pourra repasser prospect ultérieurement pour un redémarrage.",
  ],
}

const STATUT_ORDRE = ["ACTIF", "ESSAI", "PROSPECT", "SUSPENDU", "RESILIE"]

// ---------------------------------------------------------------- fiche 360°

function FicheSection({ titre, icon: Icon, children }: {
  titre: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="px-4 pb-1">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {titre}
      </h4>
      {children}
    </section>
  )
}

function StatTile({ label, value, sub, tone }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: string
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums leading-tight", tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Fiche360({ slug, reloadToken, onClose, onTransition, onAvenant }: {
  slug: string
  reloadToken: number
  onClose: () => void
  onTransition: (client: ContratDTO, target: string) => void
  onAvenant: (client: ContratDTO) => void
}) {
  const [data, setData] = useState<Fiche360Response | null>(null)
  const [fErr, setFErr] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (signal: AbortSignal) => {
    const d = await apiJson<Fiche360Response>(`/api/super/clients/${encodeURIComponent(slug)}`, { signal })
    setData(d)
    setNotes(d.client.notes ?? "")
    setFErr(null)
  }, [slug])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal).catch((e) => {
      if (!isAbort(e)) setFErr(errMsg(e))
    })
    return () => ac.abort()
  }, [load, reloadToken])

  const saveNotes = async () => {
    if (!data) return
    setSaving(true)
    try {
      const r = await apiJson<{ contrat: ContratDTO }>(`/api/super/clients?id=${data.client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      })
      toast.success("Notes enregistrées", { description: `${r.contrat.nomClient} — ${formatDateTime(r.contrat.updatedAt)}.` })
      setData((d) => (d ? { ...d, client: r.contrat } : d))
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "clients-notes" } }))
    } catch (e) {
      toast.error("Enregistrement impossible", { description: errMsg(e) })
    } finally {
      setSaving(false)
    }
  }

  if (fErr) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
        <p className="text-sm text-red-700 dark:text-red-400">{fErr}</p>
        <Button variant="outline" size="sm" onClick={() => load(new AbortController().signal).catch((e) => setFErr(errMsg(e)))}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    )
  }

  const c = data.client
  const u = c.usage
  const facturesRecentes = [...data.factures].sort((a, b) => b.dateEmission.localeCompare(a.dateEmission)).slice(0, 6)
  const aboSuspendus = data.abonnements.filter((a) => a.statut === "SUSPENDU").length
  const statutTransitions = TRANSITIONS[c.statut] ?? []

  return (
    <div className="flex h-full flex-col">
      {/* --- identité : graphite/violet, cohérent avec le bandeau de l'espace --- */}
      <SheetHeader className="border-b border-violet-200 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/60 text-slate-100 dark:border-violet-900">
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="min-w-0">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base font-bold text-white">
              <span className="truncate">{c.nomClient}</span>
              <StatutBadge statut={c.statut} />
            </SheetTitle>
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300">
              <span className="font-mono">{c.numero}</span>
              <span aria-hidden>·</span>
              <span>{c.brandSlug ? `Enseigne ${c.brandSlug}` : "Sans enseigne rattachée"}</span>
            </SheetDescription>
            <p className="mt-1.5 text-xs italic leading-relaxed text-slate-400">{c.conditions}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-200 sm:grid-cols-2">
          <p className="flex items-center gap-1.5 truncate">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-violet-400" aria-hidden />
            <span className="truncate">{c.contactNom} — {c.contactRole}</span>
          </p>
          <p className="flex items-center gap-1.5 truncate">
            <Phone className="h-3.5 w-3.5 shrink-0 text-violet-400" aria-hidden />
            <span className="truncate tabular-nums">{c.contactTel}</span>
          </p>
          <p className="flex items-center gap-1.5 truncate sm:col-span-2">
            <Mail className="h-3.5 w-3.5 shrink-0 text-violet-400" aria-hidden />
            <a href={`mailto:${c.contactEmail}`} className="truncate text-violet-300 underline-offset-2 hover:underline">
              {c.contactEmail}
            </a>
          </p>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="space-y-5 py-4">
          {/* --- métriques clés --- */}
          <FicheSection titre="Métriques du compte" icon={Coins}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="MRR" value={formatDTCourt(c.mrrMillimes)} sub={`${c.abonnementsMensuels} mens. · ${c.abonnementsAnnuels} ann.`} tone="text-violet-700 dark:text-violet-400" />
              <StatTile label="Stations souscrites" value={formatInt(c.stationsSouscrites)} sub={`sur ${formatInt(c.stationsReseau)} au réseau${aboSuspendus > 0 ? ` · ${aboSuspendus} susp.` : ""}`} />
              <StatTile label="Comptes actifs" value={formatInt(c.comptesActifs)} sub={`${formatInt(data.comptes.length)} comptes au total`} />
              <StatTile
                label="Impayés TTC"
                value={c.impayesTtcMillimes > 0 ? formatDTCourt(c.impayesTtcMillimes) : "—"}
                sub={`${c.facturesPayees}/${c.facturesTotal} factures payées`}
                tone={c.impayesTtcMillimes > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
              />
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                Adhésion : {formatDT(c.fraisAdhesionMillimes)} {c.adhesionPayee ? "(encaissée)" : "(non encaissée)"}</span>
              <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                {c.dateSignature ? `Signé le ${formatDate(c.dateSignature)}` : "Non signé"}
                {c.dateFin ? ` · échéance ${formatDate(c.dateFin)}` : " · reconduction tacite"}</span>
            </p>
          </FicheSection>

          {/* --- usage de la plateforme --- */}
          <FicheSection titre="Usage plateforme (12 derniers mois)" icon={ClipboardList}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Missions terrain" value={formatInt(u.missions)} />
              <StatTile label="Rapports" value={formatInt(u.rapports)} />
              <StatTile label="Notifications" value={formatInt(u.notifications)} />
              <StatTile label="Avis répondus" value={formatInt(u.avisRepondes)} />
            </div>
          </FicheSection>

          {/* --- avenants (timeline) --- */}
          <FicheSection titre={`Avenants (${c.avenants.length})`} icon={FileText}>
            {c.avenants.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Aucun avenant — le contrat est en version initiale.
              </p>
            ) : (
              <ol className="relative space-y-3 border-l border-violet-200 pl-4 dark:border-violet-800">
                {c.avenants.map((av) => {
                  const meta = AVENANT_STATUT_LABEL[av.statut] ?? { label: av.statut, className: "" }
                  return (
                    <li key={av.id} className="relative">
                      <span className="absolute top-2 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-background bg-violet-500" aria-hidden />
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <p className="text-xs font-semibold leading-snug">
                            <span className="font-mono text-[11px] text-violet-700 dark:text-violet-400">{av.numero}</span>
                            {" — "}{av.objet}
                          </p>
                          <Badge variant="outline" className={cn("h-5 shrink-0 text-[10px]", meta.className)}>{meta.label}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Effet au {formatDate(av.dateEffet)} · créé le {formatDate(av.createdAt)}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">{av.contenu}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </FicheSection>

          {/* --- dernières factures --- */}
          <FicheSection titre={`Dernières factures (${data.factures.length})`} icon={Receipt}>
            {data.factures.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Aucune facture émise pour ce client.</p>
            ) : (
              <ul className="space-y-1.5">
                {facturesRecentes.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs">
                    <span className="font-mono text-[11px]">{f.numero}</span>
                    <span className="text-muted-foreground">{formatMoisCourt(f.moisConcerne)}</span>
                    <span className={cn(
                      "font-semibold tabular-nums",
                      f.statut === "PAYEE" ? "text-emerald-600 dark:text-emerald-400" : f.statut === "EN_RETARD" ? "text-red-600 dark:text-red-400" : "text-foreground",
                    )}>
                      {formatDTCourt(f.montantTtcMillimes)}
                    </span>
                    <FactureBadge statut={f.statut} />
                  </li>
                ))}
              </ul>
            )}
          </FicheSection>

          {/* --- piste d'audit du client --- */}
          <FicheSection titre={`Piste d'audit (${data.audit.length})`} icon={History}>
            {data.audit.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Aucune entrée d'audit pour ce client.</p>
            ) : (
              <ScrollArea className="max-h-64 rounded-lg border">
                <ul className="divide-y">
                  {data.audit.map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5 px-3 py-2">
                      <SeveriteBadge severite={a.severite} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-snug">{a.action}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {a.acteurNom} · {formatDateTime(a.createdAt)}
                          {a.cibleLabel ? ` · ${a.cibleLabel}` : ""}
                        </p>
                      </div>
                      <Badge variant="secondary" className="h-5 shrink-0 text-[10px] font-normal">
                        {MODULE_META[a.module] ?? a.module}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </FicheSection>

          {/* --- notes internes éditables --- */}
          <FicheSection titre="Notes internes" icon={ScrollText}>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <Label htmlFor={`notes-${c.id}`} className="text-[11px] text-muted-foreground">
                Visible uniquement par l'équipe CarbuScope — jamais partagée au client.
              </Label>
              <Textarea
                id={`notes-${c.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Contexte commercial, points d'attention, prochaines étapes…"
                className="bg-background text-xs"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Dernière modification : {formatDateTime(c.updatedAt)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
                  disabled={saving || notes === (c.notes ?? "")}
                  onClick={saveNotes}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                  Enregistrer
                </Button>
              </div>
            </div>
          </FicheSection>
        </div>
      </ScrollArea>

      {/* --- actions bas de fiche --- */}
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 p-3">
        <Button
          size="sm"
          onClick={() => onAvenant(c)}
          className="bg-violet-600 text-white hover:bg-violet-700"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden /> Nouvel avenant
        </Button>
        {statutTransitions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                Cycle de vie <ChevronRight className="h-3.5 w-3.5 -rotate-90" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Transitions autorisées</DropdownMenuLabel>
              {statutTransitions.map((t) => {
                const meta = TRANSITION_META[t]
                return (
                  <DropdownMenuItem key={t} onClick={() => onTransition(c, t)}>
                    <meta.icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  )
}

/** « 2026-09 » → « sept. 2026 » (condensé pour les mini-listes). */
function formatMoisCourt(moisConcerne: string): string {
  const [y, m] = moisConcerne.split("-").map(Number)
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(new Date(y, m - 1, 1))
}

// ---------------------------------------------------------------- module ①

export function SaClients() {
  const [clients, setClients] = useState<ContratDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState(false)

  // fiche 360° + dialogs
  const [ficheSlug, setFicheSlug] = useState<string | null>(null)
  const [transition, setTransition] = useState<{ client: ContratDTO; target: string } | null>(null)
  const [avenantFor, setAvenantFor] = useState<ContratDTO | null>(null)
  const [avenantObjet, setAvenantObjet] = useState("")
  const [avenantContenu, setAvenantContenu] = useState("")

  // échéances & renouvellements (recalcul serveur à chaque consultation)
  const [echeances, setEcheances] = useState<EcheancesResponse | null>(null)
  const [echErr, setEchErr] = useState<string | null>(null)

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  const load = useCallback(async (signal: AbortSignal) => {
    const d = await apiJson<{ clients: ContratDTO[] }>("/api/super/clients", { signal })
    setClients(d.clients)
    setError(null)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal).catch((e) => {
      if (!isAbort(e)) setError(errMsg(e))
    })
    return () => ac.abort()
  }, [load, refreshKey])

  const loadEcheances = useCallback(async (signal: AbortSignal) => {
    const d = await apiJson<EcheancesResponse>("/api/super/echeances", { signal })
    setEcheances(d)
    setEchErr(null)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    loadEcheances(ac.signal).catch((e) => {
      if (!isAbort(e)) setEchErr(errMsg(e))
    })
    return () => ac.abort()
  }, [loadEcheances, refreshKey])

  // ------------------------------------------------------------- KPI dérivés
  const kpi = useMemo(() => {
    const list = clients ?? []
    const actifs = list.filter((c) => c.statut === "ACTIF")
    const prospects = list.filter((c) => c.statut === "PROSPECT")
    const essais = list.filter((c) => c.statut === "ESSAI")
    const mrr = list.reduce((s, c) => s + c.mrrMillimes, 0)
    const stations = list.reduce((s, c) => s + c.stationsSouscrites, 0)
    const reseau = list.reduce((s, c) => s + c.stationsReseau, 0)
    const impayes = list.reduce((s, c) => s + c.impayesTtcMillimes, 0)
    const facturesRetard = list.reduce((s, c) => s + c.facturesEnRetard, 0)
    const payeurs = list.filter((c) => c.adhesionPayee)
    const adhesions = payeurs.reduce((s, c) => s + c.fraisAdhesionMillimes, 0)
    return { actifs, prospects, essais, mrr, stations, reseau, impayes, facturesRetard, payeurs, adhesions }
  }, [clients])

  const echeancesProches = useMemo(
    () => (clients ?? []).filter(
      (c) => c.statut === "ACTIF" && c.joursAvantEcheance !== null && c.joursAvantEcheance < 60,
    ),
    [clients],
  )

  // ------------------------------------------------------------- mutations
  const applyTransition = async () => {
    if (!transition) return
    const { client, target } = transition
    setBusy(true)
    try {
      await apiJson(`/api/super/clients?id=${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: target }),
      })
      toast.success("Statut du contrat mis à jour", {
        description: `${client.nomClient} — ${pastille(CONTRAT_STATUT_META, client.statut).label} → ${pastille(CONTRAT_STATUT_META, target).label}.`,
      })
      setTransition(null)
      bump()
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "clients-transition" } }))
    } catch (e) {
      toast.error("Transition refusée", { description: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  const submitAvenant = async () => {
    if (!avenantFor || !avenantObjet.trim() || !avenantContenu.trim()) return
    setBusy(true)
    try {
      const r = await apiJson<{ avenant: AvenantDTO }>("/api/super/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratId: avenantFor.id, objet: avenantObjet.trim(), contenu: avenantContenu.trim() }),
      })
      toast.success(`Avenant ${r.avenant.numero} créé`, {
        description: `${avenantFor.nomClient} — ${avenantObjet.trim()}`,
      })
      setAvenantFor(null)
      setAvenantObjet("")
      setAvenantContenu("")
      bump()
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "clients-avenant" } }))
    } catch (e) {
      toast.error("Création impossible", { description: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  // ------------------------------------------------------------- helpers UI
  const openFiche = (c: ContratDTO) => setFicheSlug(c.brandSlug ?? c.numero)

  /** Même mécanique que openFiche : ouvre la fiche 360° du client visé. */
  const openFicheEcheance = (e: EcheanceDTO) => setFicheSlug(e.clientSlug)

  const cycleMenu = (c: ContratDTO) => {
    const transitions = TRANSITIONS[c.statut] ?? []
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label={`Actions cycle de vie pour ${c.nomClient}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Cycle de vie</DropdownMenuLabel>
          {transitions.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Aucune transition disponible.</p>
          )}
          {transitions.map((t) => {
            const meta = TRANSITION_META[t]
            return (
              <DropdownMenuItem key={t} onClick={() => setTransition({ client: c, target: t })}>
                <meta.icon className="h-3.5 w-3.5" aria-hidden />
                {meta.label}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAvenantFor(c)}>
            <FileText className="h-3.5 w-3.5" aria-hidden /> Nouvel avenant
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openFiche(c)}>
            <FileSearch className="h-3.5 w-3.5" aria-hidden /> Ouvrir la fiche 360°
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // ------------------------------------------------------------- colonnes
  const columns: DataViewColumn<ContratDTO>[] = [
    {
      key: "client", header: "Client",
      sortValue: (c) => c.nomClient,
      render: (c) => (
        <div className="min-w-[190px]">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight">
            <span className="truncate">{c.nomClient}</span>
            <StatutBadge statut={c.statut} />
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{c.numero}</p>
        </div>
      ),
    },
    {
      key: "contact", header: "Contact",
      sortValue: (c) => c.contactNom,
      render: (c) => (
        <div className="text-xs leading-snug">
          <p className="font-medium">{c.contactNom}</p>
          <p className="text-muted-foreground">{c.contactRole}</p>
          <a
            href={`mailto:${c.contactEmail}`}
            className="mt-0.5 block max-w-[210px] truncate text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
            onClick={(e) => e.stopPropagation()}
          >
            {c.contactEmail}
          </a>
        </div>
      ),
    },
    {
      key: "perimetre", header: "Périmètre",
      sortValue: (c) => c.stationsSouscrites,
      render: (c) => {
        const pct = c.stationsReseau > 0 ? Math.min(100, Math.round((c.stationsSouscrites / c.stationsReseau) * 100)) : 0
        return (
          <div className="w-36">
            <p className="text-xs tabular-nums">
              <span className="font-semibold">{formatInt(c.stationsSouscrites)}</span>
              <span className="text-muted-foreground"> / {formatInt(c.stationsReseau)} stations</span>
            </p>
            <Progress value={pct} className="mt-1 h-1.5 [&>div]:bg-violet-500" aria-label={`${pct} % du réseau souscrit`} />
          </div>
        )
      },
    },
    {
      key: "mrr", header: "MRR", align: "right",
      sortValue: (c) => c.mrrMillimes,
      render: (c) => (
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{formatDTCourt(c.mrrMillimes)}</p>
          <p className="text-[11px] text-muted-foreground">{c.abonnementsMensuels} mens. · {c.abonnementsAnnuels} ann.</p>
        </div>
      ),
    },
    {
      key: "facturation", header: "Facturation", align: "right",
      sortValue: (c) => c.impayesTtcMillimes,
      render: (c) => (
        <div className="text-right text-xs leading-snug">
          <p className="tabular-nums text-muted-foreground">{c.facturesPayees}/{c.facturesTotal} payées</p>
          {c.impayesTtcMillimes > 0 ? (
            <p className="font-semibold tabular-nums text-red-600 dark:text-red-400">
              {formatDTCourt(c.impayesTtcMillimes)} impayés
            </p>
          ) : (
            <p className="text-emerald-600 dark:text-emerald-400">à jour</p>
          )}
        </div>
      ),
    },
    {
      key: "echeance", header: "Échéance",
      sortValue: (c) => c.joursAvantEcheance ?? 99999,
      render: (c) => {
        if (c.statut !== "ACTIF") return <span className="text-xs text-muted-foreground">—</span>
        const j = c.joursAvantEcheance
        if (j === null) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Tacite</Badge>
              </TooltipTrigger>
              <TooltipContent>Reconduction tacite — pas d'échéance contractuelle fixe.</TooltipContent>
            </Tooltip>
          )
        }
        if (j < 0) {
          return (
            <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              Échue ({formatDate(c.dateFin ?? "")})
            </Badge>
          )
        }
        if (j < 60) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] font-semibold tabular-nums text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                  J-{j}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Échéance contractuelle le {formatDate(c.dateFin ?? "")} — moins de 60 jours, préparer le renouvellement.
              </TooltipContent>
            </Tooltip>
          )
        }
        return <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(c.dateFin ?? "")}</span>
      },
    },
    {
      key: "actions", header: "Actions", align: "right", hideInCards: true,
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-violet-200 px-2 text-[11px] text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
            onClick={(e) => { e.stopPropagation(); openFiche(c) }}
          >
            <FileSearch className="h-3.5 w-3.5" aria-hidden /> Fiche 360°
          </Button>
          {cycleMenu(c)}
        </div>
      ),
    },
  ]

  const loading = clients === null && error === null
  const chargementEch = echeances === null && echErr === null
  const echChips: Array<{ gravite: Gravite; valeur: number }> = [
    { gravite: "DEPASSE", valeur: echeances?.stats.depasse ?? 0 },
    { gravite: "CRITIQUE", valeur: echeances?.stats.critique ?? 0 },
    { gravite: "WARNING", valeur: echeances?.stats.warning ?? 0 },
    { gravite: "INFO", valeur: echeances?.stats.info ?? 0 },
  ]

  // ------------------------------------------------- échéances : colonnes
  const echeColumns: DataViewColumn<EcheanceDTO>[] = [
    {
      key: "type", header: "Type",
      sortValue: (e) => ECHEANCE_TYPE_ORDRE.indexOf(e.type),
      render: (e) => {
        const t = ECHEANCE_TYPE_META[e.type]
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
            <t.icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
            {t.label}
          </span>
        )
      },
    },
    {
      key: "client", header: "Client",
      sortValue: (e) => e.clientNom,
      render: (e) => (
        <div className="min-w-[150px]">
          <p className="truncate text-xs font-semibold leading-snug">{e.clientNom}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{e.reference}</p>
        </div>
      ),
    },
    {
      key: "libelle", header: "Échéance",
      sortValue: (e) => e.libelle,
      render: (e) => (
        <div className="min-w-[220px] max-w-[440px]">
          <p className="text-xs font-medium leading-snug">{e.libelle}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{e.detail}</p>
        </div>
      ),
    },
    {
      key: "date", header: "Date", align: "right",
      sortValue: (e) => e.joursRestants,
      render: (e) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <span className="text-xs text-muted-foreground">{formatDate(e.dateEcheance)}</span>
          <JoursBadge jours={e.joursRestants} gravite={e.gravite} />
        </div>
      ),
    },
  ]

  // ------------------------------------------------------------- rendu
  return (
    <div className="space-y-4">
      {/* ---------- rangée de 6 KPI ---------- */}
      <section aria-label="Indicateurs du portefeuille clients" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {loading || !clients ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Clients actifs"
              value={formatInt(kpi.actifs.length)}
              icon={Users}
              tone="success"
              sub={`sur ${formatInt(clients.length)} contrats signés`}
            />
            <KpiCard
              label="Prospects & essais"
              value={formatInt(kpi.prospects.length + kpi.essais.length)}
              icon={UserPlus}
              tone="warning"
              sub={`${kpi.prospects.length} prospect(s) · ${kpi.essais.length} essai(s)`}
            />
            <KpiCard
              label="MRR consolidé"
              value={formatDTCourt(kpi.mrr)}
              icon={Coins}
              tone="info"
              sub={`ARR ≈ ${formatDTCourt(kpi.mrr * 12)}`}
            />
            <KpiCard
              label="Stations souscrites"
              value={formatInt(kpi.stations)}
              icon={MapPin}
              sub={`${kpi.reseau > 0 ? Math.round((kpi.stations / kpi.reseau) * 100) : 0} % des ${formatInt(kpi.reseau)} stations réseau`}
            />
            <KpiCard
              label="Impayés TTC"
              value={kpi.impayes > 0 ? formatDTCourt(kpi.impayes) : "0 DT"}
              icon={AlertTriangle}
              tone={kpi.impayes > 0 ? "danger" : "default"}
              sub={kpi.impayes > 0 ? `${kpi.facturesRetard} facture(s) en retard — relancer` : "aucun impayé"}
            />
            <KpiCard
              label="Adhésions encaissées"
              value={formatDTCourt(kpi.adhesions)}
              icon={BadgeCheck}
              tone="success"
              sub={`${kpi.payeurs.length} × ${formatDTCourt(kpi.payeurs[0]?.fraisAdhesionMillimes ?? 0)}`}
            />
          </>
        )}
      </section>

      {/* ---------- bandeau renouvellements ---------- */}
      {echeancesProches.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Renouvellements à préparer ({echeancesProches.length})</AlertTitle>
          <AlertDescription className="space-y-1.5">
            {echeancesProches.map((c) => {
              const j = c.joursAvantEcheance ?? 0
              return (
                <p key={c.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <span className="font-mono text-[11px]">{c.numero}</span>
                  <span className="font-semibold">{c.nomClient}</span>
                  <span>arrive à échéance le {formatDate(c.dateFin ?? "")} —</span>
                  {j >= 0 ? (
                    <Badge variant="outline" className="h-5 border-amber-400 bg-amber-100 px-1.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      J-{j}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-5 border-red-300 bg-red-50 px-1.5 text-[10px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                      échue
                    </Badge>
                  )}
                  <span>préparer le dossier de renouvellement.</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-semibold text-amber-800 underline dark:text-amber-300"
                    onClick={() => openFiche(c)}
                  >
                    Ouvrir la fiche
                  </Button>
                </p>
              )
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* ---------- échéances & renouvellements automatiques (C-2) ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
            Échéances &amp; renouvellements
            {echeances && (
              <Badge variant="secondary" className="h-5 shrink-0 tabular-nums text-[10px]">
                {formatInt(echeances.stats.total)}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {chargementEch
              ? "Chargement des échéances…"
              : "Fin de contrats, fenêtres de préavis 60 j (reconduction tacite) et anniversaires d'abonnements annuels — fenêtre 30 j avant → 90 j après."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {chargementEch ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[68px] rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : echErr ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {echErr}
              </p>
              <Button variant="outline" size="sm" onClick={bump}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
              </Button>
            </div>
          ) : (
            <>
              {/* 4 chips KPI compactes par gravité */}
              <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                role="list"
                aria-label="Répartition des échéances par gravité"
              >
                {echChips.map(({ gravite, valeur }) => (
                  <div
                    key={gravite}
                    role="listitem"
                    aria-label={`${formatInt(valeur)} échéance(s) — ${GRAVITE_META[gravite].label}`}
                    className={cn("rounded-lg border p-2.5", GRAVITE_META[gravite].chip)}
                  >
                    <p className="text-xl font-bold tabular-nums leading-none">{formatInt(valeur)}</p>
                    <p className="mt-1 text-[11px] font-medium leading-tight">{GRAVITE_META[gravite].label}</p>
                  </div>
                ))}
              </div>

              <DataViews
                viewKey="sa-echeances"
                columns={echeColumns}
                rows={echeances?.echeances ?? []}
                rowKey={(e) => e.id}
                emptyMessage="Aucune échéance dans les 90 jours."
                onRowClick={openFicheEcheance}
                maxHeightClassName="max-h-96"
                nested={{
                  groupKey: (e) => e.gravite,
                  groupLabel: (gk, rows) => {
                    const g = GRAVITE_META[gk as Gravite]
                    const js = rows.map((r) => r.joursRestants)
                    const plage = js.length === 0 ? "" : js.length === 1 || Math.min(...js) === Math.max(...js)
                      ? fmtJours(Math.min(...js))
                      : `${fmtJours(Math.min(...js))} → ${fmtJours(Math.max(...js))}`
                    return (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("shrink-0 text-[11px] font-medium", g.badge)}>
                          {g.label}
                        </Badge>
                        <span className="text-xs font-normal tabular-nums text-primary/70">
                          {rows.length} échéance{rows.length > 1 ? "s" : ""}{plage ? ` · ${plage}` : ""}
                        </span>
                      </span>
                    )
                  },
                  groupSortValue: (gk) => GRAVITE_ORDRE.indexOf(gk as Gravite),
                  defaultOpen: "all",
                }}
                renderCard={(e) => {
                  const t = ECHEANCE_TYPE_META[e.type]
                  const g = GRAVITE_META[e.gravite]
                  return (
                    <Card
                      className={cn("cursor-pointer border-l-4 transition-shadow hover:shadow-md", g.bord)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ouvrir la fiche 360° de ${e.clientNom} — ${t.label}, ${fmtJours(e.joursRestants)}`}
                      onClick={() => openFicheEcheance(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault()
                          openFicheEcheance(e)
                        }
                      }}
                    >
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                            <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="truncate">{t.label}</span>
                          </span>
                          <JoursBadge jours={e.joursRestants} gravite={e.gravite} />
                        </div>
                        <div>
                          <p className="truncate text-sm font-bold leading-snug">{e.clientNom}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{e.reference}</p>
                        </div>
                        <p className="text-xs font-medium leading-snug">{e.libelle}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">{e.detail}</p>
                        <p className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">{formatDate(e.dateEcheance)}</span>
                          <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-400">
                            <FileSearch className="h-3.5 w-3.5" aria-hidden /> Ouvrir la fiche 360°
                          </span>
                        </p>
                      </CardContent>
                    </Card>
                  )
                }}
              />

              <p className="text-[11px] leading-snug text-muted-foreground">
                Alertes recalculées à chaque consultation depuis les contrats et abonnements en base —
                cadence automatique pilotable depuis Supervision → jobs.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------- liste des clients ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              Portefeuille clients & contrats
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 border-violet-200 px-2.5 text-[11px] text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
              disabled={loading}
              title="Télécharger le portefeuille complet (contrats, contacts, périmètre, MRR, facturation) au format CSV — séparateur « ; », dates ISO, montants en millimes."
              aria-label="Exporter le portefeuille clients au format CSV"
              onClick={() => { window.location.href = "/api/super/export?type=clients" }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Exporter CSV
            </Button>
          </div>
          <CardDescription>
            {loading
              ? "Chargement du portefeuille…"
              : `${formatInt(clients?.length ?? 0)} contrats — cycle de vie PROSPECT → ESSAI → ACTIF → SUSPENDU → RÉSILIÉ, transitions validées par l'API.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
              <Button variant="outline" size="sm" onClick={bump}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
              </Button>
            </div>
          ) : (
            <DataViews
              viewKey="sa-clients"
              columns={columns}
              rows={clients ?? []}
              rowKey={(c) => c.id}
              emptyMessage="Aucun contrat client enregistré."
              onRowClick={openFiche}
              nested={{
                groupKey: (c) => c.statut,
                groupLabel: (gk, rows) => (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <StatutBadge statut={gk} />
                    <span className="text-xs font-normal text-primary/70">
                      {rows.length} contrat{rows.length > 1 ? "s" : ""} · MRR {formatDTCourt(rows.reduce((s, c) => s + c.mrrMillimes, 0))}
                    </span>
                  </span>
                ),
                groupSortValue: (gk) => STATUT_ORDRE.indexOf(gk),
                defaultOpen: "first",
              }}
              renderCard={(c) => (
                <Card className="border-l-4 border-l-violet-500 transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-snug">{c.nomClient}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{c.numero}</p>
                      </div>
                      <StatutBadge statut={c.statut} />
                    </div>
                    <div className="space-y-1 text-xs leading-snug">
                      <p className="flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />
                        <span className="truncate">{c.contactNom} <span className="text-muted-foreground">— {c.contactRole}</span></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />
                        <a href={`mailto:${c.contactEmail}`} className="truncate text-violet-700 hover:underline dark:text-violet-400">
                          {c.contactEmail}
                        </a>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">MRR</p>
                        <p className="text-sm font-bold tabular-nums text-violet-700 dark:text-violet-400">{formatDTCourt(c.mrrMillimes)}</p>
                        <p className="text-[10px] text-muted-foreground">{c.abonnementsMensuels} mens. · {c.abonnementsAnnuels} ann.</p>
                      </div>
                      <div className="rounded-md bg-muted/40 p-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Périmètre</p>
                        <p className="text-sm font-bold tabular-nums">{formatInt(c.stationsSouscrites)} <span className="text-[10px] font-normal text-muted-foreground">/ {formatInt(c.stationsReseau)}</span></p>
                        <Progress
                          value={c.stationsReseau > 0 ? Math.min(100, (c.stationsSouscrites / c.stationsReseau) * 100) : 0}
                          className="mt-1 h-1.5 [&>div]:bg-violet-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={cn("tabular-nums", c.impayesTtcMillimes > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                        {c.impayesTtcMillimes > 0 ? `${formatDTCourt(c.impayesTtcMillimes)} impayés` : "Facturation à jour"}
                      </span>
                      {c.statut === "ACTIF" && c.joursAvantEcheance !== null && c.joursAvantEcheance < 60 && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] font-semibold tabular-nums text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                          Échéance J-{c.joursAvantEcheance}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        className="h-8 flex-1 bg-violet-600 text-white hover:bg-violet-700"
                        onClick={() => openFiche(c)}
                      >
                        <FileSearch className="h-3.5 w-3.5" aria-hidden /> Fiche 360°
                      </Button>
                      {cycleMenu(c)}
                    </div>
                  </CardContent>
                </Card>
              )}
            />
          )}
        </CardContent>
      </Card>

      {/* ---------- fiche 360° (Sheet latéral large) ---------- */}
      <Sheet open={!!ficheSlug} onOpenChange={(o) => !o && setFicheSlug(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl"
          aria-describedby={undefined}
        >
          {ficheSlug && (
            <Fiche360
              slug={ficheSlug}
              reloadToken={refreshKey}
              onClose={() => setFicheSlug(null)}
              onTransition={(client, target) => setTransition({ client, target })}
              onAvenant={(client) => setAvenantFor(client)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ---------- dialog : transition de cycle de vie ---------- */}
      <Dialog open={!!transition} onOpenChange={(o) => !o && setTransition(null)}>
        <DialogContent className="sm:max-w-md">
          {transition && (
            <>
              <DialogHeader>
                <DialogTitle>Changer le statut du contrat</DialogTitle>
                <DialogDescription>
                  {transition.client.nomClient} — <span className="font-mono text-xs">{transition.client.numero}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center gap-3 rounded-lg border bg-muted/30 p-4">
                <StatutBadge statut={transition.client.statut} />
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <StatutBadge statut={transition.target} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conséquences</p>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {(TRANSITION_CONSEQUENCES[transition.target] ?? []).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] italic text-muted-foreground">
                <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Action sensible — la transition et son auteur seront tracés dans la piste d'audit.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTransition(null)} disabled={busy}>
                  Annuler
                </Button>
                <Button
                  onClick={applyTransition}
                  disabled={busy}
                  variant={transition.target === "RESILIE" ? "destructive" : "default"}
                  className={cn(transition.target !== "RESILIE" && "bg-violet-600 text-white hover:bg-violet-700")}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  Confirmer la transition
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- dialog : nouvel avenant ---------- */}
      <Dialog open={!!avenantFor} onOpenChange={(o) => !o && setAvenantFor(null)}>
        <DialogContent className="sm:max-w-lg">
          {avenantFor && (
            <>
              <DialogHeader>
                <DialogTitle>Nouvel avenant</DialogTitle>
                <DialogDescription>
                  {avenantFor.nomClient} — <span className="font-mono text-xs">{avenantFor.numero}</span>. L'avenant sera
                  numéroté automatiquement (AV-XXX) et appliqué à compter d'aujourd'hui.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="avenant-objet">Objet</Label>
                  <Input
                    id="avenant-objet"
                    value={avenantObjet}
                    onChange={(e) => setAvenantObjet(e.target.value)}
                    placeholder="Ex. Extension du périmètre : +10 stations (Sud)"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="avenant-contenu">Contenu</Label>
                  <Textarea
                    id="avenant-contenu"
                    value={avenantContenu}
                    onChange={(e) => setAvenantContenu(e.target.value)}
                    rows={4}
                    placeholder="Décrire précisément la modification contractuelle : périmètre, formule, tarif, date d'effet…"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Rédigé en français, ce texte apparaîtra tel quel dans la fiche contractuelle du client.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAvenantFor(null)} disabled={busy}>
                  Annuler
                </Button>
                <Button
                  onClick={submitAvenant}
                  disabled={busy || !avenantObjet.trim() || !avenantContenu.trim()}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  Créer l'avenant
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
