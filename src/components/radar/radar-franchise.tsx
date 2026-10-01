'use client'

// CarbuScope — T54-B3b — volet « Franchise » du module Opportunity Radar :
// développement par candidats franchisés, suivi de bout en bout depuis le
// portail enseigne (SAISIE INTERNE V1 — formulaire public = V2, exclu).
// TROIS volets internes (Tabs) : « Candidatures » (pipeline NEW → CONTACTED
// → INTERVIEW → APPROVED | REJECTED, transitions valides uniquement, notes
// internes, création multi-étapes), « Kit franchise » (12 pièces de référence
// JURIDIQUE/FINANCIER/TECHNIQUE/FORMATION — progression « préparé » en
// sessionStorage, DÉCISION T54-B3b : schéma gelé, pas de persistance base) et
// « Contrats » (cycle DRAFT → SENT → SIGNED → ACTIVE → TERMINATED à sens
// unique, référence FR-2025-00N, signedAt horodaté à SIGNED).
// API additive /api/franchise/* (auth enseigne : session + rôle écrit ;
// enseigne résolue depuis la session, ?brand= pour les comptes plateforme).
// KPIs de tête : candidatures actives, contrats actifs, royalties moyennes,
// pièces du kit préparées.

import { useEffect, useMemo, useState } from "react"
import type * as React from "react"
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Euro,
  FileSignature,
  FileText,
  GraduationCap,
  Handshake,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Scale,
  Search,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/shell/loading"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"

/* ============================== Types ============================== */

type CandidateDTO = {
  id: string
  brandSlug: string
  fullName: string
  email: string
  phone: string
  gouvernorat: string
  delegation: string | null
  city: string | null
  experience: string
  investmentRange: string
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

type ContractDTO = {
  id: string
  candidateId: string
  candidateName: string
  candidateGouvernorat: string
  brandSlug: string
  reference: string
  status: string
  royaltyPct: number
  entryFee: number
  durationYears: number
  signedAt: string | null
  createdAt: string
}

type KitItemDTO = {
  id: string
  category: string
  title: string
  description: string
  order: number
  mandatory: boolean
}

/* ============================== Libellés & styles ============================== */

const EXPERIENCE_LABELS: Record<string, string> = {
  NONE: "Sans expérience",
  STATION: "Station-service",
  RETAIL: "Commerce / retail",
  OTHER: "Autre",
}

const BUDGET_LABELS: Record<string, string> = {
  "<500K": "Moins de 500 KDT",
  "500K_1M": "500 KDT – 1 MDT",
  "1M_2M": "1 – 2 MDT",
  ">2M": "Plus de 2 MDT",
}

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  INTERVIEW: "Entretien",
  APPROVED: "Approuvé",
  REJECTED: "Rejeté",
}

/** Badges candidature (spec : NEW=zinc, CONTACTED=ambre, INTERVIEW=ambre vif, APPROVED=émeraude, REJECTED=terracotta). */
const CANDIDATE_BADGE: Record<string, string> = {
  NEW: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  CONTACTED: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  INTERVIEW: "border-amber-500 bg-amber-100 text-amber-800 dark:border-amber-600 dark:bg-amber-900 dark:text-amber-300",
  APPROVED: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  REJECTED: "border-[#e8a186] bg-[#fbeee8] text-[#b4552f] dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186]",
}

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  SIGNED: "Signé",
  ACTIVE: "Actif",
  TERMINATED: "Résilié",
}

/** Badges contrat (spec : DRAFT=zinc, SENT=ambre, SIGNED=émeraude, ACTIVE=émeraude plein, TERMINATED=terracotta). */
const CONTRACT_BADGE: Record<string, string> = {
  DRAFT: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  SENT: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  SIGNED: "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  ACTIVE: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600",
  TERMINATED: "border-[#e8a186] bg-[#fbeee8] text-[#b4552f] dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186]",
}

/** Transitions candidature côté client (miroir exact du serveur T54-B3b). */
const CANDIDATE_NEXT: Record<string, Array<{ to: string; label: string; confirm: boolean; danger?: boolean }>> = {
  NEW: [{ to: "CONTACTED", label: "Marquer contacté", confirm: false }],
  CONTACTED: [{ to: "INTERVIEW", label: "Programmer l'entretien", confirm: false }],
  INTERVIEW: [
    { to: "APPROVED", label: "Approuver", confirm: true },
    { to: "REJECTED", label: "Rejeter", confirm: true, danger: true },
  ],
}

/** Transitions contrat (sens unique — miroir du serveur). */
const CONTRACT_NEXT: Record<string, { to: string; label: string; confirm: boolean }> = {
  DRAFT: { to: "SENT", label: "Envoyer le contrat", confirm: false },
  SENT: { to: "SIGNED", label: "Marquer signé", confirm: true },
  SIGNED: { to: "ACTIVE", label: "Activer", confirm: true },
  ACTIVE: { to: "TERMINATED", label: "Résilier", confirm: true },
}

const KIT_CATEGORIES: Array<{ id: string; label: string; icon: LucideIcon; tone: string }> = [
  {
    id: "JURIDIQUE",
    label: "Juridique",
    icon: Scale,
    tone: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
  },
  {
    id: "FINANCIER",
    label: "Financier",
    icon: Euro,
    tone: "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
  },
  {
    id: "TECHNIQUE",
    label: "Technique",
    icon: Wrench,
    tone: "border-[#e8a186] bg-[#fbeee8]/70 dark:border-[#8a4a30] dark:bg-[#3a2118]/50 text-[#b4552f] dark:text-[#e8a186]",
  },
  {
    id: "FORMATION",
    label: "Formation",
    icon: GraduationCap,
    tone: "border-zinc-300 bg-zinc-100/70 dark:border-zinc-700 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300",
  },
]

/** Clé sessionStorage de la progression du kit (DÉCISION T54-B3b : pas de base). */
const KIT_STORAGE_KEY = "carbuscope-kit-franchise"

const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
const fmtDateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"

/** Recherche accent-insensible (NFD — pattern radar-scoring). */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/* ============================== KPI de tête ============================== */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub: string
  tone: string
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone)} aria-hidden>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-[10px] text-muted-foreground/80">{sub}</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================== Sheet détail candidature ============================== */

function CandidateSheet({
  candidate,
  open,
  onOpenChange,
  onPatch,
  busy,
}: {
  candidate: CandidateDTO | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPatch: (id: string, patch: { status?: string; notes?: string }) => Promise<boolean>
  busy: boolean
}) {
  const [notes, setNotes] = useState("")
  const [confirmAction, setConfirmAction] = useState<{ to: string; label: string } | null>(null)
  // Éditeur de notes synchronisé à la candidature ouverte : réinitialisation
  // PENDANT LE RENDU (pattern officiel React « storing information from
  // previous renders » — pas d'effet setState, zéro rendu en cascade).
  // Re-synchronise à chaque (ré)ouverture ou changement de dossier.
  const [syncedId, setSyncedId] = useState<string | null>(null)
  if ((candidate?.id ?? null) !== syncedId) {
    setSyncedId(candidate?.id ?? null)
    setNotes(candidate?.notes ?? "")
  }

  if (!candidate) return null

  const transitions = CANDIDATE_NEXT[candidate.status] ?? []
  const steps: Array<{ id: string; label: string }> = [
    { id: "NEW", label: "Nouveau" },
    { id: "CONTACTED", label: "Contacté" },
    { id: "INTERVIEW", label: "Entretien" },
    { id: "APPROVED", label: "Décision" },
  ]
  const stepIdx =
    candidate.status === "REJECTED" ? 3 : steps.findIndex(s => s.id === candidate.status)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="border-b bg-gradient-to-br from-emerald-50/70 to-amber-50/60 p-4 dark:from-emerald-950/25 dark:to-amber-950/20 sm:p-6">
          <SheetDescription className="sr-only">
            Dossier de candidature de {candidate.fullName} — {CANDIDATE_STATUS_LABELS[candidate.status]}
          </SheetDescription>
          <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
            <UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{candidate.fullName}</span>
          </SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-[11px]", CANDIDATE_BADGE[candidate.status])}>
              {CANDIDATE_STATUS_LABELS[candidate.status]}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              déposée le {fmtDateFr(candidate.createdAt)}
            </span>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {/* ---- Timeline du pipeline ---- */}
          <section aria-label="Progression de la candidature">
            <p className="mb-2 text-xs font-semibold">Progression</p>
            <ol className="flex min-w-0 items-center gap-1">
              {steps.map((s, i) => {
                const done = i < stepIdx
                const current = i === stepIdx && candidate.status !== "REJECTED"
                const rejected = candidate.status === "REJECTED" && i === 3
                return (
                  <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                        rejected
                          ? "border-[#e8a186] bg-[#fbeee8] text-[#b4552f] dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186]"
                          : current
                            ? "border-emerald-500 bg-emerald-600 text-white dark:bg-emerald-500"
                            : done
                              ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                              : "border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500",
                      )}
                    >
                      {done ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[10px]",
                        current || rejected ? "font-semibold" : "text-muted-foreground",
                        rejected && "text-[#b4552f] dark:text-[#e8a186]",
                      )}
                    >
                      {s.label}
                    </span>
                    {i < steps.length - 1 && (
                      <span className="h-px min-w-2 flex-1 bg-zinc-200 dark:bg-zinc-700" aria-hidden />
                    )}
                  </li>
                )
              })}
            </ol>
            {candidate.status === "REJECTED" && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#b4552f] dark:text-[#e8a186]">
                <Ban className="h-3 w-3" aria-hidden />
                Candidature rejetée (statut terminal — mise à jour le {fmtDateFr(candidate.updatedAt)}).
              </p>
            )}
          </section>

          {/* ---- Informations complètes ---- */}
          <section aria-label="Informations du candidat" className="space-y-2">
            <p className="text-xs font-semibold">Identité & projet</p>
            <dl className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="min-w-0 truncate font-medium">{candidate.email}</dd>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="min-w-0 truncate font-medium tabular-nums">{candidate.phone}</dd>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="min-w-0 truncate font-medium">
                  {candidate.gouvernorat}
                  {candidate.delegation ? ` · ${candidate.delegation}` : ""}
                  {candidate.city ? ` (${candidate.city})` : ""}
                </dd>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <dd className="min-w-0 truncate font-medium">
                  {EXPERIENCE_LABELS[candidate.experience] ?? candidate.experience}
                </dd>
              </div>
              <div className="col-span-full flex min-w-0 items-center justify-between gap-2 border-t pt-2">
                <dt className="text-muted-foreground">Budget d&apos;investissement</dt>
                <dd className="font-semibold">{BUDGET_LABELS[candidate.investmentRange] ?? candidate.investmentRange}</dd>
              </div>
              <div className="col-span-full flex min-w-0 items-center justify-between gap-2">
                <dt className="text-muted-foreground">Dernière mise à jour</dt>
                <dd className="font-medium">{fmtDateFr(candidate.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          {/* ---- Notes internes ---- */}
          <section aria-label="Notes internes" className="space-y-2">
            <p className="text-xs font-semibold">Notes internes</p>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Comptes rendus d'entretien, vérifications, engagement du candidat…"
              className="min-h-24 text-xs"
              aria-label="Notes internes de la candidature"
            />
            <Button
              className="h-11 w-full gap-1.5"
              disabled={busy || notes === (candidate.notes ?? "")}
              onClick={() => onPatch(candidate.id, { notes })}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Enregistrer les notes
            </Button>
          </section>

          {/* ---- Actions de transition (visibles selon validité) ---- */}
          {transitions.length > 0 && (
            <section aria-label="Actions de pipeline" className="space-y-2">
              <p className="text-xs font-semibold">Actions</p>
              <div className="flex flex-wrap gap-2">
                {transitions.map(t => (
                  <Button
                    key={t.to}
                    variant={t.danger ? "outline" : "default"}
                    className={cn(
                      "h-11 gap-1.5",
                      t.danger &&
                        "border-[#e8a186] bg-[#fbeee8] text-[#b4552f] hover:bg-[#f6ded4] dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186] dark:hover:bg-[#472a1f]",
                    )}
                    disabled={busy}
                    onClick={() => (t.confirm ? setConfirmAction(t) : onPatch(candidate.id, { status: t.to }))}
                  >
                    {t.danger ? <Ban className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                    {t.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Pipeline à sens unique : Nouveau → Contacté → Entretien → Approuvé / Rejeté
                (statuts terminaux, aucune marche arrière).
              </p>
            </section>
          )}
        </div>
      </SheetContent>

      {/* Confirmation (APPROVED / REJECTED) */}
      <AlertDialog open={confirmAction != null} onOpenChange={v => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.to === "APPROVED"
                ? "Approuver la candidature de " + candidate.fullName + " ?"
                : "Rejeter la candidature de " + candidate.fullName + " ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.to === "APPROVED"
                ? "Le candidat devient éligible à un contrat de franchise. Cette décision est définitive (statut terminal)."
                : "La candidature sera close définitivement. Motivez la décision dans les notes internes avant de confirmer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-11",
                confirmAction?.to === "REJECTED" &&
                  "bg-[#c25a34] text-white hover:bg-[#a84a29] dark:bg-[#8a4a30] dark:text-white dark:hover:bg-[#7a4028]",
              )}
              onClick={() => {
                if (confirmAction) void onPatch(candidate.id, { status: confirmAction.to })
                setConfirmAction(null)
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

/* ============================== Dialog nouvelle candidature (2 étapes) ============================== */

type NewCandidateForm = {
  fullName: string
  email: string
  phone: string
  gouvernorat: string
  delegation: string
  experience: string
  investmentRange: string
  notes: string
}

const EMPTY_FORM: NewCandidateForm = {
  fullName: "",
  email: "",
  phone: "",
  gouvernorat: "",
  delegation: "",
  experience: "",
  investmentRange: "",
  notes: "",
}

function NewCandidateDialog({
  open,
  onOpenChange,
  onCreate,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreate: (form: NewCandidateForm) => Promise<boolean>
  busy: boolean
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<NewCandidateForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof NewCandidateForm, string>>>({})

  // Gouvernorats (référentiel léger /api/governorats) + délégations drill-down
  // (/api/radar/scoring?gouvernorat= — spec T54-B3b).
  const [govs, setGovs] = useState<Array<{ name: string; vehicles: number; delegationCount: number }>>([])
  const [delegations, setDelegations] = useState<string[]>([])
  const [delegLoading, setDelegLoading] = useState(false)

  // NOTE : le formulaire est REMONTÉ À NEUF à chaque ouverture (prop key du
  // parent, incrémentée par le bouton « Nouvelle candidature ») — aucun reset
  // d'état à la fermeture n'est nécessaire.
  useEffect(() => {
    if (!open) return
    const ctrl = new AbortController()
    fetch("/api/governorats", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error("governorats")
        return (await r.json()) as { governorats: Array<{ name: string; vehicles: number; delegationCount: number }> }
      })
      .then(d => setGovs(d.governorats))
      .catch(() => {})
    return () => ctrl.abort()
  }, [open])

  useEffect(() => {
    // Gouvernorat vide (montage frais) : rien à charger — le composant est
    // remonté par clé à chaque ouverture, les délégations repartent vides.
    // Le drapeau « chargement » est armé dans le handler du sélecteur (pas de
    // setState synchrone dans l'effet) et baissé à la résolution.
    if (!form.gouvernorat) return
    const ctrl = new AbortController()
    fetch(`/api/radar/scoring?gouvernorat=${encodeURIComponent(form.gouvernorat)}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error("scoring")
        return (await r.json()) as { delegations?: Array<{ name: string }> }
      })
      .then(d => {
        setDelegations((d.delegations ?? []).map(x => x.name).sort((a, b) => a.localeCompare(b, "fr")))
      })
      .catch(() => setDelegations([]))
      .finally(() => setDelegLoading(false))
    return () => ctrl.abort()
  }, [form.gouvernorat])

  const maj = (patch: Partial<NewCandidateForm>) => setForm(f => ({ ...f, ...patch }))

  const validerEtape1 = (): boolean => {
    const e: Partial<Record<keyof NewCandidateForm, string>> = {}
    if (!form.fullName.trim()) e.fullName = "Le nom est requis."
    else if (form.fullName.trim().length > 120) e.fullName = "120 caractères maximum."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Adresse e-mail invalide."
    if (!/^\+216[\s.\-()]*(\d[\s.\-()]*){8}$/.test(form.phone.trim()))
      e.phone = "Format attendu : +216 XX XXX XXX."
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validerEtape2 = (): boolean => {
    const e: Partial<Record<keyof NewCandidateForm, string>> = {}
    if (!form.gouvernorat) e.gouvernorat = "Choisissez un gouvernorat."
    if (!form.experience) e.experience = "Choisissez une expérience."
    if (!form.investmentRange) e.investmentRange = "Choisissez un budget."
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    if (!validerEtape2()) return
    const ok = await onCreate(form)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Handshake className="h-4 w-4 text-primary" aria-hidden />
            Nouvelle candidature
          </DialogTitle>
          <DialogDescription>
            Étape {step} sur 2 — {step === 1 ? "identité du candidat" : "projet d'implantation"}. Saisie
            interne enseigne (le formulaire public arrive en V2).
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-nom" className="text-xs">
                Nom & prénom
              </Label>
              <Input
                id="nc-nom"
                value={form.fullName}
                onChange={e => maj({ fullName: e.target.value })}
                placeholder="Ex. Fatma Ben Salah"
                className="h-11"
              />
              {errors.fullName && <p className="text-[11px] text-[#b4552f]">{errors.fullName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-email" className="text-xs">
                Adresse e-mail
              </Label>
              <Input
                id="nc-email"
                type="email"
                value={form.email}
                onChange={e => maj({ email: e.target.value })}
                placeholder="prenom.nom@exemple.tn"
                className="h-11"
              />
              {errors.email && <p className="text-[11px] text-[#b4552f]">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-tel" className="text-xs">
                Téléphone
              </Label>
              <Input
                id="nc-tel"
                value={form.phone}
                onChange={e => maj({ phone: e.target.value })}
                placeholder="+216 98 123 456"
                className="h-11 tabular-nums"
              />
              {errors.phone && <p className="text-[11px] text-[#b4552f]">{errors.phone}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-gouv" className="text-xs">
                Gouvernorat visé
              </Label>
              <Select value={form.gouvernorat} onValueChange={v => { setDelegations([]); setDelegLoading(true); maj({ gouvernorat: v, delegation: "" }) }}>
                <SelectTrigger id="nc-gouv" className="h-11 w-full">
                  <SelectValue placeholder="Choisir un gouvernorat" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {govs.map(g => (
                    <SelectItem key={g.name} value={g.name}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{g.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {num(g.vehicles)} véh.
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.gouvernorat && <p className="text-[11px] text-[#b4552f]">{errors.gouvernorat}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-deleg" className="text-xs">
                Délégation {delegLoading ? "· chargement…" : "· facultatif"}
              </Label>
              <Select
                value={form.delegation}
                onValueChange={v => maj({ delegation: v })}
                disabled={!form.gouvernorat || delegations.length === 0}
              >
                <SelectTrigger id="nc-deleg" className="h-11 w-full">
                  <SelectValue
                    placeholder={
                      !form.gouvernorat
                        ? "Choisir d'abord un gouvernorat"
                        : delegations.length === 0
                          ? "Aucune délégation documentée"
                          : "Préciser la délégation"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="(non précisée)">
                    <span className="text-muted-foreground">(non précisée)</span>
                  </SelectItem>
                  {delegations.map(d => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-exp" className="text-xs">
                Expérience
              </Label>
              <Select value={form.experience} onValueChange={v => maj({ experience: v })}>
                <SelectTrigger id="nc-exp" className="h-11 w-full">
                  <SelectValue placeholder="Choisir une expérience" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPERIENCE_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.experience && <p className="text-[11px] text-[#b4552f]">{errors.experience}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-budget" className="text-xs">
                Budget d&apos;investissement
              </Label>
              <Select value={form.investmentRange} onValueChange={v => maj({ investmentRange: v })}>
                <SelectTrigger id="nc-budget" className="h-11 w-full">
                  <SelectValue placeholder="Choisir un budget" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BUDGET_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.investmentRange && <p className="text-[11px] text-[#b4552f]">{errors.investmentRange}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-notes" className="text-xs">
                Notes internes (facultatif)
              </Label>
              <Textarea
                id="nc-notes"
                value={form.notes}
                onChange={e => maj({ notes: e.target.value })}
                placeholder="Origine du contact, contexte…"
                className="min-h-20 text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="outline" className="h-11" onClick={() => setStep(1)} disabled={busy}>
              Retour
            </Button>
          )}
          {step === 1 ? (
            <Button className="h-11" onClick={() => validerEtape1() && setStep(2)}>
              Continuer
            </Button>
          ) : (
            <Button className="h-11 gap-1.5" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Créer la candidature
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============================== Sheet détail contrat ============================== */

function ContractSheet({
  contract,
  open,
  onOpenChange,
  onPatch,
  busy,
}: {
  contract: ContractDTO | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onPatch: (id: string, status: string) => Promise<boolean>
  busy: boolean
}) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const next = contract ? CONTRACT_NEXT[contract.status] : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="border-b bg-gradient-to-br from-emerald-50/70 to-amber-50/60 p-4 dark:from-emerald-950/25 dark:to-amber-950/20 sm:p-6">
          <SheetDescription className="sr-only">
            Contrat de franchise {contract?.reference} — {CONTRACT_STATUS_LABELS[contract?.status ?? ""]}
          </SheetDescription>
          <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate tabular-nums">{contract?.reference}</span>
          </SheetTitle>
          {contract && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("text-[11px]", CONTRACT_BADGE[contract.status])}>
                {CONTRACT_STATUS_LABELS[contract.status]}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                créé le {fmtDateFr(contract.createdAt)}
              </span>
            </div>
          )}
        </SheetHeader>

        {contract && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            <section aria-label="Récapitulatif du contrat" className="space-y-2">
              <p className="text-xs font-semibold">Récapitulatif</p>
              <dl className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2">
                <div className="flex min-w-0 items-center justify-between gap-2 border-b pb-1.5 sm:col-span-2">
                  <dt className="text-muted-foreground">Candidat</dt>
                  <dd className="min-w-0 truncate font-semibold">
                    {contract.candidateName}
                    {contract.candidateGouvernorat ? ` · ${contract.candidateGouvernorat}` : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Droit d&apos;entrée</dt>
                  <dd className="font-semibold tabular-nums">{num(contract.entryFee)} DT</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Royalties</dt>
                  <dd className="font-semibold tabular-nums">{fmt1(contract.royaltyPct)} % du CA</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Durée</dt>
                  <dd className="font-semibold tabular-nums">
                    {contract.durationYears} an{contract.durationYears > 1 ? "s" : ""}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Signature</dt>
                  <dd className="font-medium">
                    {contract.signedAt ? fmtDateFr(contract.signedAt) : "en attente"}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-label="Cycle de vie" className="space-y-2">
              <p className="text-xs font-semibold">Cycle de vie</p>
              <ol className="flex min-w-0 items-center gap-1">
                {(["DRAFT", "SENT", "SIGNED", "ACTIVE", "TERMINATED"] as const).map((s, i, all) => {
                  const idx = all.indexOf(contract.status as (typeof all)[number])
                  const done = i < idx
                  const current = i === idx
                  return (
                    <li key={s} className="flex min-w-0 flex-1 items-center gap-1">
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                          current
                            ? "border-emerald-500 bg-emerald-600 text-white dark:bg-emerald-500"
                            : done
                              ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                              : "border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500",
                        )}
                      >
                        {done ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : i + 1}
                      </span>
                      <span className={cn("truncate text-[10px]", current ? "font-semibold" : "text-muted-foreground")}>
                        {CONTRACT_STATUS_LABELS[s]}
                      </span>
                      {i < all.length - 1 && (
                        <span className="h-px min-w-2 flex-1 bg-zinc-200 dark:bg-zinc-700" aria-hidden />
                      )}
                    </li>
                  )
                })}
              </ol>
              <p className="text-[11px] text-muted-foreground">
                Sens unique : Brouillon → Envoyé → Signé → Actif → Résilié. La signature est
                horodatée au passage à « Signé ».
              </p>
            </section>

            {next && (
              <section aria-label="Action de cycle" className="space-y-2">
                <Button
                  className="h-11 w-full gap-1.5"
                  disabled={busy}
                  onClick={() => (next.confirm ? setConfirmAction(next.to) : onPatch(contract.id, next.to))}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <CalendarClock className="h-4 w-4" aria-hidden />
                  )}
                  {next.label}
                </Button>
              </section>
            )}
            {!next && (
              <p className="flex items-center gap-1.5 rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground">
                <Ban className="h-3 w-3 shrink-0" aria-hidden />
                Contrat résilié — statut terminal, aucune action possible.
              </p>
            )}
          </div>
        )}
      </SheetContent>

      {/* Confirmation (SIGNED / ACTIVE / TERMINATED) */}
      <AlertDialog open={confirmAction != null} onOpenChange={v => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "SIGNED"
                ? "Marquer le contrat signé ?"
                : confirmAction === "ACTIVE"
                  ? "Activer le contrat ?"
                  : "Résilier le contrat ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "SIGNED"
                ? `La signature de ${contract?.reference} sera horodatée à la date du jour. Le passage suivant sera « Actif » (sens unique).`
                : confirmAction === "ACTIVE"
                  ? `${contract?.reference} passera en exploitation active — royalties de ${contract ? fmt1(contract.royaltyPct) : ""} % du CA.`
                  : `${contract?.reference} sera clôturé définitivement (statut terminal).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-11",
                confirmAction === "TERMINATED" &&
                  "bg-[#c25a34] text-white hover:bg-[#a84a29] dark:bg-[#8a4a30] dark:text-white dark:hover:bg-[#7a4028]",
              )}
              onClick={() => {
                if (contract && confirmAction) void onPatch(contract.id, confirmAction)
                setConfirmAction(null)
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

/* ============================== Dialog nouveau contrat ============================== */

function NewContractDialog({
  open,
  onOpenChange,
  approved,
  onCreate,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  approved: CandidateDTO[]
  onCreate: (payload: { candidateId: string; entryFee: number; royaltyPct: number; durationYears: number }) => Promise<boolean>
  busy: boolean
}) {
  // NOTE : le formulaire est REMONTÉ À NEUF à chaque ouverture (prop key du
  // parent, incrémentée par le bouton « Nouveau contrat ») — aucun reset
  // d'état à la fermeture n'est nécessaire.
  const [candidateId, setCandidateId] = useState("")
  const [entryFee, setEntryFee] = useState("150000")
  const [royaltyPct, setRoyaltyPct] = useState("3")
  const [durationYears, setDurationYears] = useState("5")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const fee = Number(entryFee.replace(/\s/g, "").replace(",", "."))
    const roy = Number(royaltyPct.replace(",", "."))
    const years = Number(durationYears)
    if (!candidateId) {
      setError("Choisissez un candidat approuvé.")
      return
    }
    if (!Number.isFinite(fee) || fee < 10_000 || fee > 2_000_000) {
      setError("Droit d'entrée attendu entre 10 000 et 2 000 000 DT.")
      return
    }
    if (!Number.isFinite(roy) || roy < 0.5 || roy > 15) {
      setError("Royalties attendues entre 0,5 et 15 %.")
      return
    }
    if (!Number.isInteger(years) || years < 1 || years > 15) {
      setError("Durée attendue : 1 à 15 ans.")
      return
    }
    setError(null)
    const ok = await onCreate({ candidateId, entryFee: fee, royaltyPct: roy, durationYears: years })
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-primary" aria-hidden />
            Nouveau contrat de franchise
          </DialogTitle>
          <DialogDescription>
            Le contrat est créé au statut « Brouillon » — référence FR-2025-00N générée
            automatiquement (numéro suivant).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Candidat approuvé</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue
                  placeholder={
                    approved.length === 0 ? "Aucun candidat approuvé" : "Choisir un candidat approuvé"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {approved.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{c.fullName}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {c.gouvernorat} · {BUDGET_LABELS[c.investmentRange] ?? ""}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-entry" className="text-xs">
                Droit d&apos;entrée (DT)
              </Label>
              <Input
                id="nc-entry"
                inputMode="decimal"
                value={entryFee}
                onChange={e => setEntryFee(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-roy" className="text-xs">
                Royalties (% du CA)
              </Label>
              <Input
                id="nc-roy"
                inputMode="decimal"
                value={royaltyPct}
                onChange={e => setRoyaltyPct(e.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-duree" className="text-xs">
              Durée (années)
            </Label>
            <Select value={durationYears} onValueChange={setDurationYears}>
              <SelectTrigger id="nc-duree" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 15 }, (_, i) => i + 1).map(y => (
                  <SelectItem key={y} value={String(y)}>
                    {y} an{y > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-[11px] text-[#b4552f]">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button className="h-11 gap-1.5" onClick={submit} disabled={busy || approved.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Créer le contrat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============================== Volet principal ============================== */

export function RadarFranchise({ brandSlug }: { brandSlug: string }) {
  const enseigne = brandSlug || "agil"

  const [candidates, setCandidates] = useState<CandidateDTO[] | null>(null)
  const [contracts, setContracts] = useState<ContractDTO[] | null>(null)
  const [kit, setKit] = useState<KitItemDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)

  // Candidatures : recherche + filtre statut + Sheet
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("TOUS")
  const [sheetId, setSheetId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  // Séquence de remontage des dialogs de création : incrémentée par chaque
  // bouton d'ouverture → formulaire remonté à neuf (état initial), sans effet
  // de reset à la fermeture (discipline react-hooks/set-state-in-effect).
  const [newSeq, setNewSeq] = useState(0)

  // Contrats : Sheet + création
  const [contractId, setContractId] = useState<string | null>(null)
  const [newContractOpen, setNewContractOpen] = useState(false)
  const [newContractSeq, setNewContractSeq] = useState(0)

  // Kit : progression sessionStorage (DÉCISION T54-B3b — honnête, pas de base)
  const [prepared, setPrepared] = useState<Record<string, boolean>>({})
  const [kitConfirmAll, setKitConfirmAll] = useState(false)
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const c of KIT_CATEGORIES) initial[c.id] = true
    return initial
  })

  // ---- Chargement (candidatures + contrats session enseigne, kit public) ----
  useEffect(() => {
    const ctrl = new AbortController()
    const qs = `brand=${encodeURIComponent(enseigne)}`
    Promise.all([
      fetch(`/api/franchise/candidates?${qs}`, { signal: ctrl.signal }).then(async r => {
        if (r.status === 401) throw new Error("Connexion requise — le module franchise est une saisie interne enseigne.")
        if (!r.ok) throw new Error(`/api/franchise/candidates → ${r.status}`)
        return (await r.json()) as { candidates: CandidateDTO[] }
      }),
      fetch(`/api/franchise/contracts?${qs}`, { signal: ctrl.signal }).then(async r => {
        if (!r.ok) throw new Error(`/api/franchise/contracts → ${r.status}`)
        return (await r.json()) as { contracts: ContractDTO[] }
      }),
      fetch("/api/franchise/kit", { signal: ctrl.signal }).then(async r => {
        if (!r.ok) throw new Error(`/api/franchise/kit → ${r.status}`)
        return (await r.json()) as { kit: KitItemDTO[] }
      }),
    ])
      .then(([c, k, kitRes]) => {
        setCandidates(c.candidates)
        setContracts(k.contracts)
        setKit(kitRes.kit)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey, enseigne])

  // ---- Progression du kit : lecture sessionStorage au montage ----
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KIT_STORAGE_KEY)
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
      setPrepared(parsed && typeof parsed === "object" ? parsed : {})
    } catch {
      setPrepared({})
    }
  }, [])

  const persistKit = (next: Record<string, boolean>) => {
    setPrepared(next)
    try {
      sessionStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* sessionStorage indisponible : l'état reste local au rendu */
    }
  }

  /* ---- Mutations (PATCH/POST → toasts + mise à jour locale) ---- */
  const patchCandidate = async (id: string, patch: { status?: string; notes?: string }): Promise<boolean> => {
    setBusy(true)
    try {
      const r = await fetch("/api/franchise/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      })
      const body = (await r.json().catch(() => ({}))) as { candidate?: CandidateDTO; error?: string }
      if (!r.ok || !body.candidate) {
        toast.error(body.error ?? "Mise à jour impossible — réessayez.")
        return false
      }
      setCandidates(prev => (prev ? prev.map(c => (c.id === id ? body.candidate! : c)) : prev))
      if (patch.status) {
        toast.success(`Candidature « ${body.candidate.fullName} » — ${CANDIDATE_STATUS_LABELS[body.candidate.status]}`, {
          description: patch.notes !== undefined ? "Notes enregistrées." : "Transition de pipeline tracée (audit franchise).",
        })
      } else {
        toast.success("Notes enregistrées", { description: body.candidate.fullName })
      }
      return true
    } catch {
      toast.error("Mise à jour impossible — vérifiez votre connexion.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const createCandidate = async (form: NewCandidateForm): Promise<boolean> => {
    setBusy(true)
    try {
      const r = await fetch("/api/franchise/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          gouvernorat: form.gouvernorat,
          delegation: form.delegation === "(non précisée)" ? null : form.delegation || null,
          experience: form.experience,
          investmentRange: form.investmentRange,
          notes: form.notes.trim() || null,
        }),
      })
      const body = (await r.json().catch(() => ({}))) as { candidate?: CandidateDTO; error?: string }
      if (!r.ok || !body.candidate) {
        toast.error(body.error ?? "Création impossible — réessayez.")
        return false
      }
      setCandidates(prev => [body.candidate!, ...(prev ?? [])])
      toast.success(`Candidature « ${body.candidate.fullName} » créée`, {
        description: "Statut initial : Nouveau — pipeline Nouveau → Contacté → Entretien → Décision.",
      })
      return true
    } catch {
      toast.error("Création impossible — vérifiez votre connexion.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const patchContract = async (id: string, status: string): Promise<boolean> => {
    setBusy(true)
    try {
      const r = await fetch("/api/franchise/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const body = (await r.json().catch(() => ({}))) as { contract?: ContractDTO; error?: string }
      if (!r.ok || !body.contract) {
        toast.error(body.error ?? "Transition impossible — réessayez.")
        return false
      }
      setContracts(prev => (prev ? prev.map(c => (c.id === id ? body.contract! : c)) : prev))
      toast.success(`Contrat ${body.contract.reference} — ${CONTRACT_STATUS_LABELS[body.contract.status]}`, {
        description: status === "SIGNED" ? "Signature horodatée à la date du jour." : "Transition tracée (audit franchise).",
      })
      return true
    } catch {
      toast.error("Transition impossible — vérifiez votre connexion.")
      return false
    } finally {
      setBusy(false)
    }
  }

  const createContract = async (payload: {
    candidateId: string
    entryFee: number
    royaltyPct: number
    durationYears: number
  }): Promise<boolean> => {
    setBusy(true)
    try {
      const r = await fetch("/api/franchise/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = (await r.json().catch(() => ({}))) as { contract?: ContractDTO; error?: string }
      if (!r.ok || !body.contract) {
        toast.error(body.error ?? "Création impossible — réessayez.")
        return false
      }
      setContracts(prev => [body.contract!, ...(prev ?? [])])
      toast.success(`Contrat ${body.contract.reference} créé (brouillon)`, {
        description: `${num(body.contract.entryFee)} DT d'entrée · ${fmt1(body.contract.royaltyPct)} % de royalties · ${body.contract.durationYears} ans.`,
      })
      return true
    } catch {
      toast.error("Création impossible — vérifiez votre connexion.")
      return false
    } finally {
      setBusy(false)
    }
  }

  /* ---- Dérivés ---- */
  const filtered = useMemo(() => {
    if (!candidates) return []
    const q = norm(search.trim())
    return candidates.filter(c => {
      const okStatus = statusFilter === "TOUS" || c.status === statusFilter
      const okSearch =
        !q ||
        norm(c.fullName).includes(q) ||
        norm(c.email).includes(q) ||
        norm(c.phone).includes(q) ||
        norm(c.gouvernorat).includes(q) ||
        norm(c.delegation ?? "").includes(q)
      return okStatus && okSearch
    })
  }, [candidates, search, statusFilter])

  const sheetCandidate = candidates?.find(c => c.id === sheetId) ?? null
  const sheetContract = contracts?.find(c => c.id === contractId) ?? null
  const approved = useMemo(
    () => (candidates ?? []).filter(c => c.status === "APPROVED"),
    [candidates],
  )

  const actives = (candidates ?? []).filter(c => c.status !== "REJECTED").length
  const activeContracts = (contracts ?? []).filter(c => c.status === "ACTIVE").length
  const enCours = (contracts ?? []).filter(c => c.status === "ACTIVE" || c.status === "SIGNED")
  const royMoy = enCours.length > 0 ? enCours.reduce((s, c) => s + c.royaltyPct, 0) / enCours.length : null
  const kitPreparedCount = (kit ?? []).filter(i => prepared[i.id]).length

  /* ---- États de chargement / erreur ---- */
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#b4552f]">
            <Ban className="h-4 w-4" aria-hidden />
            Franchise indisponible
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" className="h-11" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!candidates || !contracts || !kit) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- KPIs de tête ---- */}
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Candidatures actives"
          value={String(actives)}
          sub={`sur ${candidates.length} au total`}
          tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
        />
        <KpiCard
          icon={FileSignature}
          label="Contrats actifs"
          value={String(activeContracts)}
          sub={`sur ${contracts.length} contrats`}
          tone="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        />
        <KpiCard
          icon={Euro}
          label="Royalties moyennes"
          value={royMoy != null ? `${fmt1(royMoy)} %` : "—"}
          sub="contrats signés & actifs"
          tone="bg-[#fbeee8] text-[#b4552f] dark:bg-[#3a2118] dark:text-[#e8a186]"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Kit préparé"
          value={`${kitPreparedCount}/${kit.length}`}
          sub="progression locale (session)"
          tone="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        />
      </div>

      {/* ---- 3 volets internes ---- */}
      <Tabs defaultValue="candidatures" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger value="candidatures" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">Candidatures</span>
          </TabsTrigger>
          <TabsTrigger value="kit" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">Kit franchise</span>
          </TabsTrigger>
          <TabsTrigger value="contrats" className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]">
            <FileSignature className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">Contrats</span>
          </TabsTrigger>
        </TabsList>

        {/* ============ Volet Candidatures ============ */}
        <TabsContent value="candidatures" className="mt-0 space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label htmlFor="fr-search" className="text-xs font-medium text-muted-foreground">
                    Rechercher
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="fr-search"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Nom, e-mail, téléphone, gouvernorat…"
                      className="h-11 pl-9"
                    />
                  </div>
                </div>
                <div className="w-full space-y-1.5 sm:w-44">
                  <label htmlFor="fr-statut" className="text-xs font-medium text-muted-foreground">
                    Statut
                  </label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="fr-statut" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TOUS">Tous les statuts</SelectItem>
                      {Object.entries(CANDIDATE_STATUS_LABELS).map(([id, label]) => (
                        <SelectItem key={id} value={id}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  className="h-11 gap-1.5"
                  onClick={() => setReloadKey(k => k + 1)}
                  aria-label="Rafraîchir les candidatures"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </Button>
                <Button className="h-11 gap-1.5" onClick={() => { setNewSeq(s => s + 1); setNewOpen(true) }}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Nouvelle candidature
                </Button>
              </div>
            </CardContent>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted" aria-hidden>
                  <UserRound className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {candidates.length === 0 ? "Aucune candidature enregistrée" : "Aucune candidature ne correspond"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {candidates.length === 0
                      ? "Créez la première candidature interne (le formulaire public arrive en V2)."
                      : "Ajustez la recherche ou le filtre de statut."}
                  </p>
                </div>
                {candidates.length === 0 && (
                  <Button className="h-11 gap-1.5" onClick={() => { setNewSeq(s => s + 1); setNewOpen(true) }}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Nouvelle candidature
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="min-w-0 overflow-hidden">
              <div className="max-h-[26rem] overflow-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 z-10 bg-background">Candidat</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">Contact</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">Zone visée</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background hidden md:table-cell">Expérience</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background hidden md:table-cell">Budget</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">Statut</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-right">Déposée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(c => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setSheetId(c.id)}
                        aria-label={`Ouvrir le dossier de ${c.fullName}`}
                      >
                        <TableCell className="max-w-40 truncate font-medium">{c.fullName}</TableCell>
                        <TableCell className="max-w-52">
                          <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                          <span className="block truncate text-xs text-muted-foreground tabular-nums">{c.phone}</span>
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span className="block truncate text-xs font-medium">{c.gouvernorat}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {c.delegation ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate text-xs md:table-cell">
                          {EXPERIENCE_LABELS[c.experience] ?? c.experience}
                        </TableCell>
                        <TableCell className="hidden max-w-40 truncate text-xs md:table-cell">
                          {BUDGET_LABELS[c.investmentRange] ?? c.investmentRange}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[11px]", CANDIDATE_BADGE[c.status])}>
                            {CANDIDATE_STATUS_LABELS[c.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {fmtDateFr(c.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ============ Volet Kit franchise ============ */}
        <TabsContent value="kit" className="mt-0 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-sm font-bold">Kit d&apos;implantation — {kit.length} pièces de référence</h3>
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  {kitPreparedCount}/{kit.length} préparées
                </Badge>
                <Button
                  variant="outline"
                  className="ml-auto h-9 gap-1.5"
                  onClick={() => setKitConfirmAll(true)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Tout marquer préparé
                </Button>
              </div>

              {/* Progression globale (jauge) */}
              <div className="min-w-0 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Progression de la préparation de dossier</span>
                  <span className="tabular-nums">
                    {kit.length > 0 ? Math.round((kitPreparedCount / kit.length) * 100) : 0} %
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all dark:bg-emerald-400"
                    style={{ width: `${kit.length > 0 ? (kitPreparedCount / kit.length) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Progression locale à votre session (sessionStorage) — le référentiel des 12 pièces est
                  global à l&apos;enseigne et partagé avec les candidats. Aucune donnée n&apos;est écrite en
                  base V1.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {KIT_CATEGORIES.map(cat => {
              const items = kit.filter(i => i.category === cat.id)
              const done = items.filter(i => prepared[i.id]).length
              return (
                <Collapsible
                  key={cat.id}
                  open={openCats[cat.id] ?? false}
                  onOpenChange={o => setOpenCats(prev => ({ ...prev, [cat.id]: o }))}
                  className="min-w-0 rounded-lg border"
                >
                  <CollapsibleTrigger className="flex w-full min-w-0 items-center justify-between gap-2 p-3 text-left hover:bg-muted/40">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", cat.tone)}>
                        <cat.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold">{cat.label}</span>
                        <span className="block text-[10px] text-muted-foreground tabular-nums">
                          {done}/{items.length} préparées
                        </span>
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      {/* mini barre de progression par catégorie */}
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                          style={{ width: `${items.length > 0 ? (done / items.length) * 100 : 0}%` }}
                        />
                      </span>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openCats[cat.id] && "rotate-180")}
                        aria-hidden
                      />
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="min-w-0 space-y-2 border-t p-3">
                    {items.map(item => (
                      <li key={item.id} className="flex list-none items-start gap-3 rounded-md bg-muted/20 p-3">
                        <Checkbox
                          id={`kit-${item.id}`}
                          checked={Boolean(prepared[item.id])}
                          onCheckedChange={v =>
                            persistKit({ ...prepared, [item.id]: v === true })
                          }
                          className="mt-0.5"
                          aria-label={`Pièce préparée : ${item.title}`}
                        />
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`kit-${item.id}`} className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium leading-snug">{item.title}</span>
                            {item.mandatory ? (
                              <Badge
                                variant="outline"
                                className="border-[#e8a186] bg-[#fbeee8] text-[9px] text-[#b4552f] dark:border-[#8a4a30] dark:bg-[#3a2118] dark:text-[#e8a186]"
                              >
                                bloquante
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                                recommandée
                              </Badge>
                            )}
                          </label>
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{item.description}</p>
                        </div>
                      </li>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        </TabsContent>

        {/* ============ Volet Contrats ============ */}
        <TabsContent value="contrats" className="mt-0 space-y-4">
          <Card>
            <CardContent className="flex min-w-0 flex-wrap items-center gap-2 p-4 sm:p-6">
              <FileSignature className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <h3 className="text-sm font-bold">Contrats de franchise — {contracts.length}</h3>
              <p className="text-xs text-muted-foreground">
                Cycle à sens unique : Brouillon → Envoyé → Signé → Actif → Résilié.
              </p>
              <Button className="ml-auto h-11 gap-1.5" onClick={() => { setNewContractSeq(s => s + 1); setNewContractOpen(true) }} disabled={approved.length === 0}>
                <Plus className="h-4 w-4" aria-hidden />
                Nouveau contrat
              </Button>
              {approved.length === 0 && (
                <p className="w-full text-[11px] text-muted-foreground">
                  Aucun candidat approuvé pour l&apos;instant — approuvez d&apos;abord une candidature
                  (onglet « Candidatures », action « Approuver ») pour pouvoir créer un contrat.
                </p>
              )}
            </CardContent>
          </Card>

          {contracts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted" aria-hidden>
                  <FileSignature className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Aucun contrat enregistré</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Créez un premier contrat depuis un candidat approuvé.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="min-w-0 overflow-hidden">
              <div className="max-h-[26rem] overflow-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 z-10 bg-background">Référence</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">Candidat</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background">Statut</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-right">Royalties</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-right">Droit d&apos;entrée</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-right hidden md:table-cell">Durée</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-right">Signé le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map(c => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setContractId(c.id)}
                        aria-label={`Ouvrir le contrat ${c.reference}`}
                      >
                        <TableCell className="font-medium tabular-nums">{c.reference}</TableCell>
                        <TableCell className="max-w-44">
                          <span className="block truncate text-xs font-medium">{c.candidateName}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {c.candidateGouvernorat}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[11px]", CONTRACT_BADGE[c.status])}>
                            {CONTRACT_STATUS_LABELS[c.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {fmt1(c.royaltyPct)} %
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{num(c.entryFee)} DT</TableCell>
                        <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">
                          {c.durationYears} an{c.durationYears > 1 ? "s" : ""}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {fmtDateFr(c.signedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ---- Sheets & Dialogs ---- */}
      <CandidateSheet
        candidate={sheetCandidate}
        open={sheetCandidate != null}
        onOpenChange={v => !v && setSheetId(null)}
        onPatch={patchCandidate}
        busy={busy}
      />

      <NewCandidateDialog
        key={`candidature-${newSeq}`}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={createCandidate}
        busy={busy}
      />

      <ContractSheet
        contract={sheetContract}
        open={sheetContract != null}
        onOpenChange={v => !v && setContractId(null)}
        onPatch={patchContract}
        busy={busy}
      />

      <NewContractDialog
        key={`contrat-${newContractSeq}`}
        open={newContractOpen}
        onOpenChange={setNewContractOpen}
        approved={approved}
        onCreate={createContract}
        busy={busy}
      />

      {/* ---- Confirmation « tout marquer préparé » (kit) ---- */}
      <AlertDialog open={kitConfirmAll} onOpenChange={setKitConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer les {kit.length} pièces comme préparées ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les cases « préparé » du kit seront cochées (progression locale à votre session —
              réversible en décochant les pièces une à une).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Annuler</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => {
              const next: Record<string, boolean> = { ...prepared }
              for (const i of kit) next[i.id] = true
              persistKit(next)
              setKitConfirmAll(false)
              toast.success("Kit complet", {
                description: `${kit.length}/${kit.length} pièces marquées préparées (progression de session).`,
              })
            }}>
              Tout marquer préparé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
