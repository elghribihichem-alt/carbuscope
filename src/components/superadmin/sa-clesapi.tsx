"use client"

// T48-b — Super Administration · Clés API : clés d’intégration des enseignes.
// Liste DataViews (préfixe masqué, portée, quota, usage cumulé, dernière
// utilisation), KPIs, création dialog → le secret est affiché UNE SEULE FOIS
// dans un dialog d’alerte avec bouton copier (navigator.clipboard + toast),
// révocation avec confirmation. JAMAIS de secret ni d’empreinte dans la liste.
// API : /api/super/cles-api (GET, POST → { cle, secret }, DELETE ?id=).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { useAppStore } from "@/store/app-store"
import { hasPerm } from "@/lib/saas-perms"
import { fmtDate, timeAgo } from "./sa-shared"
import {
  Activity, AlertTriangle, Copy, Eye, KeyRound, Loader2, PlugZap, Plus, RefreshCw, ShieldAlert, ShieldOff, X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

interface CleApiDTO {
  id: string
  label: string
  keyPrefix: string // ex. « cs_live_9f »
  brandSlug: string | null
  scopes: string // read | read,write
  quotaHour: number
  callsTotal: number
  lastUsedAt: string | null
  active: boolean
  revokedAt: string | null
  createdBy: string
  createdAt: string
}

interface ClesResponse {
  cles: CleApiDTO[]
  stats: { actives: number; appelsTotal: number; quotaHoraire: number }
}

// ---------------------------------------------------------------- métadonnées

const MODULE = "sa.clesapi"

const BRANDS: { slug: string; nom: string; couleur: string }[] = [
  { slug: "agil", nom: "Agil", couleur: "#059669" },
  { slug: "totalenergies", nom: "TotalEnergies", couleur: "#d97706" },
  { slug: "shell", nom: "Shell", couleur: "#dc2626" },
  { slug: "staroil", nom: "Staroil", couleur: "#9333ea" },
  { slug: "ola", nom: "Ola Energy", couleur: "#e07856" },
]

const fmtInt = (n: number): string => new Intl.NumberFormat("fr-FR").format(n)

function scopeLabel(scopes: string): string {
  if (scopes.includes("write")) return "Lecture + écriture"
  if (scopes.includes("read")) return "Lecture seule"
  return scopes
}

// ---------------------------------------------------------------- dialog création

function CleDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (cle: CleApiDTO, secret: string) => void
}) {
  const [label, setLabel] = useState("")
  const [brand, setBrand] = useState("__plateforme__")
  const [scopes, setScopes] = useState("read")
  const [quota, setQuota] = useState("1000")
  const [saving, setSaving] = useState(false)

  async function creer() {
    if (!label.trim()) {
      toast.error("Le libellé de la clé est obligatoire")
      return
    }
    const quotaNum = Math.round(Number(quota.replace(",", ".")))
    if (!Number.isFinite(quotaNum) || quotaNum < 10) {
      toast.error("Quota horaire invalide (minimum 10 appels/h)")
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/super/cles-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          brandSlug: brand === "__plateforme__" ? null : brand,
          scopes: scopes === "read,write" ? "read,write" : "read",
          quotaHour: quotaNum,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { cle?: CleApiDTO; secret?: string; error?: string }
      if (!r.ok || !j.cle || !j.secret) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      onCreated(j.cle, j.secret)
      setLabel(""); setBrand("__plateforme__"); setScopes("read"); setQuota("1000")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la création de la clé")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Générer une clé API
          </DialogTitle>
          <DialogDescription>
            Le secret complet <span className="font-mono text-xs">cs_live_…</span> ne sera affiché qu’UNE SEULE FOIS
            après la création — copiez-le immédiatement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cle-label">Libellé *</Label>
            <Input id="cle-label" value={label} onChange={e => setLabel(e.target.value)} maxLength={100} placeholder="Ex. : Production — portail Agil" />
          </div>
          <div className="space-y-1.5">
            <Label>Enseigne cliente</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger aria-label="Enseigne de la clé"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__plateforme__">— Plateforme (éditeur CarbuScope) —</SelectItem>
                {BRANDS.map(b => <SelectItem key={b.slug} value={b.slug}>{b.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Portée (scopes)</Label>
            <RadioGroup value={scopes} onValueChange={setScopes} className="gap-2">
              <div className="flex items-start gap-2 rounded-lg border p-3">
                <RadioGroupItem value="read" id="sc-read" className="mt-0.5" />
                <label htmlFor="sc-read" className="cursor-pointer">
                  <span className="text-sm font-medium">Lecture seule</span>
                  <span className="block text-xs text-muted-foreground">Consultation des données (stations, prix, avis).</span>
                </label>
              </div>
              <div className="flex items-start gap-2 rounded-lg border p-3">
                <RadioGroupItem value="read,write" id="sc-rw" className="mt-0.5" />
                <label htmlFor="sc-rw" className="cursor-pointer">
                  <span className="text-sm font-medium">Lecture + écriture</span>
                  <span className="block text-xs text-muted-foreground">Mise à jour des fiches stations et publication.</span>
                </label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cle-quota">Quota horaire (appels/heure)</Label>
            <Input id="cle-quota" inputMode="numeric" value={quota} onChange={e => setQuota(e.target.value)} placeholder="1000" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="h-4 w-4" aria-hidden /> Annuler
          </Button>
          <Button onClick={creer} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Générer la clé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- secret one-shot

function SecretDialog({ cle, secret, onClose }: { cle: CleApiDTO | null; secret: string; onClose: () => void }) {
  async function copier() {
    try {
      await navigator.clipboard.writeText(secret)
      toast.success("Secret copié dans le presse-papiers")
    } catch {
      toast.error("Copie impossible — sélectionnez le secret manuellement")
    }
  }

  return (
    <AlertDialog open={!!cle} onOpenChange={o => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            Clé générée — copiez le secret maintenant
          </AlertDialogTitle>
          <AlertDialogDescription>
            Le secret de « {cle?.label} » ne sera <span className="font-semibold">jamais réaffiché</span> : seule son
            empreinte (SHA-256) est conservée côté serveur. Copiez-le dans votre coffre-fort avant de fermer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs" aria-live="polite">{secret}</code>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => { void copier() }}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copier
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction className="gap-1.5">
            <Eye className="h-4 w-4" aria-hidden /> J’ai copié le secret
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------- section

export function SaClesApi() {
  const session = useAppStore(s => s.session)
  const readonly = !(session?.role === "SUPER_ADMIN" || hasPerm(session?.permissions, MODULE, 2))

  const [data, setData] = useState<ClesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [secretCle, setSecretCle] = useState<CleApiDTO | null>(null)
  const [secret, setSecret] = useState("")
  const [toRevoke, setToRevoke] = useState<CleApiDTO | null>(null)
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/super/cles-api")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as ClesResponse
      setData(j)
      setError(null)
    } catch {
      setError("Impossible de charger les clés API.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function revoquer() {
    if (!toRevoke) return
    setRevoking(true)
    try {
      const r = await fetch(`/api/super/cles-api?id=${toRevoke.id}`, { method: "DELETE" })
      const j = (await r.json().catch(() => ({}))) as { cle?: CleApiDTO; error?: string }
      if (!r.ok || !j.cle) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      setData(prev => (prev ? { ...prev, cles: prev.cles.map(c => (c.id === toRevoke.id ? j.cle! : c)) } : prev))
      toast.success(`Clé « ${toRevoke.label} » révoquée définitivement`)
      setToRevoke(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la révocation")
    } finally {
      setRevoking(false)
    }
  }

  const cles = data?.cles ?? []
  const stats = useMemo(
    () => data?.stats ?? { actives: 0, appelsTotal: 0, quotaHoraire: 0 },
    [data],
  )

  const columns: DataViewColumn<CleApiDTO>[] = [
    {
      key: "label", header: "Clé",
      render: c => {
        const b = BRANDS.find(x => x.slug === c.brandSlug)
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{c.label}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{c.keyPrefix}••••••••</code>
              {b ? (
                <Badge variant="outline" className="gap-1.5 text-[11px]">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.couleur }} aria-hidden />
                  {b.nom}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">plateforme</Badge>
              )}
            </div>
          </div>
        )
      },
      sortValue: c => c.label,
    },
    { key: "scopes", header: "Portée", render: c => <Badge variant="secondary" className="text-[11px]">{scopeLabel(c.scopes)}</Badge>, hideInCards: true, sortValue: c => c.scopes },
    {
      key: "usage", header: "Usage cumulé", align: "right",
      render: c => (
        <div className="min-w-0 text-right">
          <p className="font-mono text-sm tabular-nums">{fmtInt(c.callsTotal)}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">quota {fmtInt(c.quotaHour)}/h</p>
        </div>
      ),
      sortValue: c => c.callsTotal,
    },
    {
      key: "lastUsedAt", header: "Dernière utilisation", align: "right",
      render: c => c.lastUsedAt
        ? <span className="whitespace-nowrap text-xs text-muted-foreground" title={fmtDate(c.lastUsedAt)}>{timeAgo(c.lastUsedAt)}</span>
        : <span className="text-xs italic text-muted-foreground">jamais</span>,
      sortValue: c => c.lastUsedAt ?? "",
    },
    {
      key: "etat", header: "État",
      render: c => c.active
        ? <Badge variant="outline" className="gap-1.5 border-emerald-300 bg-emerald-50 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Active</Badge>
        : <Badge variant="outline" className="gap-1.5 border-slate-300 bg-slate-100 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />Révoquée{c.revokedAt ? ` · ${fmtDate(c.revokedAt)}` : ""}</Badge>,
      sortValue: c => (c.active ? 1 : 0),
    },
    {
      key: "actions", header: "", align: "right", hideInCards: true, hideInNested: true, className: "w-28",
      render: c => c.active ? (
        <Button
          variant="outline" size="sm" className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
          disabled={readonly}
          onClick={e => { e.stopPropagation(); setToRevoke(c) }}
          aria-label={`Révoquer « ${c.label} »`}
        >
          <ShieldOff className="h-3.5 w-3.5" aria-hidden /> Révoquer
        </Button>
      ) : (
        <span className="text-xs italic text-muted-foreground">—</span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <PlugZap className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Clés API des enseignes
            {!readonly && (
              <Button size="sm" className="ml-auto h-7 gap-1.5" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Générer une clé
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {data ? `${cles.length} clé(s)` : "Chargement…"}
            </Button>
          </CardTitle>
          <CardDescription>
            Intégrations SI des enseignes : le secret n’est visible qu’à la création (empreinte SHA-256 conservée
            seule ensuite), les clés révoquées cessent immédiatement de fonctionner.
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
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des clés…
            </p>
          )}
          {data && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiCard label="Clés actives" value={stats.actives} icon={KeyRound} tone="success" sub="autorisées à appeler l’API" />
                <KpiCard label="Appels cumulés" value={fmtInt(stats.appelsTotal)} icon={Activity} tone="info" sub="toutes clés confondues" />
                <KpiCard label="Quota horaire total" value={fmtInt(stats.quotaHoraire)} icon={PlugZap} tone="default" sub="somme des clés actives" />
              </div>
              <DataViews
                columns={columns}
                rows={cles}
                rowKey={c => c.id}
                viewKey="sa-clesapi"
                cardColumns={1}
                maxHeightClassName="max-h-[26rem]"
                emptyMessage="Aucune clé API — générez la première pour l’intégration d’une enseigne."
              />
            </>
          )}
        </CardContent>
      </Card>

      <CleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(cle, s) => {
          setSecretCle(cle)
          setSecret(s)
          void load()
        }}
      />

      <SecretDialog cle={secretCle} secret={secret} onClose={() => { setSecretCle(null); setSecret("") }} />

      <AlertDialog open={!!toRevoke} onOpenChange={o => { if (!o) setToRevoke(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette clé API ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toRevoke?.label} » cessera immédiatement de fonctionner ({toRevoke?.keyPrefix}••••). La révocation est
              définitive : une nouvelle clé devra être générée pour l’intégration concernée. Action auditée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={e => { e.preventDefault(); void revoquer() }}
            >
              {revoking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
              Révoquer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
