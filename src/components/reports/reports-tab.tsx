'use client'

// A.8 — Onglet « Rapports » : génération, rapports récents et programmations

import * as React from "react"
import { toast } from "sonner"
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Crosshair,
  Download,
  FileSpreadsheet,
  FileStack,
  FileText,
  Gauge,
  Loader2,
  MapPin,
  Plus,
  Presentation,
  Radar,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { KpiCard } from "@/components/shell/kpi-card"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { ROLE_LABELS, useAppStore } from "@/store/app-store"
import { REPORT_TYPE_LABELS, type GovernoratRow, type ReportDTO, type ReportScheduleDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { downloadReportCsv } from "./report-csv"

const REPORT_TYPES: { value: string; label: string; desc: string; icon: LucideIcon; tint: string }[] = [
  {
    value: "CONCURRENCE",
    label: "Analyse concurrentielle",
    desc: "Parts de marché, saturation et concurrents proches.",
    icon: Crosshair,
    tint: "bg-[#e07856]/15 text-[#b8542f] dark:text-[#e8a084]",
  },
  {
    value: "IMPLANTATION",
    label: "Potentiel d'implantation",
    desc: "Densité, parc automobile et zones sous-desservies.",
    icon: MapPin,
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  {
    value: "PERFORMANCE",
    label: "Performance réseau",
    desc: "Trafic, tension et suivi des stations.",
    icon: Gauge,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  {
    value: "VEILLE",
    label: "Veille",
    desc: "Mouvements concurrentiels et alertes.",
    icon: Radar,
    tint: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  },
]

const REPORT_TYPE_BADGES: Record<string, string> = {
  CONCURRENCE: "border-[#e07856]/60 bg-[#e07856]/10 text-[#b8542f] dark:text-[#e8a084]",
  IMPLANTATION: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  PERFORMANCE: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  VEILLE: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
}

const FORMAT_ICONS: Record<string, LucideIcon> = {
  PDF: FileText,
  Excel: FileSpreadsheet,
  PowerPoint: Presentation,
}

const PERIODS = ["Mois courant", "Trimestre courant", "Semestre courant", "Année courante"]

const CHANNELS = ["Email", "Email + plateforme", "Notification push"]

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Hebdomadaire",
  MONTHLY: "Mensuelle",
  REALTIME: "Temps réel",
}

const SCHEDULE_TYPE_ICONS: Record<string, LucideIcon> = {
  WEEKLY: CalendarDays,
  MONTHLY: CalendarRange,
  REALTIME: BellRing,
}

const SCHEDULE_TYPE_BADGES: Record<string, string> = {
  WEEKLY: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  MONTHLY: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  REALTIME: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
}

export function ReportsTab() {
  const role = useAppStore((s) => s.role)
  const [reports, setReports] = React.useState<ReportDTO[] | null>(null)
  const [schedules, setSchedules] = React.useState<ReportScheduleDTO[] | null>(null)
  const [governorats, setGovernorats] = React.useState<GovernoratRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = React.useState(0)

  // Générateur
  const [gType, setGType] = React.useState("CONCURRENCE")
  const [gPeriod, setGPeriod] = React.useState(PERIODS[0])
  const [gScope, setGScope] = React.useState("National")
  const [gFormat, setGFormat] = React.useState("PDF")
  const [generating, setGenerating] = React.useState(false)

  // Nouvelle programmation
  const [sName, setSName] = React.useState("")
  const [sType, setSType] = React.useState("WEEKLY")
  const [sTarget, setSTarget] = React.useState("National")
  const [sChannel, setSChannel] = React.useState(CHANNELS[0])
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/reports").then((r) => r.json()),
      fetch("/api/reports/schedules").then((r) => r.json()),
      fetch("/api/governorats").then((r) => r.json()),
    ])
      .then(
        ([rep, sch, gov]: [
          { reports?: ReportDTO[] },
          { schedules?: ReportScheduleDTO[] },
          { governorats?: GovernoratRow[] },
        ]) => {
          if (cancelled) return
          setReports(rep.reports ?? [])
          setSchedules(sch.schedules ?? [])
          setGovernorats(gov.governorats ?? [])
        }
      )
      .catch(() => {
        if (!cancelled) setError("Les rapports et programmations n'ont pas pu être chargés.")
      })
    return () => {
      cancelled = true
    }
  }, [reloadNonce])

  const generate = () => {
    setGenerating(true)
    fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: gType, period: gPeriod, scope: gScope, format: gFormat, generatedBy: ROLE_LABELS[role] ?? "Utilisateur CarbuScope" }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("generate failed")
        return r.json() as Promise<{ report: ReportDTO }>
      })
      .then((j) => {
        setReports((prev) => (prev ? [j.report, ...prev] : [j.report]))
        toast.success("Rapport généré", { description: `« ${j.report.name} » (${j.report.sizeKb} Ko) ajouté en tête des rapports récents.` })
        return downloadReportCsv(j.report)
      })
      .then(() => {
        toast.info("Téléchargement lancé", { description: "Export CSV récapitulatif : métadonnées + extrait de données du rapport." })
      })
      .catch(() => {
        toast.error("Génération impossible", { description: "Le rapport n'a pas pu être généré. Réessayez." })
      })
      .finally(() => setGenerating(false))
  }

  const handleDownload = (r: ReportDTO) => {
    downloadReportCsv(r)
      .then(() => toast.info("Téléchargement lancé", { description: `« ${r.name} » — export CSV récapitulatif.` }))
      .catch(() => toast.error("Téléchargement impossible", { description: "L'export CSV a échoué." }))
  }

  const handleDelete = (r: ReportDTO) => {
    setReports((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev))
    toast.success("Rapport supprimé", { description: `« ${r.name} » retiré de la liste (l'historique serveur est conservé).` })
  }

  // Colonnes des rapports récents (DataViews : Tableau / Cartes / Arborescence par type)
  const reportColumns: DataViewColumn<ReportDTO>[] = [
    {
      key: "name", header: "Rapport",
      sortValue: (r) => r.name,
      className: "max-w-56",
      render: (r) => <span className="block truncate text-xs font-medium" title={r.name}>{r.name}</span>,
    },
    {
      key: "type", header: "Type",
      sortValue: (r) => REPORT_TYPE_LABELS[r.type] ?? r.type,
      render: (r) => (
        <Badge variant="outline" className={cn("text-[11px]", REPORT_TYPE_BADGES[r.type] ?? "")}>
          {REPORT_TYPE_LABELS[r.type] ?? r.type}
        </Badge>
      ),
    },
    {
      key: "period", header: "Période",
      sortValue: (r) => r.period,
      render: (r) => <span className="text-xs">{r.period}</span>,
    },
    {
      key: "scope", header: "Périmètre",
      sortValue: (r) => r.scope,
      render: (r) => <span className="text-xs">{r.scope}</span>,
    },
    {
      key: "format", header: "Format",
      sortValue: (r) => r.format,
      render: (r) => {
        const FormatIcon = FORMAT_ICONS[r.format] ?? FileText
        return (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <FormatIcon className="h-3 w-3" />
            {r.format}
          </Badge>
        )
      },
    },
    {
      key: "sizeKb", header: "Taille", align: "right",
      sortValue: (r) => r.sizeKb,
      render: (r) => <span className="text-xs tabular-nums">{r.sizeKb} Ko</span>,
    },
    {
      key: "createdAt", header: "Date",
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => (
        <span className="whitespace-nowrap text-xs tabular-nums">
          {new Date(r.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "generatedBy", header: "Généré par",
      sortValue: (r) => r.generatedBy,
      render: (r) => <span className="text-xs text-muted-foreground">{r.generatedBy}</span>,
    },
    {
      key: "actions", header: "Actions", align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => handleDownload(r)}
            aria-label={`Télécharger ${r.name}`}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-red-600"
            onClick={() => handleDelete(r)}
            aria-label={`Supprimer ${r.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const toggleSchedule = (s: ReportScheduleDTO) => {
    const next = !s.active
    setSchedules((prev) => (prev ? prev.map((x) => (x.id === s.id ? { ...x, active: next } : x)) : prev))
    fetch("/api/reports/schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, active: next }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("patch failed")
        return r.json() as Promise<{ schedule: ReportScheduleDTO }>
      })
      .then((j) => {
        setSchedules((prev) => (prev ? prev.map((x) => (x.id === j.schedule.id ? j.schedule : x)) : prev))
        toast.success(next ? "Programmation activée" : "Programmation désactivée", { description: j.schedule.name })
      })
      .catch(() => {
        setSchedules((prev) => (prev ? prev.map((x) => (x.id === s.id ? { ...x, active: s.active } : x)) : prev))
        toast.error("Modification impossible", { description: "L'état de la programmation n'a pas pu être modifié." })
      })
  }

  const createSchedule = () => {
    if (!sName.trim()) return
    setCreating(true)
    fetch("/api/reports/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sName.trim(), type: sType, target: sTarget.trim() || "National", channel: sChannel }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("create failed")
        return r.json() as Promise<{ schedule: ReportScheduleDTO }>
      })
      .then((j) => {
        setSchedules((prev) => (prev ? [j.schedule, ...prev] : [j.schedule]))
        toast.success("Programmation créée", {
          description: `« ${j.schedule.name} » — ${SCHEDULE_TYPE_LABELS[j.schedule.type] ?? j.schedule.type} via ${j.schedule.channel}.`,
        })
        setSName("")
        setSType("WEEKLY")
        setSTarget("National")
        setSChannel(CHANNELS[0])
      })
      .catch(() => {
        toast.error("Création impossible", { description: "La programmation n'a pas pu être enregistrée." })
      })
      .finally(() => setCreating(false))
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message={error} retry={() => setReloadNonce((n) => n + 1)} />
      </div>
    )
  }
  if (!reports || !schedules) return <TabSkeleton title="Chargement des rapports…" />

  const activeSchedules = schedules.filter((s) => s.active).length

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* En-tête */}
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileStack className="h-4.5 w-4.5" />
          </span>
          Rapports &amp; programmations
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Générez des rapports d&apos;analyse (PDF, Excel, PowerPoint), consultez les rapports récents et programmez
          des livraisons automatiques pour vos équipes.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard label="Rapports disponibles" value={reports.length} icon={FileStack} sub="générés sur la plateforme" />
          <KpiCard
            label="Programmations actives"
            value={activeSchedules}
            icon={CalendarClock}
            tone="success"
            sub={`${schedules.length} programmations au total`}
          />
        </div>
      </header>

      {/* A.8.1 — Générateur */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Générateur de rapport
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Le rapport est enregistré dans la liste et un export CSV récapitulatif est téléchargé immédiatement.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div role="radiogroup" aria-label="Type de rapport" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {REPORT_TYPES.map((t) => {
              const Icon = t.icon
              const selected = gType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setGType(t.value)}
                  className={cn(
                    "flex h-full flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all hover:shadow-md",
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t.tint)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold leading-tight">{t.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{t.desc}</span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Période</Label>
              <Select value={gPeriod} onValueChange={setGPeriod}>
                <SelectTrigger className="w-full" aria-label="Période du rapport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Périmètre géographique</Label>
              <Select value={gScope} onValueChange={setGScope}>
                <SelectTrigger className="w-full" aria-label="Périmètre géographique">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="National">National</SelectItem>
                  {governorats.map((g) => (
                    <SelectItem key={g.name} value={g.name}>
                      {g.name}
                      <span className="ml-1 text-[11px] text-muted-foreground">({g.stations} stations)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Format</Label>
              <ToggleGroup
                type="single"
                value={gFormat}
                onValueChange={(v) => {
                  if (v) setGFormat(v)
                }}
                variant="outline"
                className="flex w-full gap-1"
                aria-label="Format du rapport"
              >
                {Object.entries(FORMAT_ICONS).map(([fmt, Icon]) => (
                  <ToggleGroupItem
                    key={fmt}
                    value={fmt}
                    className="h-9 flex-1 gap-1.5 text-xs data-[state=on]:text-primary"
                    aria-label={fmt}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {fmt}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={generate} disabled={generating} className="h-10">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Génération en cours…" : "Générer le rapport"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {REPORT_TYPE_LABELS[gType]} · {gPeriod} · {gScope} · {gFormat}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* A.8.2 — Rapports récents (DataViews : Tableau / Cartes / Arborescence par type) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileStack className="h-4 w-4 text-primary" />
            Rapports récents
            <Badge variant="secondary" className="font-normal">
              {reports.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Rapports générés sur la plateforme · 3 modes d&apos;affichage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="reports-list"
            columns={reportColumns}
            rows={reports}
            rowKey={(r) => r.id}
            emptyMessage="Aucun rapport. Générez votre premier rapport avec le générateur ci-dessus."
            maxHeightClassName="max-h-[26rem]"
            nested={{
              groupKey: (r) => r.type,
              groupLabel: (gk, grows) => {
                const TypeIcon = REPORT_TYPES.find((t) => t.value === gk)?.icon ?? FileText
                const latest = grows.reduce<ReportDTO | null>(
                  (acc, r) => (!acc || new Date(r.createdAt) > new Date(acc.createdAt) ? r : acc), null,
                )
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <TypeIcon className="h-3.5 w-3.5" aria-hidden />
                    {REPORT_TYPE_LABELS[gk] ?? gk}
                    <span className="ml-1 text-[11px] font-normal text-primary/70">
                      — {grows.length} rapport{grows.length > 1 ? "s" : ""}
                      {latest ? ` · plus récent : ${new Date(latest.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    </span>
                  </span>
                )
              },
              groupSortValue: (_gk, grows) => grows.length,
              hideColumnKeyInGroups: "type",
              defaultOpen: "first",
            }}
            renderCard={(r) => {
              const FormatIcon = FORMAT_ICONS[r.format] ?? FileText
              return (
                <Card className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold leading-snug" title={r.name}>{r.name}</p>
                      <Badge variant="outline" className={cn("shrink-0 text-[11px]", REPORT_TYPE_BADGES[r.type] ?? "")}>
                        {REPORT_TYPE_LABELS[r.type] ?? r.type}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{r.period} · {r.scope}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3">
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Format</dt>
                        <dd className="mt-0.5">
                          <Badge variant="outline" className="gap-1 text-[11px]">
                            <FormatIcon className="h-3 w-3" />
                            {r.format}
                          </Badge>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Taille</dt>
                        <dd className="mt-0.5 text-xs tabular-nums">{r.sizeKb} Ko</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date</dt>
                        <dd className="mt-0.5 text-xs tabular-nums">
                          {new Date(r.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Généré par</dt>
                        <dd className="mt-0.5 text-xs text-muted-foreground">{r.generatedBy}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5"
                        onClick={() => handleDownload(r)}
                        aria-label={`Télécharger ${r.name}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Télécharger
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        onClick={() => handleDelete(r)}
                        aria-label={`Supprimer ${r.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }}
          />
        </CardContent>
      </Card>

      {/* A.8.3 — Rapports programmés */}
      <section className="space-y-3" aria-label="Rapports programmés">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          Rapports programmés
          <Badge variant="secondary" className="font-normal">
            {schedules.length}
          </Badge>
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {schedules.map((s) => {
            const TypeIcon = SCHEDULE_TYPE_ICONS[s.type] ?? CalendarDays
            return (
              <Card key={s.id} className={cn("transition-opacity", !s.active && "opacity-60")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("gap-1 text-[11px]", SCHEDULE_TYPE_BADGES[s.type] ?? "")}>
                          <TypeIcon className="h-3 w-3" />
                          {SCHEDULE_TYPE_LABELS[s.type] ?? s.type}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {s.channel}
                        </Badge>
                      </div>
                    </div>
                    <Switch
                      checked={s.active}
                      onCheckedChange={() => toggleSchedule(s)}
                      aria-label={`Activer ou désactiver la programmation ${s.name}`}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Cible :</span> {s.target}
                  </p>
                </CardContent>
              </Card>
            )
          })}

          {/* Nouvelle programmation */}
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Plus className="h-4 w-4 text-primary" />
                Nouvelle programmation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-sched-name" className="text-xs font-medium">
                  Nom
                </Label>
                <Input
                  id="new-sched-name"
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="ex : Veille enseignes concurrentes"
                  className="h-9"
                  maxLength={80}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Fréquence</Label>
                  <Select value={sType} onValueChange={setSType}>
                    <SelectTrigger className="w-full" aria-label="Fréquence de la programmation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Hebdomadaire</SelectItem>
                      <SelectItem value="MONTHLY">Mensuelle</SelectItem>
                      <SelectItem value="REALTIME">Temps réel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Canal</Label>
                  <Select value={sChannel} onValueChange={setSChannel}>
                    <SelectTrigger className="w-full" aria-label="Canal de diffusion">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-sched-target" className="text-xs font-medium">
                  Cible
                </Label>
                <Input
                  id="new-sched-target"
                  value={sTarget}
                  onChange={(e) => setSTarget(e.target.value)}
                  placeholder="ex : Grand Tunis + axes A1/A4"
                  className="h-9"
                  maxLength={120}
                />
              </div>
              <Button onClick={createSchedule} disabled={creating || !sName.trim()} className="h-9 w-full">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Création…" : "Programmer"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
