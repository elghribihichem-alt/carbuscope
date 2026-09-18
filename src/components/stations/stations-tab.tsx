'use client'

// CarbuScope — Module A.4 « Mes stations » : gestion du parc propre de l'enseigne.
// Sous-onglets (toutes / actives / rénovation / projet / sous tension), barre d'actions
// (recherche, gouvernorat, tri, ajouter, exports CSV/Excel/PDF), tableau responsive
// avec en-tête sticky + pagination, fiche complète et éditeur en Dialog.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, FileDown,
  FileSpreadsheet, GitCompareArrows, MapPin, Pencil, Plus, Printer, Search, SearchX, X,
} from "lucide-react"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"
import type { StationDTO, StationStatus } from "@/lib/types"
import { SERVICE_LABELS, STATUS_LABELS } from "@/lib/types"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/shell/badges"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { ServiceChips } from "./service-chip"
import { StationCompareDialog } from "./station-compare-dialog"
import { StationDetailDialog } from "./station-detail-dialog"
import { StationFormDialog } from "./station-form-dialog"
import { buildStationsCsv, downloadText, formatDateFr, normalizeFr, todayStamp } from "./station-utils"

const PAGE_SIZE = 20
const TENSION_THRESHOLD = 1100 // trafic captif (véh./j) sous lequel une station active est « sous tension »
const MAX_COMPARE = 3 // nombre maximal de stations comparables côte à côte

type SubTabKey = "all" | "ACTIVE" | "RENOVATION" | "PROJECT" | "TENSION"
type SortKey =
  | "traffic-desc" | "traffic-asc"
  | "name-asc" | "name-desc"
  | "gov-asc" | "gov-desc"
  | "verified-desc" | "verified-asc"
  | "rating-desc" | "rating-asc"
  | "code-asc" | "code-desc"
  | "status-asc" | "status-desc"

const SUB_TABS: { key: SubTabKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "ACTIVE", label: "Actives" },
  { key: "RENOVATION", label: "En rénovation" },
  { key: "PROJECT", label: "En projet" },
  { key: "TENSION", label: "Sous tension" },
]

const SORT_SELECT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "traffic-desc", label: "Trafic décroissant" },
  { value: "traffic-asc", label: "Trafic croissant" },
  { value: "name-asc", label: "Nom (A → Z)" },
  { value: "name-desc", label: "Nom (Z → A)" },
  { value: "verified-desc", label: "Vérification (récente)" },
  { value: "verified-asc", label: "Vérification (ancienne)" },
  { value: "rating-desc", label: "Note (décroissante)" },
  { value: "rating-asc", label: "Note (croissante)" },
  { value: "code-asc", label: "Code (A → Z)" },
]

const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, RENOVATION: 1, PROJECT: 2, CLOSED: 3 }

const PRINT_CSS = `
@media print {
  header, footer { display: none !important; }
  #contenu > *:not(.cs-print-root) { display: none !important; }
  .cs-print-root > .cs-screen { display: none !important; }
  .cs-print-root > .cs-print { display: block !important; }
}
@page { size: A4 landscape; margin: 10mm; }
`

function sortField(key: SortKey): string {
  return key.slice(0, key.lastIndexOf("-"))
}

function toggleSort(cur: SortKey, target: SortKey): SortKey {
  if (sortField(cur) !== sortField(target)) return target
  const field = sortField(cur)
  return cur.endsWith("-asc") ? (`${field}-desc` as SortKey) : (`${field}-asc` as SortKey)
}

function compareStations(a: StationDTO, b: StationDTO, sort: SortKey): number {
  const field = sortField(sort)
  const mul = sort.endsWith("-asc") ? 1 : -1
  let r = 0
  if (field === "code") r = a.code.localeCompare(b.code, "fr")
  else if (field === "name") r = a.name.localeCompare(b.name, "fr")
  else if (field === "gov") r = a.gouvernorat.localeCompare(b.gouvernorat, "fr") || a.delegation.localeCompare(b.delegation, "fr")
  else if (field === "traffic") r = a.traffic - b.traffic
  else if (field === "verified") r = new Date(a.lastVerified).getTime() - new Date(b.lastVerified).getTime()
  else if (field === "rating") r = a.rating - b.rating
  else if (field === "status") r = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  if (r === 0) return a.code.localeCompare(b.code, "fr")
  return r * mul
}

function SortTh({
  label, target, sort, onSort, className,
}: {
  label: string
  target: SortKey
  sort: SortKey
  onSort: (k: SortKey) => void
  className?: string
}) {
  const isActive = sortField(sort) === sortField(target)
  const asc = sort.endsWith("-asc")
  return (
    <th scope="col" className={cn("h-10 whitespace-nowrap px-2 text-left align-middle font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(target)}
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`Trier par ${label}${isActive ? (asc ? " (croissant)" : " (décroissant)") : ""}`}
      >
        {label}
        {isActive
          ? (asc ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />}
      </button>
    </th>
  )
}

function PlainTh({ label, className }: { label: string; className?: string }) {
  return (
    <th scope="col" className={cn("h-10 whitespace-nowrap px-2 text-left align-middle text-[11px] font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {label}
    </th>
  )
}

function TrafficCell({ station, maxTraffic }: { station: StationDTO; maxTraffic: number }) {
  const pct = maxTraffic > 0 ? Math.min(100, Math.round((station.traffic / maxTraffic) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right font-medium tabular-nums">{num(station.traffic)}</span>
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", station.status === "ACTIVE" && station.traffic < TENSION_THRESHOLD ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function StationsTab() {
  const brandSlug = useAppStore((s) => s.brandSlug)
  const setTab = useAppStore((s) => s.setTab)
  const setFocusStation = useAppStore((s) => s.setFocusStation)

  const [data, setData] = useState<{ brand: string; stations: StationDTO[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [subTab, setSubTab] = useState<SubTabKey>("all")
  const [search, setSearch] = useState("")
  const [govFilter, setGovFilter] = useState("all")
  const [sort, setSort] = useState<SortKey>("traffic-desc")
  const [page, setPage] = useState(0)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formStation, setFormStation] = useState<StationDTO | null>(null)

  // ---- Comparateur de stations (2 à 3) ----
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  // ---- Chargement du parc de l'enseigne connectée ----
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/stations?brand=${encodeURIComponent(brandSlug)}&limit=400&sort=traffic`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ stations: StationDTO[] }>
      })
      .then((json) => {
        setData({ brand: brandSlug, stations: json.stations ?? [] })
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [brandSlug, reloadKey])

  // Données affichables : seulement si elles correspondent à l'enseigne courante (sinon → squelette)
  const stations = data !== null && data.brand === brandSlug ? data.stations : null
  const brandName = stations?.[0]?.brandName ?? brandSlug

  // ---- Sélecteurs d'action ----
  const locate = useCallback((code: string) => {
    setFocusStation(code)
    setTab("map")
  }, [setFocusStation, setTab])

  const openCreate = useCallback(() => {
    setFormStation(null)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((s: StationDTO) => {
    setFormStation(s)
    setFormOpen(true)
  }, [])

  const handleSaved = useCallback((station: StationDTO, created: boolean) => {
    // Fusion immédiate dans la liste affichée, puis resynchronisation en arrière-plan.
    setData((prev) => {
      if (prev === null || prev.brand !== brandSlug) return prev
      const next = created
        ? [station, ...prev.stations]
        : prev.stations.map((s) => (s.id === station.id ? station : s))
      return { ...prev, stations: next }
    })
    setReloadKey((k) => k + 1)
  }, [brandSlug])

  // ---- Valeurs dérivées ----
  const govOptions = useMemo(() => {
    if (stations === null) return []
    return Array.from(new Set(stations.map((s) => s.gouvernorat))).sort((a, b) => a.localeCompare(b, "fr"))
  }, [stations])

  const counts = useMemo(() => {
    const base: Record<SubTabKey, number> = { all: 0, ACTIVE: 0, RENOVATION: 0, PROJECT: 0, TENSION: 0 }
    let closed = 0
    for (const s of stations ?? []) {
      base.all += 1
      if (s.status === "ACTIVE") base.ACTIVE += 1
      else if (s.status === "RENOVATION") base.RENOVATION += 1
      else if (s.status === "PROJECT") base.PROJECT += 1
      else closed += 1
      if (s.status === "ACTIVE" && s.traffic < TENSION_THRESHOLD) base.TENSION += 1
    }
    return { ...base, CLOSED: closed }
  }, [stations])

  const effectiveGov = govFilter === "all" || govOptions.includes(govFilter) ? govFilter : "all"
  const q = normalizeFr(search.trim())

  const filtered = useMemo(() => {
    if (stations === null) return []
    let list = stations
    if (subTab === "TENSION") list = list.filter((s) => s.status === "ACTIVE" && s.traffic < TENSION_THRESHOLD)
    else if (subTab !== "all") list = list.filter((s) => s.status === (subTab as StationStatus))
    if (effectiveGov !== "all") list = list.filter((s) => s.gouvernorat === effectiveGov)
    if (q !== "") list = list.filter((s) => normalizeFr(`${s.name} ${s.code} ${s.gouvernorat} ${s.delegation} ${s.address}`).includes(q))
    return [...list].sort((a, b) => compareStations(a, b, sort))
  }, [stations, subTab, effectiveGov, q, sort])

  const maxTraffic = useMemo(() => filtered.reduce((m, s) => Math.max(m, s.traffic), 1), [filtered])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const sortValueInSelect = SORT_SELECT_OPTIONS.some((o) => o.value === sort) ? sort : ""

  // ---- Exports ----
  const doExportCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Aucune station à exporter", { description: "Ajustez les filtres avant d'exporter." })
      return
    }
    downloadText(buildStationsCsv(filtered), `carbuscope-stations-${brandSlug}-${todayStamp()}.csv`, "text/csv")
    toast.success("Export CSV généré", { description: `${filtered.length} stations exportées (séparateur « ; », UTF-8).` })
  }, [filtered, brandSlug])

  const doExportExcel = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Aucune station à exporter", { description: "Ajustez les filtres avant d'exporter." })
      return
    }
    downloadText(buildStationsCsv(filtered), `carbuscope-stations-${brandSlug}-${todayStamp()}.xls`, "application/vnd.ms-excel")
    toast.info("Export Excel généré", {
      description: "Fichier .xls au contenu CSV (UTF-8, séparateur « ; ») — s'ouvre directement dans Excel ou LibreOffice.",
    })
  }, [filtered, brandSlug])

  const doExportPdf = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Aucune station à imprimer", { description: "Ajustez les filtres avant d'exporter." })
      return
    }
    toast.info("Impression de la liste", { description: "Choisissez « Enregistrer au format PDF » dans la boîte d'impression." })
    window.setTimeout(() => window.print(), 500)
  }, [filtered])

  const resetFilters = useCallback(() => {
    setSubTab("all")
    setSearch("")
    setGovFilter("all")
    setPage(0)
  }, [])

  // ---- Comparateur : sélection de 2 à 3 stations ----
  const toggleCompare = useCallback((s: StationDTO) => {
    if (compareIds.includes(s.id)) {
      setCompareIds(compareIds.filter((x) => x !== s.id))
      return
    }
    if (compareIds.length >= MAX_COMPARE) {
      const lastId = compareIds[compareIds.length - 1]
      const lastName = stations?.find((x) => x.id === lastId)?.name ?? "une station"
      toast.info(`Maximum ${MAX_COMPARE} stations en comparaison`, {
        description: `Retirez « ${lastName} » avant d'en ajouter une autre.`,
      })
      return
    }
    setCompareIds([...compareIds, s.id])
  }, [compareIds, stations])

  const compareSelection = useMemo(() => {
    if (stations === null) return []
    return stations.filter((s) => compareIds.includes(s.id))
  }, [stations, compareIds])

  const onSortClick = useCallback((target: SortKey) => {
    setPage(0)
    setSort((cur) => toggleSort(cur, target))
  }, [])

  // ---- États de chargement ----
  if (stations === null && error === null) {
    return <TabSkeleton title="Chargement des stations…" />
  }
  if (stations === null && error !== null) {
    return <ErrorState message={`Impossible de charger le parc ${brandSlug} : ${error}`} retry={() => setReloadKey((k) => k + 1)} />
  }

  const subTabLabel = SUB_TABS.find((t) => t.key === subTab)?.label ?? "Toutes"

  return (
    <div className="cs-print-root">
      <style>{PRINT_CSS}</style>

      <div className="cs-screen space-y-4 p-4 md:p-6">
        {/* En-tête */}
        <div>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Mes stations</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Parc {brandName} · {counts.all} stations
            {counts.CLOSED > 0 ? ` (dont ${counts.CLOSED} fermée${counts.CLOSED > 1 ? "s" : ""})` : ""} —
            fiches, vérification et suivi du trafic captif.
          </p>
        </div>

        {/* Barre d'actions */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Rechercher (nom, code, ville, adresse)…"
              className="pl-9 pr-9"
              aria-label="Rechercher une station"
              inputMode="search"
            />
            {search !== "" && (
              <button
                type="button"
                onClick={() => { setSearch(""); setPage(0) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={effectiveGov} onValueChange={(v) => { setGovFilter(v); setPage(0) }}>
              <SelectTrigger className="h-9 w-[168px]" aria-label="Filtrer par gouvernorat">
                <SelectValue placeholder="Gouvernorat" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Tous les gouvernorats</SelectItem>
                {govOptions.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortValueInSelect} onValueChange={(v) => { setSort(v as SortKey); setPage(0) }}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Trier la liste">
                <SelectValue placeholder="Tri personnalisé" />
              </SelectTrigger>
              <SelectContent>
                {SORT_SELECT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              Ajouter une station
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doExportCsv}>
              <FileDown className="h-4 w-4" aria-hidden />
              Exporter CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doExportExcel}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Exporter Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={doExportPdf}>
              <Printer className="h-4 w-4" aria-hidden />
              Exporter PDF
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              disabled={compareIds.length < 2}
              onClick={() => setCompareOpen(true)}
              title={compareIds.length < 2 ? "Sélectionnez au moins 2 stations à comparer" : `Comparer ${compareIds.length} stations`}
            >
              <GitCompareArrows className="h-4 w-4" aria-hidden />
              Comparer {compareIds.length > 0 ? `(${compareIds.length}/${MAX_COMPARE})` : ""}
            </Button>
          </div>
        </div>

        {/* Sous-onglets (A.4.1) */}
        <Tabs value={subTab} onValueChange={(v) => { setSubTab(v as SubTabKey); setPage(0) }}>
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 sm:grid-cols-5">
            {SUB_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-2 py-1.5 text-xs sm:text-[13px]">
                <span className="truncate">{t.label}</span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {counts[t.key]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Contenu */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <SearchX className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="font-semibold">Aucune station ne correspond à vos filtres</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajustez la recherche, le gouvernorat ou le sous-onglet « {subTabLabel} ».
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetFilters}>Réinitialiser les filtres</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Tableau (desktop) */}
            <div className="hidden overflow-hidden rounded-xl border md:block">
              <ScrollArea className="max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b">
                      <PlainTh label="Comparer" className="w-[64px]" />
                      <SortTh label="ID" target="code-asc" sort={sort} onSort={onSortClick} className="w-[104px]" />
                      <SortTh label="Nom" target="name-asc" sort={sort} onSort={onSortClick} />
                      <SortTh label="Gouvernorat" target="gov-asc" sort={sort} onSort={onSortClick} className="w-[150px]" />
                      <PlainTh label="Services" className="w-[168px]" />
                      <SortTh label="Trafic captif" target="traffic-desc" sort={sort} onSort={onSortClick} className="w-[150px]" />
                      <SortTh label="Statut" target="status-asc" sort={sort} onSort={onSortClick} className="w-[118px]" />
                      <SortTh label="Vérification" target="verified-desc" sort={sort} onSort={onSortClick} className="w-[150px]" />
                      <PlainTh label="Actions" className="w-[122px] text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((s) => (
                      <tr key={s.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-2 py-2 align-middle">
                          <Checkbox
                            checked={compareIds.includes(s.id)}
                            onCheckedChange={() => toggleCompare(s)}
                            aria-label={`Comparer ${s.name}`}
                            title="Ajouter au comparateur"
                          />
                        </td>
                        <td className="px-2 py-2 align-middle font-mono text-xs text-muted-foreground">{s.code}</td>
                        <td className="max-w-[300px] px-2 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                            <button
                              type="button"
                              onClick={() => setDetailId(s.id)}
                              className="max-w-[190px] truncate text-left font-medium hover:underline focus-visible:underline"
                              title={`Voir la fiche — ${s.name}`}
                            >
                              {s.name}
                            </button>
                            <StatusBadge status={s.status} />
                          </div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <p className="text-[13px] font-medium leading-tight">{s.gouvernorat}</p>
                          <p className="text-[11px] leading-tight text-muted-foreground">{s.delegation}</p>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <ServiceChips services={s.services} max={4} />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <TrafficCell station={s} maxTraffic={maxTraffic} />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <p className="text-[13px] leading-tight">{formatDateFr(s.lastVerified)}</p>
                          <p className="max-w-[130px] truncate text-[11px] leading-tight text-muted-foreground" title={s.verifiedBy}>
                            {s.verifiedBy || "—"}
                          </p>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => setDetailId(s.id)}
                              title="Voir la fiche"
                              aria-label={`Voir la fiche de ${s.name}`}
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => openEdit(s)}
                              title="Modifier la fiche"
                              aria-label={`Modifier ${s.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => locate(s.code)}
                              title="Voir sur la carte"
                              aria-label={`Voir ${s.name} sur la carte`}
                            >
                              <MapPin className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>

            {/* Cartes empilées (mobile) */}
            <div className="space-y-3 md:hidden">
              {paged.map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={compareIds.includes(s.id)}
                        onCheckedChange={() => toggleCompare(s)}
                        aria-label={`Comparer ${s.name}`}
                        className="mt-0.5"
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                      <button
                        type="button"
                        onClick={() => setDetailId(s.id)}
                        className="min-w-0 truncate text-left font-semibold hover:underline"
                        title={`Voir la fiche — ${s.name}`}
                      >
                        {s.name}
                      </button>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{s.code}</span> · {s.gouvernorat} — {s.delegation}
                  </p>
                  <div className="mt-2">
                    <ServiceChips services={s.services} max={4} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{num(s.traffic)}</span>
                      <span className="text-[11px] text-muted-foreground">véh./j</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className={cn("h-full rounded-full", s.status === "ACTIVE" && s.traffic < TENSION_THRESHOLD ? "bg-amber-500" : "bg-primary")}
                          style={{ width: `${maxTraffic > 0 ? Math.min(100, Math.round((s.traffic / maxTraffic) * 100)) : 0}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Vérif. {formatDateFr(s.lastVerified)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setDetailId(s.id)}>
                      <Eye className="h-3.5 w-3.5" aria-hidden />Fiche
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />Modifier
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => locate(s.code)}>
                      <MapPin className="h-3.5 w-3.5" aria-hidden />Carte
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} sur {filtered.length} stations
                · page {safePage + 1} / {pageCount}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline" size="sm" className="gap-1"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Précédent
                </Button>
                <Button
                  variant="outline" size="sm" className="gap-1"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Vue imprimable — « Exporter PDF » passe par la boîte d'impression du navigateur */}
      <div className="cs-print hidden p-6 text-slate-900">
        <h1 className="text-xl font-bold">CarbuScope — Mes stations · {brandName}</h1>
        <p className="mt-1 text-xs text-slate-600">
          {filtered.length} station{filtered.length > 1 ? "s" : ""} ({subTabLabel.toLowerCase()})
          {effectiveGov !== "all" ? ` · gouvernorat : ${effectiveGov}` : ""}
          {q !== "" ? ` · recherche « ${search.trim()} »` : ""}
          {" "}— généré le {formatDateFr(new Date().toISOString())}
        </p>
        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-slate-400 text-left">
              {["Code", "Nom", "Gouvernorat", "Trafic", "Statut", "Services", "Vérification"].map((h) => (
                <th key={h} scope="col" className="px-2 py-1.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-slate-200 align-top">
                <td className="px-2 py-1 font-mono">{s.code}</td>
                <td className="px-2 py-1 font-medium">{s.name}</td>
                <td className="px-2 py-1">{s.gouvernorat} — {s.delegation}</td>
                <td className="px-2 py-1 tabular-nums">{num(s.traffic)}</td>
                <td className="px-2 py-1">{STATUS_LABELS[s.status] ?? s.status}</td>
                <td className="px-2 py-1">{s.services.map((x) => SERVICE_LABELS[x] ?? x).join(", ") || "—"}</td>
                <td className="px-2 py-1">{formatDateFr(s.lastVerified)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-slate-500">
          Source : données internes CarbuScope — document généré depuis l&apos;onglet « Mes stations ».
        </p>
      </div>

      <StationCompareDialog
        open={compareOpen}
        stations={compareSelection}
        onClose={() => setCompareOpen(false)}
        onOpenDetail={(id) => { setCompareOpen(false); setDetailId(id) }}
      />
      <StationDetailDialog
        stationId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(s) => { setDetailId(null); openEdit(s) }}
        onLocate={(code) => { setDetailId(null); locate(code) }}
      />
      <StationFormDialog
        open={formOpen}
        station={formStation}
        brandSlug={brandSlug}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
