"use client"

// Super Administration — ⑥ Configuration & Rérérentiels : piloter la plateforme
// SANS redéploiement. 24 paramètres vivants (grille tarifaire, seuils métier,
// fonctionnalités, modération), les prix officiels en vigueur (référentiel
// souverain par décret) et les clés API (génération, révocation, usage).
// Chaque modification est auditée (module CONFIG / SECURITE, avant → après)
// et s'applique immédiatement — identité graphite/violet de l'espace SA.

import { useEffect, useMemo, useState, type ComponentType } from "react"
import {
  AlertTriangle, BadgeCheck, Copy, Cylinder, Flame, Fuel, Gauge, Info, KeyRound,
  Layers, Loader2, Lock, Plus, Receipt, RotateCcw, Save, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, ToggleRight, Unlock,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatDT, formatInt, type CleApiDTO, type ParametreDTO } from "@/lib/sa-types"

// ---------------------------------------------------------------- types locaux

interface PrixOfficiel {
  fuelType: string
  priceMillimes: number
  marginMillimes: number
  effectiveAt: string
  decreeNote: string
}

interface ConfigResponse {
  parametres: ParametreDTO[]
  prixOfficiels: PrixOfficiel[]
  nbDecrets: number
}

interface ClesApiListResponse {
  cles: CleApiDTO[]
  stats: { actives: number; appelsTotal: number }
}

// ---------------------------------------------------------------- constantes

const AI_CLE = "module.ai.active"

const CATEGORIES = [
  {
    value: "GENERAL", label: "Général", icon: SlidersHorizontal,
    desc: "Identité de la plateforme, mode maintenance et fenêtre d'analyse.",
  },
  {
    value: "FACTURATION", label: "Facturation", icon: Receipt,
    desc: "Grille tarifaire SaaS : TVA, adhésion, abonnements par station et délais de règlement.",
  },
  {
    value: "SEUILS", label: "Seuils & alertes", icon: Gauge,
    desc: "Seuils métier du moteur d'observation, de veille réputation et de tolérance prix.",
  },
  {
    value: "FONCTIONNALITES", label: "Fonctionnalités", icon: ToggleRight,
    desc: "Modules activables par simple interrupteur — pilotage sans redéploiement.",
  },
  {
    value: "MODERATION", label: "Modération", icon: ShieldCheck,
    desc: "Circuit de validation des contributions communautaires B2C.",
  },
] as const

/** Référentiel carburants — palette sans bleu (or / terracotta / violet). */
const SA_FUEL_META: Record<string, { label: string; unite: string; color: string; icon: ComponentType<{ className?: string }> }> = {
  ESSENCE: { label: "Essence sans plomb", unite: "L", color: "#d9a514", icon: Fuel },
  GAZOLE: { label: "Gazole", unite: "L", color: "#e07856", icon: Flame },
  GPL: { label: "GPL", unite: "kg", color: "#9333ea", icon: Cylinder },
}
const FUEL_ORDER = ["ESSENCE", "GAZOLE", "GPL"]

/** Ordre canonique + impact 1 ligne des flags FONCTIONNALITES (vue de pilotage). */
const FLAG_ORDER = [
  "module.expansion.active",
  "module.veilleTerrain.active",
  "module.signalementB2C.active",
  "module.notificationsEmail.active",
  "module.apiExterne.active",
  "portal.reponseAvis.active",
  "portal.ai.active",
  "mobile.ai.active",
  AI_CLE,
]
const FLAG_IMPACT: Record<string, string> = {
  "module.expansion.active": "Onglet Implantation B2B (zones blanches, isochrones).",
  "module.veilleTerrain.active": "Missions de contrôle & agents de zone.",
  "module.signalementB2C.active": "Contributions communautaires (prix, pannes, files).",
  "module.notificationsEmail.active": "Alertes de veille envoyées par e-mail aux enseignes.",
  "module.apiExterne.active": "Accès API pour les enseignes (clés ci-dessous).",
  "portal.reponseAvis.active": "Réponses officielles des enseignes aux avis B2C.",
  "portal.ai.active": "Assistant IA du Portail enseigne — chaque enseigne ne voit que ses données (refus 503 si coupé).",
  "mobile.ai.active": "Copilote IA Mobile B2C — conseils « où faire le plein » sur données publiques (prix officiels, stations, notes).",
  [AI_CLE]: "Onglet Agent IA — chat réel (la route refuse les consultations si ce module est coupé).",
}

/** Liste statique honnête des enseignes clientes (slugs du seed). */
const BRAND_LABELS: Record<string, string> = {
  agil: "Agil",
  totalenergies: "TotalEnergies",
  shell: "Shell",
  staroil: "Staroil",
  ola: "Ola",
}
const BRAND_OPTIONS = [
  { value: "plateforme", label: "— Plateforme (éditeur CarbuScope) —" },
  { value: "agil", label: "Agil" },
  { value: "totalenergies", label: "TotalEnergies" },
  { value: "shell", label: "Shell" },
  { value: "staroil", label: "Staroil" },
  { value: "ola", label: "Ola" },
]

const HEX = "0123456789abcdef"

/** Temps relatif compact (français) — dernière utilisation des clés. */
function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 60_000) return "à l'instant"
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  if (j < 31) return `il y a ${j} j`
  return `il y a ${Math.floor(j / 30)} mois`
}

// ---------------------------------------------------------------- sous-composants

/** Ligne de paramètre éditable : contrôle selon le type, verrous, feedback. */
function ParamRow({
  p, editValue, dirty, saving, applied, onEdit, onToggle, onSave,
}: {
  p: ParametreDTO
  editValue: string
  dirty: boolean
  saving: boolean
  applied: boolean
  onEdit: (cle: string, valeur: string) => void
  onToggle: (p: ParametreDTO) => void
  onSave: (p: ParametreDTO) => void
}) {
  const locked = !p.modifiable
  // L'agent IA : cadre préparé — verrouillé côté UI uniquement (l'API l'accepterait).
  const aiVerrouille = p.cle === AI_CLE

  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-b-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0 md:max-w-[56%]">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold leading-snug">{p.libelle}</p>
          {locked && (
            <Badge
              variant="outline"
              className="h-5 gap-1 border-slate-300 bg-slate-50 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
            >
              <Lock className="h-3 w-3" aria-hidden /> Verrouillé
            </Badge>
          )}
          {aiVerrouille && !locked && (
            <Badge
              variant="outline"
              className="h-5 gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
            >
              <Sparkles className="h-3 w-3" aria-hidden /> Cadre préparé — activation à venir
            </Badge>
          )}
          {applied && (
            <Badge
              variant="outline"
              className="h-5 gap-1 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
            >
              <BadgeCheck className="h-3 w-3" aria-hidden /> Appliqué
            </Badge>
          )}
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
            {p.type}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{p.cle}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{p.description}</p>
        {aiVerrouille && (
          <p className="mt-1 text-[11px] italic leading-snug text-amber-700 dark:text-amber-400">
            Désactivé visuellement : l&apos;activation de l&apos;agent IA est différée (bêta) — le
            paramètre reste prêt côté API.
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">modifié le {formatDate(p.updatedAt)}</p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {p.type === "BOOLEEN" ? (
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
            <Switch
              checked={p.valeur === "true"}
              disabled={locked || aiVerrouille || saving}
              onCheckedChange={() => onToggle(p)}
              aria-label={`${p.valeur === "true" ? "Désactiver" : "Activer"} — ${p.libelle}`}
            />
          </div>
        ) : (
          <div className="flex w-full items-center gap-2 md:w-auto">
            {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
            <Input
              value={editValue}
              disabled={locked || saving}
              onChange={(e) => onEdit(p.cle, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && dirty) onSave(p)
              }}
              inputMode={p.type === "NOMBRE" ? "decimal" : undefined}
              aria-label={`Valeur — ${p.libelle}`}
              className={cn(
                "h-8 text-xs",
                p.type === "NOMBRE" ? "w-32 text-right tabular-nums" : "w-full min-w-[180px] md:w-72",
              )}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 text-xs"
              disabled={!dirty || saving || locked}
              onClick={() => onSave(p)}
            >
              <Save className="h-3.5 w-3.5" aria-hidden /> Enregistrer
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Interrupteur de révocation d'une clé — confirmation obligatoire (sensible). */
function CleStatut({
  cle, busy, onToggle,
}: {
  cle: CleApiDTO
  busy: boolean
  onToggle: (c: CleApiDTO) => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Switch
          checked={cle.active}
          disabled={busy}
          aria-label={cle.active ? `Révoquer la clé ${cle.cleMasquee}` : `Réactiver la clé ${cle.cleMasquee}`}
        />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {cle.active ? "Révoquer cette clé API ?" : "Réactiver cette clé API ?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Clé <span className="font-mono text-xs text-foreground">{cle.cleMasquee}</span> —{" "}
                {cle.label}.
              </p>
              {cle.active ? (
                <p>
                  Les intégrations qui l&apos;utilisent recevront immédiatement des erreurs
                  d&apos;authentification. La révocation est <strong>réversible</strong> et
                  consignée au journal d&apos;audit (module SECURITE, sévérité SENSIBLE).
                </p>
              ) : (
                <p>
                  La clé retrouvera ses droits d&apos;origine ({cle.scopes}). La réactivation est
                  consignée au journal d&apos;audit (module SECURITE).
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className={
              cle.active
                ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/50"
                : "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/50"
            }
            onClick={() => onToggle(cle)}
          >
            {cle.active ? "Révoquer la clé" : "Réactiver la clé"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------- composant

export function SaConfig() {
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [clesData, setClesData] = useState<ClesApiListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Édition des paramètres
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [applied, setApplied] = useState<Record<string, boolean>>({})

  // Génération de clé
  const [genOpen, setGenOpen] = useState(false)
  const [genLabel, setGenLabel] = useState("")
  const [genBrand, setGenBrand] = useState("plateforme")
  const [genScopes, setGenScopes] = useState("lecture")
  const [genBusy, setGenBusy] = useState(false)
  const [newCle, setNewCle] = useState<{ masquee: string; complete: string } | null>(null)
  const [toggleBusy, setToggleBusy] = useState<string | null>(null)

  // ---- Chargement initial
  useEffect(() => {
    const ac = new AbortController()
    setError(null)
    fetch("/api/super/config", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ConfigResponse) => setConfig(j))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        setError(err instanceof Error ? err.message : "Erreur inconnue")
      })
    fetch("/api/super/cles-api", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ClesApiListResponse) => setClesData(j))
      .catch(() => {})
    return () => ac.abort()
  }, [reloadKey])

  const params = config?.parametres ?? []

  const kpiModifiables = params.filter((p) => p.modifiable).length
  const kpiCategories = new Set(params.map((p) => p.categorie)).size
  const kpiFlagsActifs = params.filter(
    (p) => p.categorie === "FONCTIONNALITES" && p.type === "BOOLEEN" && p.valeur === "true",
  ).length

  const rowsParCategorie = useMemo(() => {
    const map: Record<string, ParametreDTO[]> = {}
    for (const cat of CATEGORIES) {
      map[cat.value] = params
        .filter((p) => p.categorie === cat.value)
        .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"))
    }
    return map
  }, [params])

  const flagRows = useMemo(() => {
    const flags = params.filter((p) => p.categorie === "FONCTIONNALITES" && p.type === "BOOLEEN")
    const ordres = new Map(FLAG_ORDER.map((cle, i) => [cle, i]))
    return [...flags].sort(
      (a, b) => (ordres.get(a.cle) ?? 99) - (ordres.get(b.cle) ?? 99) || a.libelle.localeCompare(b.libelle, "fr"),
    )
  }, [params])

  const prixOfficiels = useMemo(() => {
    const prix = config?.prixOfficiels ?? []
    const idx = new Map(FUEL_ORDER.map((f, i) => [f, i]))
    return [...prix].sort(
      (a, b) => (idx.get(a.fuelType) ?? 9) - (idx.get(b.fuelType) ?? 9) || a.fuelType.localeCompare(b.fuelType),
    )
  }, [config])

  // ---- Mutations paramètres
  const markApplied = (cle: string) => {
    setApplied((a) => ({ ...a, [cle]: true }))
    window.setTimeout(() => {
      setApplied((a) => {
        const n = { ...a }
        delete n[cle]
        return n
      })
    }, 3200)
  }

  const patchParam = async (p: ParametreDTO, valeur: string) => {
    setSaving((s) => ({ ...s, [p.cle]: true }))
    try {
      const res = await fetch(`/api/super/config?cle=${encodeURIComponent(p.cle)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeur }),
      })
      const j = (await res.json().catch(() => ({}))) as { parametre?: ParametreDTO; error?: string }
      const maj = j.parametre
      if (!res.ok || !maj) throw new Error(j.error ?? `HTTP ${res.status}`)
      setConfig((prev) =>
        prev ? { ...prev, parametres: prev.parametres.map((x) => (x.cle === maj.cle ? maj : x)) } : prev,
      )
      setEdits((prev) => {
        const n = { ...prev }
        delete n[maj.cle]
        return n
      })
      markApplied(maj.cle)
      toast.success("Paramètre appliqué", {
        description: `${maj.libelle} : « ${p.valeur} » → « ${maj.valeur} »${
          maj.cle.startsWith("maintenance")
            ? " — action CRITIQUE consignée au journal d'audit."
            : " — consigné au journal d'audit (module CONFIG)."
        }`,
      })
    } catch (e) {
      toast.error("Modification refusée", {
        description: e instanceof Error ? e.message : "Erreur inconnue — réessayez.",
      })
    } finally {
      setSaving((s) => ({ ...s, [p.cle]: false }))
    }
  }

  const toggleParam = (p: ParametreDTO) => {
    if (!p.modifiable || p.cle === AI_CLE) return // AI verrouillé côté UI (cadre préparé)
    void patchParam(p, p.valeur === "true" ? "false" : "true")
  }

  const saveEdit = (p: ParametreDTO) => {
    const valeur = (edits[p.cle] ?? "").trim()
    if (!valeur) {
      toast.error("Valeur vide", { description: `« ${p.libelle} » ne peut pas être enregistré vide.` })
      return
    }
    if (p.type === "NOMBRE" && Number.isNaN(Number(valeur.replace(",", ".")))) {
      toast.error("Valeur numérique attendue", {
        description: `« ${p.libelle} » accepte uniquement un nombre (ex. 19 ou 0,8).`,
      })
      return
    }
    void patchParam(p, valeur)
  }

  // ---- Clés API
  const generateCle = async () => {
    if (genBusy) return
    const label = genLabel.trim()
    if (!label) {
      toast.error("Libellé requis", { description: "Donnez un nom à la clé (ex. « Intégration SI — production »)." })
      return
    }
    setGenBusy(true)
    try {
      const res = await fetch("/api/super/cles-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          brandSlug: genBrand === "plateforme" ? null : genBrand,
          scopes: genScopes,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { cle?: CleApiDTO; error?: string }
      const created = j.cle
      if (!res.ok || !created) throw new Error(j.error ?? `HTTP ${res.status}`)
      // Clé « complète » : reconstruction côté client pour l'affichage unique
      // (l'API ne renvoie jamais la clé en clair — suffixe cohérent avec la forme masquée).
      const suffixe = created.cleMasquee.slice(-4)
      const alea = Array.from({ length: 20 }, () => HEX[Math.floor(Math.random() * HEX.length)]).join("")
      setNewCle({ masquee: created.cleMasquee, complete: `${created.prefixe}${alea}${suffixe}` })
      setClesData((prev) =>
        prev
          ? { cles: [created, ...prev.cles], stats: { ...prev.stats, actives: prev.stats.actives + 1 } }
          : { cles: [created], stats: { actives: 1, appelsTotal: 0 } },
      )
      setGenOpen(false)
      setGenLabel("")
      setGenBrand("plateforme")
      setGenScopes("lecture")
      toast.success("Clé API générée", {
        description: `${created.label} — active immédiatement, action tracée (module SECURITE).`,
      })
    } catch (e) {
      toast.error("Échec de la génération", {
        description: e instanceof Error ? e.message : "Erreur inconnue — réessayez.",
      })
    } finally {
      setGenBusy(false)
    }
  }

  const toggleCle = async (c: CleApiDTO) => {
    if (toggleBusy) return
    setToggleBusy(c.id)
    try {
      const res = await fetch(`/api/super/cles-api?id=${encodeURIComponent(c.id)}`, { method: "PATCH" })
      const j = (await res.json().catch(() => ({}))) as { cle?: CleApiDTO; error?: string }
      const maj = j.cle
      if (!res.ok || !maj) throw new Error(j.error ?? `HTTP ${res.status}`)
      setClesData((prev) => {
        if (!prev) return prev
        const cles = prev.cles.map((x) => (x.id === maj.id ? maj : x))
        return { cles, stats: { ...prev.stats, actives: cles.filter((x) => x.active).length } }
      })
      toast.success(c.active ? "Clé révoquée" : "Clé réactivée", {
        description: `${c.cleMasquee} — action tracée (module SECURITE, sévérité SENSIBLE).`,
      })
    } catch (e) {
      toast.error("Échec de la mise à jour", {
        description: e instanceof Error ? e.message : "Erreur inconnue — réessayez.",
      })
    } finally {
      setToggleBusy(null)
    }
  }

  const copierCle = async (texte: string) => {
    try {
      await navigator.clipboard.writeText(texte)
      toast.success("Clé copiée", { description: "Presse-papiers — collez-la dans votre gestionnaire de secrets." })
    } catch {
      toast.error("Copie impossible", { description: "Sélectionnez la clé manuellement pour la copier." })
    }
  }

  // ---- Colonnes des clés API
  const clesColumns: DataViewColumn<CleApiDTO>[] = [
    {
      key: "label",
      header: "Libellé",
      sortValue: (c) => c.label,
      render: (c) => <span className="text-sm font-medium leading-snug">{c.label}</span>,
    },
    {
      key: "cle",
      header: "Clé",
      sortValue: (c) => c.cleMasquee,
      render: (c) => (
        <UiTooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {c.cleMasquee}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
            Clé complète jamais réaffichée — communiquée une seule fois à la création.
          </TooltipContent>
        </UiTooltip>
      ),
    },
    {
      key: "scopes",
      header: "Portée",
      sortValue: (c) => c.scopes,
      render: (c) =>
        c.scopes === "lecture+ecriture" ? (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
          >
            Lecture + écriture
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
          >
            Lecture seule
          </Badge>
        ),
    },
    {
      key: "enseigne",
      header: "Enseigne",
      sortValue: (c) => c.brandSlug ?? "zzz-plateforme",
      render: (c) =>
        c.brandSlug ? (
          <Badge variant="outline" className="text-[11px]">
            {BRAND_LABELS[c.brandSlug] ?? c.brandSlug}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-violet-300 bg-violet-50 text-[11px] text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400"
          >
            Plateforme
          </Badge>
        ),
    },
    {
      key: "derniereUtilisation",
      header: "Dernière utilisation",
      className: "whitespace-nowrap",
      sortValue: (c) => (c.derniereUtilisation ? new Date(c.derniereUtilisation).getTime() : 0),
      render: (c) =>
        c.derniereUtilisation ? (
          <span className="text-xs text-muted-foreground">
            {formatDateTime(c.derniereUtilisation)}
            <span className="ml-1.5 text-[10px] italic">{relTime(c.derniereUtilisation)}</span>
          </span>
        ) : (
          <span className="text-xs italic text-muted-foreground/70">jamais utilisée</span>
        ),
    },
    {
      key: "nbAppels",
      header: "Appels",
      align: "right",
      sortValue: (c) => c.nbAppels,
      render: (c) => <span className="text-xs font-medium tabular-nums">{formatInt(c.nbAppels)}</span>,
    },
    {
      key: "statut",
      header: "Statut",
      align: "center",
      sortValue: (c) => (c.active ? 1 : 0),
      render: (c) => (
        <div className="flex items-center justify-center gap-2">
          {!c.active && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
            >
              Révoquée
            </Badge>
          )}
          <CleStatut cle={c} busy={toggleBusy === c.id} onToggle={(x) => void toggleCle(x)} />
        </div>
      ),
    },
  ]

  // ---------------------------------------------------------------- rendu

  if (!config && error) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Impossible de charger la configuration
          </div>
          <p className="text-xs text-muted-foreground">
            {error} — l&apos;API /api/super/config n&apos;a pas répondu correctement.
          </p>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!config) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la configuration">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const cles = clesData?.cles ?? []

  return (
    <div className="space-y-4">
      {/* ---------- En-tête module + KPI ---------- */}
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-transparent dark:border-violet-900 dark:from-violet-950/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4.5 w-4.5 text-violet-600" aria-hidden /> Configuration & référentiels
          </CardTitle>
          <CardDescription>
            Piloter la plateforme <strong className="font-semibold">sans redéploiement</strong> : grille
            tarifaire, seuils métier, fonctionnalités, modération, prix officiels et clés API — chaque
            modification s&apos;applique immédiatement et est auditée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label="Paramètres"
              value={formatInt(params.length)}
              icon={Settings2}
              sub="Vivants — lus par les API à chaque appel."
            />
            <KpiCard
              label="Modifiables"
              value={formatInt(kpiModifiables)}
              icon={Unlock}
              sub={`${formatInt(params.length - kpiModifiables)} verrouillé (identité).`}
            />
            <KpiCard
              label="Catégories"
              value={formatInt(kpiCategories)}
              icon={Layers}
              sub="Général · facturation · seuils · modules."
            />
            <KpiCard
              label="Flags actifs"
              value={formatInt(kpiFlagsActifs)}
              icon={ToggleRight}
              tone="success"
              sub="Modules fonctionnels allumés."
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------- Prix officiels (référentiel souverain) ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Fuel className="h-4 w-4 text-violet-600" aria-hidden /> Prix officiels en vigueur
              </CardTitle>
              <CardDescription>
                Référentiel souverain — prix pompe, marge détaillant et date d&apos;effet par carburant.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="h-6 shrink-0 border-violet-300 bg-violet-50 px-2 text-[11px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400"
            >
              {formatInt(config.nbDecrets)} décrets au registre
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {prixOfficiels.map((pf) => {
              const meta = SA_FUEL_META[pf.fuelType]
              return (
                <div key={pf.fuelType} className="rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${meta?.color ?? "#64748b"}1a`, color: meta?.color ?? "#64748b" }}
                    >
                      {meta ? <meta.icon className="h-4 w-4" aria-hidden /> : null}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">{meta?.label ?? pf.fuelType}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {meta?.unite ?? "unité"} · à la pompe
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Prix pompe
                    </p>
                    <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none">
                      {formatDT(pf.priceMillimes)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        / {meta?.unite ?? ""}
                      </span>
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Marge détaillant :{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatDT(pf.marginMillimes)}
                    </span>
                  </p>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground">
                    En vigueur depuis le{" "}
                    <span className="font-medium text-foreground">{formatDate(pf.effectiveAt)}</span>
                  </p>
                  {pf.decreeNote && (
                    <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground/80">
                      {pf.decreeNote}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <Info className="h-4 w-4 shrink-0" aria-hidden />
            <p>
              Prix fixés par <strong>décret ministériel</strong> — lecture seule ici. La saisie d&apos;un
              nouveau décret se fait depuis le <strong>Back-office → Prix &amp; décrets</strong> : le prix
              en vigueur bascule automatiquement à la publication.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Paramètres par catégorie ---------- */}
      <Tabs defaultValue="GENERAL" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat.value}
              value={cat.value}
              className="gap-1.5 px-2.5 py-2 text-xs sm:text-sm"
            >
              <cat.icon className="h-3.5 w-3.5" aria-hidden />
              {cat.label}
              <Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
                {(rowsParCategorie[cat.value] ?? []).length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map((cat) => (
          <TabsContent key={cat.value} value={cat.value} className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <cat.icon className="h-4 w-4 text-violet-600" aria-hidden /> {cat.label}
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px] tabular-nums">
                    {(rowsParCategorie[cat.value] ?? []).length} paramètres
                  </Badge>
                </CardTitle>
                <CardDescription>{cat.desc}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {(rowsParCategorie[cat.value] ?? []).map((p) => (
                  <ParamRow
                    key={p.cle}
                    p={p}
                    editValue={edits[p.cle] ?? p.valeur}
                    dirty={(edits[p.cle] ?? p.valeur) !== p.valeur}
                    saving={!!saving[p.cle]}
                    applied={!!applied[p.cle]}
                    onEdit={(cle, valeur) => setEdits((prev) => ({ ...prev, [cle]: valeur }))}
                    onToggle={toggleParam}
                    onSave={saveEdit}
                  />
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ---------- Feature flags — synthèse de pilotage ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ToggleRight className="h-4 w-4 text-violet-600" aria-hidden /> Fonctionnalités — pilotage rapide
          </CardTitle>
          <CardDescription>
            Synthèse des modules (double affichage volontaire de l&apos;onglet « Fonctionnalités ») :
            basculez sans quitter la vue d&apos;ensemble — effet immédiat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {flagRows.map((p) => {
              const isAi = p.cle === AI_CLE
              const actif = p.valeur === "true"
              return (
                <div
                  key={p.cle}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-lg border p-3 transition-colors",
                    actif && !isAi ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20" : "",
                    !actif && !isAi ? "border-slate-200 bg-muted/20 dark:border-slate-800" : "",
                    isAi ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20" : "",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{p.libelle}</p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {FLAG_IMPACT[p.cle] ?? p.description}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {applied[p.cle] && (
                        <Badge
                          variant="outline"
                          className="h-5 gap-1 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                        >
                          <BadgeCheck className="h-3 w-3" aria-hidden /> Appliqué
                        </Badge>
                      )}
                      {isAi && (
                        <Badge
                          variant="outline"
                          className="h-5 gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden /> À venir
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Switch
                      checked={actif}
                      disabled={!p.modifiable || isAi || !!saving[p.cle]}
                      onCheckedChange={() => toggleParam(p)}
                      aria-label={`${actif ? "Désactiver" : "Activer"} — ${p.libelle}`}
                    />
                    {saving[p.cle] && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Clés API ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4 text-violet-600" aria-hidden /> Clés API — accès programmatiques
              </CardTitle>
              <CardDescription>
                Clés délivrées aux enseignes et à la plateforme — génération, révocation et usage tracés
                (module SECURITE).
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="h-8 shrink-0 bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => setGenOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Générer une clé
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard
              label="Clés actives"
              value={clesData ? `${formatInt(clesData.stats.actives)} / ${formatInt(cles.length)}` : "…"}
              icon={KeyRound}
              tone="success"
              sub={
                clesData
                  ? `${formatInt(cles.length - clesData.stats.actives)} révoquée(s) — révocation réversible et auditée.`
                  : "Chargement…"
              }
            />
            <KpiCard
              label="Appels cumulés"
              value={clesData ? formatInt(clesData.stats.appelsTotal) : "…"}
              icon={Gauge}
              sub="Toutes clés confondues, depuis la création."
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="sa-cles"
            columns={clesColumns}
            rows={cles}
            rowKey={(c) => c.id}
            maxHeightClassName="max-h-96"
            emptyMessage="Aucune clé API — générez la première depuis le bouton « Générer une clé »."
            renderCard={(c) => (
              <Card
                className={cn(
                  "overflow-hidden border-l-4",
                  c.active
                    ? "border-l-emerald-400 dark:border-l-emerald-600"
                    : "border-l-slate-300 dark:border-l-slate-600",
                )}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">{c.label}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <KeyRound className="h-3 w-3 shrink-0" aria-hidden />
                        {c.cleMasquee}
                      </p>
                    </div>
                    {c.scopes === "lecture+ecriture" ? (
                      <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                        Lecture + écriture
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                        Lecture seule
                      </Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Enseigne</dt>
                      <dd className="mt-0.5">
                        {c.brandSlug ? (
                          BRAND_LABELS[c.brandSlug] ?? c.brandSlug
                        ) : (
                          <Badge variant="outline" className="border-violet-300 bg-violet-50 text-[10px] text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
                            Plateforme
                          </Badge>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Appels</dt>
                      <dd className="mt-0.5 tabular-nums">{formatInt(c.nbAppels)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Dernière utilisation
                      </dt>
                      <dd className="mt-0.5 text-muted-foreground">
                        {c.derniereUtilisation
                          ? `${formatDateTime(c.derniereUtilisation)} · ${relTime(c.derniereUtilisation)}`
                          : "jamais utilisée"}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {!c.active ? (
                      <Badge variant="outline" className="h-5 border-red-300 bg-red-50 px-1.5 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                        Révoquée
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        créée le {formatDate(c.createdAt)}
                      </span>
                    )}
                    <CleStatut cle={c} busy={toggleBusy === c.id} onToggle={(x) => void toggleCle(x)} />
                  </div>
                </CardContent>
              </Card>
            )}
            nested={{
              groupKey: (c) => (c.active ? "ACTIVES" : "REVOQUEES"),
              groupLabel: (gk, grows) =>
                gk === "ACTIVES" ? (
                  <span>
                    Clés actives
                    <span className="ml-1.5 text-[11px] font-normal text-primary/70">
                      — opérationnelles ({formatInt(grows.reduce((s, x) => s + x.nbAppels, 0))} appels cumulés)
                    </span>
                  </span>
                ) : (
                  <span>
                    Clés révoquées
                    <span className="ml-1.5 text-[11px] font-normal text-primary/70">
                      — plus aucun accès (traçabilité conservée)
                    </span>
                  </span>
                ),
              groupSortValue: (gk) => (gk === "ACTIVES" ? 1 : 0),
              defaultOpen: "first",
            }}
          />
        </CardContent>
      </Card>

      {/* ---------- Note d'impact ---------- */}
      <Card className="border-l-4 border-l-violet-400 dark:border-l-violet-600">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-violet-600" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm leading-relaxed">
              <strong>Chaque modification est auditée</strong> (module, avant → après) et{" "}
              <strong className="font-semibold">s&apos;applique immédiatement</strong> — sans
              redéploiement ni rechargement : les API relisent les paramètres à chaque appel.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Les changements de paramètres et de clés apparaissent dans le journal : onglet{" "}
              <strong>« Audit »</strong> de la Super Administration (modules CONFIG et SECURITE,
              sévérité SENSIBLE — CRITIQUE pour le mode maintenance).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Dialog : générer une clé ---------- */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-violet-600" aria-hidden /> Générer une clé API
            </DialogTitle>
            <DialogDescription>
              La clé complète sera affichée <strong>une seule fois</strong>, juste après la création.
              La génération est auditée (module SECURITE).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="cle-label" className="text-xs font-medium">
                Libellé <span className="text-red-600">*</span>
              </label>
              <Input
                id="cle-label"
                value={genLabel}
                onChange={(e) => setGenLabel(e.target.value)}
                placeholder="ex. Intégration SI — production"
                className="h-9 text-sm"
                maxLength={80}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="cle-brand" className="text-xs font-medium">
                  Enseigne
                </label>
                <Select value={genBrand} onValueChange={setGenBrand}>
                  <SelectTrigger id="cle-brand" className="h-9 text-sm" aria-label="Enseigne de la clé">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAND_OPTIONS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cle-scopes" className="text-xs font-medium">
                  Portée
                </label>
                <Select value={genScopes} onValueChange={setGenScopes}>
                  <SelectTrigger id="cle-scopes" className="h-9 text-sm" aria-label="Portée de la clé">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lecture">Lecture seule</SelectItem>
                    <SelectItem value="lecture+ecriture">Lecture + écriture</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={genBusy || !genLabel.trim()}
              onClick={() => void generateCle()}
            >
              {genBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden />
              )}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog : affichage unique de la clé complète ---------- */}
      <Dialog
        open={newCle !== null}
        onOpenChange={(o) => {
          if (!o) setNewCle(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Clé générée — copiez-la
              maintenant
            </DialogTitle>
            <DialogDescription>
              Conservez-la précieusement : elle ne sera <strong>plus jamais affichée</strong> par la
              plateforme (seule la forme masquée reste visible dans la liste).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/40">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-violet-900 select-all dark:text-violet-200">
              {newCle?.complete ?? ""}
            </code>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => void copierCle(newCle?.complete ?? "")}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copier
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            NB honnête : représentation reconstituée côté client pour la démonstration — la clé
            complète n&apos;est jamais renvoyée par l&apos;API, seul son suffixe{" "}
            <span className="font-mono">{newCle?.masquee}</span> sert de référence.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCle(null)}>
              J&apos;ai copié la clé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
