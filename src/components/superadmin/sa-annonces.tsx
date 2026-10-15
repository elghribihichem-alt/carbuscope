"use client"

// T48-b — Super Administration · Annonces plateforme : bannières diffusées
// aux espaces (maintenance, nouveautés, décrets). Liste DataViews + KPIs,
// création dialog avec APERÇU VISUEL de la bannière (couleur selon le niveau :
// INFO émeraude · ATTENTION ambre · CRITIQUE terracotta), activation Switch,
// suppression avec confirmation.
// API : /api/super/annonces (GET ?active=, POST, PATCH ?id=, DELETE ?id=).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { useAppStore } from "@/store/app-store"
import { hasPerm } from "@/lib/saas-perms"
import { fmtDate, daysUntil } from "./sa-shared"
import {
  AlertTriangle, BellRing, CalendarClock, Loader2, Megaphone, Plus, RefreshCw, Trash2, X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

interface AnnonceDTO {
  id: string
  title: string
  message: string
  level: string // INFO | ATTENTION | CRITIQUE
  audience: string // TOUTES | ENSEIGNES | PORTAIL | OBSERVATOIRE
  active: boolean
  startsAt: string
  endsAt: string | null
  createdBy: string
  createdAt: string
}

interface AnnoncesResponse {
  annonces: AnnonceDTO[]
  stats: { actives: number; programmees: number; expirees: number }
}

// ---------------------------------------------------------------- métadonnées

const MODULE = "sa.annonces"

const LEVEL_META: Record<string, { label: string; className: string; bord: string; fond: string; texte: string; icone: string }> = {
  INFO: {
    label: "Info", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    bord: "border-l-emerald-500", fond: "bg-emerald-50 dark:bg-emerald-950/70", texte: "text-emerald-900 dark:text-emerald-100",
    icone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  ATTENTION: {
    label: "Attention", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bord: "border-l-amber-500", fond: "bg-amber-50 dark:bg-amber-950/70", texte: "text-amber-900 dark:text-amber-100",
    icone: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  },
  CRITIQUE: {
    label: "Critique", className: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
    bord: "border-l-orange-500", fond: "bg-orange-50 dark:bg-orange-950/70", texte: "text-orange-900 dark:text-orange-100",
    icone: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  },
}

const AUDIENCES: { value: string; label: string }[] = [
  { value: "TOUTES", label: "Tous les espaces" },
  { value: "ENSEIGNES", label: "Enseignes (portail + observatoire)" },
  { value: "PORTAIL", label: "Portail enseigne" },
  { value: "OBSERVATOIRE", label: "Observatoire B2B" },
]

const AUDIENCE_LABEL: Record<string, string> = Object.fromEntries(AUDIENCES.map(a => [a.value, a.label]))

const fmtDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

/** État de diffusion d'une annonce (calculé côté affichage). */
function etatAnnonce(a: AnnonceDTO): { key: "diffusee" | "programmee" | "expiree" | "desactivee"; label: string; className: string } {
  const now = Date.now()
  if (!a.active) return { key: "desactivee", label: "Désactivée", className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" }
  if (new Date(a.startsAt).getTime() > now) return { key: "programmee", label: "Programmée", className: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300" }
  if (a.endsAt && new Date(a.endsAt).getTime() < now) return { key: "expiree", label: "Expirée", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" }
  return { key: "diffusee", label: "Diffusée", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" }
}

/** Aperçu visuel de la bannière (couleur selon le niveau). */
function BanniereApercu({ level, title, message }: { level: string; title: string; message: string }) {
  const meta = LEVEL_META[level] ?? LEVEL_META.INFO
  return (
    <div
      role="img"
      aria-label="Aperçu de la bannière"
      className={cn("flex items-start gap-3 rounded-lg border border-l-4 p-3 shadow-sm", meta.bord, meta.fond, meta.texte)}
    >
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", meta.icone)}>
        <Megaphone className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-snug">{title || "Titre de l’annonce"}</p>
        <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed opacity-90">{message || "Message affiché en haut des espaces ciblés…"}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- dialog création

function AnnonceDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [level, setLevel] = useState("INFO")
  const [audience, setAudience] = useState("TOUTES")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [saving, setSaving] = useState(false)

  async function creer() {
    if (!title.trim() || !message.trim()) {
      toast.error("Le titre et le message sont obligatoires")
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/super/annonces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          level,
          audience,
          startsAt: startsAt || undefined,
          endsAt: endsAt || null,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { annonce?: AnnonceDTO; error?: string }
      if (!r.ok || !j.annonce) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      toast.success("Annonce diffusée")
      setTitle(""); setMessage(""); setLevel("INFO"); setAudience("TOUTES"); setStartsAt(""); setEndsAt("")
      onCreated()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la création de l’annonce")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Nouvelle annonce plateforme
          </DialogTitle>
          <DialogDescription>
            La bannière s’affiche dans les espaces ciblés dès la date de début (immédiate si vide).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="an-title">Titre *</Label>
            <Input id="an-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="Ex. : Maintenance planifiée dimanche 02:00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="an-message">Message *</Label>
            <Textarea id="an-message" value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder="Contenu de la bannière telle qu’elle apparaîtra aux utilisateurs…" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Niveau</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger aria-label="Niveau de l’annonce"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFO">Info — émeraude</SelectItem>
                  <SelectItem value="ATTENTION">Attention — ambre</SelectItem>
                  <SelectItem value="CRITIQUE">Critique — terracotta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger aria-label="Audience de l’annonce"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-starts">Début de diffusion</Label>
              <Input id="an-starts" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-ends">Fin (optionnel)</Label>
              <Input id="an-ends" type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Aperçu de la bannière</Label>
            <BanniereApercu level={level} title={title} message={message} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="h-4 w-4" aria-hidden /> Annuler
          </Button>
          <Button onClick={creer} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Diffuser l’annonce
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- section

export function SaAnnonces() {
  const session = useAppStore(s => s.session)
  const readonly = !(session?.role === "SUPER_ADMIN" || hasPerm(session?.permissions, MODULE, 2))

  const [data, setData] = useState<AnnoncesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<AnnonceDTO | null>(null)
  const [basculeId, setBasculeId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/super/annonces")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as AnnoncesResponse
      setData(j)
      setError(null)
    } catch {
      setError("Impossible de charger les annonces.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function basculer(a: AnnonceDTO, actif: boolean) {
    setBasculeId(a.id)
    try {
      const r = await fetch(`/api/super/annonces?id=${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: actif }),
      })
      const j = (await r.json().catch(() => ({}))) as { annonce?: AnnonceDTO; error?: string }
      if (!r.ok || !j.annonce) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      setData(prev => (prev ? { ...prev, annonces: prev.annonces.map(x => (x.id === a.id ? j.annonce! : x)) } : prev))
      toast.success(actif ? `Annonce « ${a.title} » activée` : `Annonce « ${a.title} » désactivée`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du basculement de l’annonce")
    } finally {
      setBasculeId(null)
    }
  }

  async function supprimer() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/super/annonces?id=${toDelete.id}`, { method: "DELETE" })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!r.ok || !j.ok) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      setData(prev => (prev ? { ...prev, annonces: prev.annonces.filter(x => x.id !== toDelete.id) } : prev))
      toast.success(`Annonce « ${toDelete.title} » supprimée`)
      setToDelete(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression")
    } finally {
      setDeleting(false)
    }
  }

  const annonces = data?.annonces ?? []
  const stats = useMemo(() => data?.stats ?? { actives: 0, programmees: 0, expirees: 0 }, [data])

  const columns: DataViewColumn<AnnonceDTO>[] = [
    {
      key: "title", header: "Annonce",
      render: a => {
        const meta = LEVEL_META[a.level] ?? LEVEL_META.INFO
        return (
          <div className="flex min-w-0 items-start gap-2">
            <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", a.level === "INFO" ? "bg-emerald-500" : a.level === "ATTENTION" ? "bg-amber-500" : "bg-orange-500")} aria-hidden />
            <div className="min-w-0">
              <p className="truncate font-medium">{a.title}</p>
              <p className="line-clamp-2 max-w-md text-xs leading-snug text-muted-foreground">{a.message}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className={cn("text-[10px]", meta.className)}>{meta.label}</Badge>
                <Badge variant="secondary" className="text-[10px]">{AUDIENCE_LABEL[a.audience] ?? a.audience}</Badge>
              </div>
            </div>
          </div>
        )
      },
      sortValue: a => a.title,
    },
    {
      key: "periode", header: "Diffusion",
      render: a => {
        const etat = etatAnnonce(a)
        const jours = a.endsAt ? daysUntil(a.endsAt) : null
        return (
          <div className="min-w-0 text-xs">
            <Badge variant="outline" className={cn("mb-1 text-[10px]", etat.className)}>{etat.label}</Badge>
            <p className="text-muted-foreground" title={fmtDateTime(a.startsAt)}>dès {fmtDate(a.startsAt)}</p>
            <p className="text-muted-foreground">
              {a.endsAt
                ? jours !== null && jours >= 0 ? `jusqu’au ${fmtDate(a.endsAt)} (${jours} j)` : `finie le ${fmtDate(a.endsAt)}`
                : "sans échéance"}
            </p>
          </div>
        )
      },
      sortValue: a => a.startsAt,
    },
    {
      key: "auteur", header: "Auteur", hideInCards: true,
      render: a => <span className="text-xs text-muted-foreground">{a.createdBy || "—"}</span>,
      sortValue: a => a.createdBy,
    },
    {
      key: "active", header: "Active", align: "center",
      render: a => (
        <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
          {basculeId === a.id
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            : (
              <Switch
                checked={a.active}
                disabled={readonly}
                onCheckedChange={v => { void basculer(a, v) }}
                aria-label={a.active ? `Désactiver « ${a.title} »` : `Activer « ${a.title} »`}
              />
            )}
        </div>
      ),
      sortValue: a => (a.active ? 1 : 0),
    },
    {
      key: "actions", header: "", align: "right", hideInCards: true, hideInNested: true, className: "w-20",
      render: a => (
        <Button
          variant="outline" size="sm" className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
          disabled={readonly}
          onClick={e => { e.stopPropagation(); setToDelete(a) }}
          aria-label={`Supprimer « ${a.title} »`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Supprimer
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Annonces plateforme
            {!readonly && (
              <Button size="sm" className="ml-auto h-7 gap-1.5" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Nouvelle annonce
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {data ? `${annonces.length} annonce(s)` : "Chargement…"}
            </Button>
          </CardTitle>
          <CardDescription>
            Bannières d’information diffusées aux espaces : maintenance planifiée, nouveautés produit, décrets prix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
              <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => { void load() }}>Réessayer</Button>
            </div>
          )}
          {!data && !error && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des annonces…
            </p>
          )}
          {data && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiCard label="Diffusées maintenant" value={stats.actives} icon={BellRing} tone="success" sub="visibles dans les espaces ciblés" />
                <KpiCard label="Programmées" value={stats.programmees} icon={CalendarClock} tone="info" sub="début de diffusion à venir" />
                <KpiCard label="Expirées" value={stats.expirees} icon={AlertTriangle} tone="warning" sub="date de fin dépassée" />
              </div>
              <DataViews
                columns={columns}
                rows={annonces}
                rowKey={a => a.id}
                viewKey="sa-annonces"
                cardColumns={1}
                maxHeightClassName="max-h-[30rem]"
                emptyMessage="Aucune annonce — diffusez la première depuis « Nouvelle annonce »."
                toolbarExtra={
                  annonces.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aperçu du niveau « Critique » : <span className="font-medium">bannière terracotta</span> · « Attention » : ambre · « Info » : émeraude
                    </p>
                  ) : undefined
                }
              />
            </>
          )}
        </CardContent>
      </Card>

      <AnnonceDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => { void load() }} />

      <AlertDialog open={!!toDelete} onOpenChange={o => { if (!o) setToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette annonce ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toDelete?.title} » sera définitivement retirée de la plateforme (action auditée). La bannière
              disparaît immédiatement des espaces où elle est diffusée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={e => { e.preventDefault(); void supprimer() }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
