"use client"

// T48-b — Super Administration · Sauvegardes de la base : historique DataViews
// + KPIs (nombre, taille cumulée, dernier statut) + bouton « Sauvegarder
// maintenant » (copie PHYSIQUE réelle de db/custom.db — taille et durée
// mesurées côté serveur) avec état de chargement et toast.
// API : /api/super/sauvegardes (GET, POST).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { useAppStore } from "@/store/app-store"
import { hasPerm } from "@/lib/saas-perms"
import { fmtDate, timeAgo } from "./sa-shared"
import {
  AlertTriangle, CheckCircle2, Database, HardDriveDownload, Loader2, RefreshCw, ShieldCheck, XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

interface SauvegardeDTO {
  id: string
  label: string
  kind: string // MANUELLE | AUTOMATIQUE
  scope: string // COMPLETE | DONNEES | CONFIG
  sizeMb: number
  status: string // EN_COURS | TERMINEE | ECHEC
  durationMs: number
  by: string
  createdAt: string
}

interface SauvegardesResponse {
  sauvegardes: SauvegardeDTO[]
  stats: { total: number; tailleTotaleMb: number; dernierStatut: string }
}

// ---------------------------------------------------------------- métadonnées

const MODULE = "sa.sauvegardes"

const STATUT_META: Record<string, { label: string; className: string }> = {
  TERMINEE: { label: "Terminée", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  EN_COURS: { label: "En cours", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  ECHEC: { label: "Échec", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

const KIND_META: Record<string, { label: string; className: string }> = {
  MANUELLE: { label: "Manuelle", className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400" },
  AUTOMATIQUE: { label: "Automatique", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
}

const SCOPE_LABEL: Record<string, string> = {
  COMPLETE: "Base complète",
  DONNEES: "Données",
  CONFIG: "Configuration",
}

const fmtMo = (mb: number): string =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: mb < 10 ? 2 : 1, maximumFractionDigits: 2 }).format(mb)} Mo`

const fmtDuree = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`)

// ---------------------------------------------------------------- section

export function SaSauvegardes() {
  const session = useAppStore(s => s.session)
  const readonly = !(session?.role === "SUPER_ADMIN" || hasPerm(session?.permissions, MODULE, 2))

  const [data, setData] = useState<SauvegardesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sauvegardant, setSauvegardant] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/super/sauvegardes")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as SauvegardesResponse
      setData(j)
      setError(null)
    } catch {
      setError("Impossible de charger l’historique des sauvegardes.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function sauvegarderMaintenant() {
    setSauvegardant(true)
    try {
      const r = await fetch("/api/super/sauvegardes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
      const j = (await r.json().catch(() => ({}))) as { sauvegarde?: SauvegardeDTO; fichier?: string; error?: string }
      if (!r.ok || !j.sauvegarde) throw new Error(j.error ?? `Erreur HTTP ${r.status}`)
      toast.success(`Sauvegarde terminée : ${fmtMo(j.sauvegarde.sizeMb)} copiés en ${fmtDuree(j.sauvegarde.durationMs)}`)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la sauvegarde manuelle")
      void load() // une ligne ECHEC a pu être journalisée
    } finally {
      setSauvegardant(false)
    }
  }

  const sauvegardes = data?.sauvegardes ?? []
  const stats = useMemo(
    () => data?.stats ?? { total: 0, tailleTotaleMb: 0, dernierStatut: "—" },
    [data],
  )

  const columns: DataViewColumn<SauvegardeDTO>[] = [
    {
      key: "createdAt", header: "Date",
      render: s => (
        <div className="whitespace-nowrap">
          <p className="text-sm font-medium">{fmtDate(s.createdAt)}</p>
          <p className="text-xs text-muted-foreground" title={new Date(s.createdAt).toLocaleString("fr-FR")}>{timeAgo(s.createdAt)}</p>
        </div>
      ),
      sortValue: s => s.createdAt,
    },
    {
      key: "label", header: "Sauvegarde",
      render: s => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge className={cn("text-[10px]", KIND_META[s.kind]?.className ?? "")}>{KIND_META[s.kind]?.label ?? s.kind}</Badge>
            <Badge variant="secondary" className="text-[10px]">{SCOPE_LABEL[s.scope] ?? s.scope}</Badge>
            {s.by && s.by !== "système" && <Badge variant="outline" className="text-[10px] text-muted-foreground">par {s.by}</Badge>}
          </div>
        </div>
      ),
      sortValue: s => s.label,
    },
    {
      key: "sizeMb", header: "Taille", align: "right",
      render: s => <span className="whitespace-nowrap font-mono text-sm tabular-nums">{fmtMo(s.sizeMb)}</span>,
      sortValue: s => s.sizeMb,
    },
    {
      key: "durationMs", header: "Durée", align: "right", hideInCards: true,
      render: s => <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{fmtDuree(s.durationMs)}</span>,
      sortValue: s => s.durationMs,
    },
    {
      key: "status", header: "Statut",
      render: s => {
        const meta = STATUT_META[s.status] ?? { label: s.status, className: "" }
        return (
          <Badge variant="outline" className={cn("text-[11px] font-medium", meta.className)}>
            {s.status === "TERMINEE" && <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />}
            {s.status === "ECHEC" && <XCircle className="mr-1 h-3 w-3" aria-hidden />}
            {s.status === "EN_COURS" && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
            {meta.label}
          </Badge>
        )
      },
      sortValue: s => s.status,
    },
  ]

  const dernier = sauvegardes[0]
  const dernierMeta = dernier ? (STATUT_META[dernier.status] ?? { label: dernier.status, className: "" }) : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Database className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Sauvegardes de la base
            <Button
              size="sm"
              className="ml-auto h-7 gap-1.5"
              onClick={() => { void sauvegarderMaintenant() }}
              disabled={sauvegardant || readonly}
              title={readonly ? "Lecture seule sur ce module" : "Copie physique de db/custom.db"}
            >
              {sauvegardant ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <HardDriveDownload className="h-3.5 w-3.5" aria-hidden />}
              {sauvegardant ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs" onClick={() => { void load() }} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              {data ? `${sauvegardes.length} entrée(s)` : "Chargement…"}
            </Button>
          </CardTitle>
          <CardDescription>
            Historique des copies de la base SQLite — automatiques (quotidiennes 02:30) et manuelles. Chaque
            sauvegarde manuelle copie physiquement le fichier <span className="font-mono text-xs">db/custom.db</span>.
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
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de l’historique…
            </p>
          )}
          {data && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiCard
                  label="Sauvegardes historisées"
                  value={stats.total}
                  icon={ShieldCheck}
                  tone="info"
                  sub={dernier ? `dernière : ${timeAgo(dernier.createdAt)}` : "aucune pour l’instant"}
                />
                <KpiCard
                  label="Taille cumulée"
                  value={fmtMo(stats.tailleTotaleMb)}
                  icon={HardDriveDownload}
                  tone="default"
                  sub="toutes copies confondues"
                />
                <KpiCard
                  label="Dernier statut"
                  value={<Badge variant="outline" className={cn("text-[11px]", dernierMeta?.className)}>{stats.dernierStatut}</Badge>}
                  icon={stats.dernierStatut === "ECHEC" ? AlertTriangle : CheckCircle2}
                  tone={stats.dernierStatut === "ECHEC" ? "danger" : stats.dernierStatut === "TERMINEE" ? "success" : "default"}
                  sub={dernier ? fmtMo(dernier.sizeMb) : undefined}
                />
              </div>
              <DataViews
                columns={columns}
                rows={sauvegardes}
                rowKey={s => s.id}
                viewKey="sa-sauvegardes"
                nested={{
                  groupKey: s => (s.createdAt.slice(0, 7) || "inconnu"),
                  groupLabel: gk => {
                    const d = new Date(`${gk}-01T00:00:00`)
                    return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d)
                  },
                  hideColumnKeyInGroups: "createdAt",
                  defaultOpen: "first",
                }}
                maxHeightClassName="max-h-[26rem]"
                emptyMessage="Aucune sauvegarde historisée — lancez la première depuis « Sauvegarder maintenant »."
              />
              {readonly && (
                <p className="text-xs text-muted-foreground">
                  Votre rôle est en lecture seule : le déclenchement des sauvegardes est réservé au niveau écriture.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
