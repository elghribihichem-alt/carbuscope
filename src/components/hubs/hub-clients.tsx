'use client'

// CarbuScope — T54-Ca — Module 2 « Mobility Hub Operations », volet 3/5 :
// « Base clients TMP ». KPIs du jeu filtré (clients total, fidèles %,
// réguliers %, nouveaux %, fréquence moyenne de visites — fournis par
// /api/hubs/clients « stats »), filtres hub (présélection nav.hubsSel)/
// segment/recherche plaque-client-téléphone accent-insensible débouncée
// 300 ms, table paginée 20/page (plaque mono, client + tél, véhicule, type
// badge tonné — ÉLECTRIQUE émeraude plein + Zap —, segment badge, visites,
// dernière visite relative FR, CA cumulé ESTIMÉ) et Sheet détail : fiche
// client + véhicule, segment éditable (Select + Enregistrer → PATCH + toast),
// historique des interventions en table imbriquée (max-h-96, scrollbar fine)
// et total CA. « Exporter CSV » avec les filtres courants (endpoint serveur
// T52-R2b : BOM UTF-8, « ; », virgules décimales — téléchargement blob).
// Discipline lint : état clé + dérivation (aucun setState synchrone d'effet).

import { useEffect, useMemo, useState } from "react"
import {
  CalendarClock, ChevronLeft, ChevronRight, FileDown, Gauge, History,
  Loader2, Phone, RotateCcw, Search, Users,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Skeleton, TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import {
  InterventionStatusBadge, INTERVENTION_TYPE_LABELS, SEGMENT_META, SegmentBadge,
  VehicleTypeBadge, dateFr, normalizeFr, pctFr, relativeDateFr,
  type ClientsStatsDTO, type HubDTO, type HubInterventionDTO, type HubVehicleDTO,
} from "./hub-shared"

type ListResponse = {
  vehicles: HubVehicleDTO[]
  total: number
  page: number
  pages: number
  stats: ClientsStatsDTO
}

type DetailResponse = {
  vehicle: HubVehicleDTO
  interventions: HubInterventionDTO[]
}

const PAGE_SIZE = 20

const SEGMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "FIDÈLE", label: "Fidèles" },
  { value: "RÉGULIER", label: "Réguliers" },
  { value: "NOUVEAU", label: "Nouveaux" },
]

export function HubClients({ preselect }: { preselect: string }) {
  // ---- Hubs (filtre Select) : une passe, abortable ----
  const [hubs, setHubs] = useState<HubDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/hubs", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs → ${r.status}`)
        return (await r.json()) as { hubs: HubDTO[] }
      })
      .then(d => {
        setHubs(d.hubs ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [])

  // ---- Filtres (hub présélectionné via nav.hubsSel — handoff carte) ----
  const [hubId, setHubId] = useState(preselect || "ALL")
  const [segment, setSegment] = useState("ALL")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)

  // Recherche débouncée 300 ms (pattern tab-points-list) — repli page 1.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  // ---- Liste paginée (état clé par requête + dérivation : stale-while-
  //      revalidate sans setState synchrone d'effet) ----
  const queryKey = useMemo(
    () => `${hubId}|${segment}|${debouncedSearch}|${page}`,
    [hubId, segment, debouncedSearch, page],
  )

  const [data, setData] = useState<{ key: string } & ListResponse | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    const p = new URLSearchParams()
    if (hubId !== "ALL") p.set("hubId", hubId)
    if (segment !== "ALL") p.set("segment", segment)
    if (debouncedSearch !== "") p.set("q", debouncedSearch)
    p.set("page", String(page))
    fetch(`/api/hubs/clients?${p.toString()}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs/clients → ${r.status}`)
        return (await r.json()) as ListResponse
      })
      .then(d => setData({ key: queryKey, ...d }))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => ctrl.abort()
  }, [queryKey, hubId, segment, debouncedSearch, page, reloadKey])

  const current = data && data.key === queryKey ? data : null
  const stale = data != null && data.key !== queryKey
  const vehicles = current?.vehicles ?? data?.vehicles ?? []
  const total = current?.total ?? data?.total ?? 0
  const pages = current?.pages ?? data?.pages ?? 1
  const stats = current?.stats

  const filtersActive =
    (hubId !== "ALL" ? 1 : 0) + (segment !== "ALL" ? 1 : 0) + (debouncedSearch !== "" ? 1 : 0)

  const resetFilters = () => {
    setHubId("ALL")
    setSegment("ALL")
    setSearch("")
    setDebouncedSearch("")
    setPage(1)
  }

  // ---- Sheet détail : fiche + historique (état clé par vehicleId) ----
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<{ vehicleId: string } & DetailResponse | null>(null)

  useEffect(() => {
    if (!detailId) return
    const ctrl = new AbortController()
    fetch(`/api/hubs/clients?vehicleId=${encodeURIComponent(detailId)}`, {
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs/clients → ${r.status}`)
        return (await r.json()) as DetailResponse
      })
      .then(d => setDetailData({ vehicleId: detailId, ...d }))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => ctrl.abort()
  }, [detailId])

  const detail = detailData && detailId && detailData.vehicleId === detailId ? detailData : null
  const detailVehicle = detail?.vehicle ?? null

  // Segment éditable : overrides par véhicule (dérivés — jamais de reset
  // synchronisé en effet ; le draft vit jusqu'à l'enregistrement).
  const [segOverride, setSegOverride] = useState<Record<string, string>>({})
  const segDraft = detailVehicle
    ? segOverride[detailVehicle.id] ?? detailVehicle.segment
    : "FIDÈLE"
  const segDirty = detailVehicle != null && segDraft !== detailVehicle.segment
  const [savingSeg, setSavingSeg] = useState(false)

  const saveSegment = async () => {
    if (!detailVehicle || !segDirty) return
    setSavingSeg(true)
    try {
      const r = await fetch("/api/hubs/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detailVehicle.id, segment: segDraft }),
      })
      const json = (await r.json().catch(() => ({}))) as { vehicle?: HubVehicleDTO; error?: string }
      if (!r.ok || !json.vehicle) {
        toast.error(json.error ?? "Enregistrement impossible — réessayez.")
        return
      }
      const v = json.vehicle
      setData(prev =>
        prev ? { ...prev, vehicles: prev.vehicles.map(x => (x.id === v.id ? v : x)) } : prev,
      )
      setDetailData(prev => (prev && prev.vehicle.id === v.id ? { ...prev, vehicle: v } : prev))
      setSegOverride(prev => {
        const c = { ...prev }
        delete c[v.id]
        return c
      })
      // Rafraîchit discrètement les KPI du jeu filtré (répartition segments).
      setReloadKey(k => k + 1)
      toast.success(`Segment de « ${v.plate} » mis à jour.`, {
        description: `${v.clientName} · ${SEGMENT_META[v.segment]?.label ?? v.segment}`,
      })
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    } finally {
      setSavingSeg(false)
    }
  }

  // ---- Export CSV (filtres courants — endpoint T52-R2b, blob) ----
  const [exporting, setExporting] = useState(false)
  const doExport = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (hubId !== "ALL") p.set("hubId", hubId)
      if (segment !== "ALL") p.set("segment", segment)
      if (debouncedSearch !== "") p.set("q", debouncedSearch)
      const r = await fetch(`/api/hubs/clients/export?${p.toString()}`)
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        toast.error(j.error ?? "Export impossible — réessayez.")
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `clients-tmp-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      const rows = Number(r.headers.get("X-Rows-Count") ?? "0")
      toast.success(`Export CSV généré — ${num(rows)} client${rows > 1 ? "s" : ""}.`, {
        description: "clients-tmp.csv · BOM UTF-8, séparateur « ; », compatible Excel.",
      })
    } catch {
      toast.error("Export impossible — vérifiez votre connexion.")
    } finally {
      setExporting(false)
    }
  }

  /* ---------- Rendus ---------- */

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
  }

  const timeFr = (iso: string) =>
    new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- KPIs du jeu filtré ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Clients
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats === undefined ? "…" : num(stats.total)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">jeu filtré</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> Fidèles
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats === undefined ? "…" : pctFr(stats.total > 0 ? (stats.fidele / stats.total) * 100 : 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {stats === undefined ? "" : `${num(stats.fidele)} client${stats.fidele > 1 ? "s" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden /> Réguliers
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats === undefined ? "…" : pctFr(stats.total > 0 ? (stats.regulier / stats.total) * 100 : 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {stats === undefined ? "" : `${num(stats.regulier)} client${stats.regulier > 1 ? "s" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" aria-hidden /> Nouveaux
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats === undefined ? "…" : pctFr(stats.total > 0 ? (stats.nouveau / stats.total) * 100 : 0)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {stats === undefined ? "" : `${num(stats.nouveau)} client${stats.nouveau > 1 ? "s" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Gauge className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Fréquence moy.
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats === undefined ? "…" : `${stats.avgVisits.toFixed(1).replace(".", ",")}`}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">visites par client</p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Filtres + export ---- */}
      <Card className="min-w-0">
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              value={hubId}
              onValueChange={v => {
                setHubId(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-11 w-full text-sm" aria-label="Filtrer par hub">
                <SelectValue placeholder="Hub" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les hubs</SelectItem>
                {(hubs ?? []).map(h => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.code} — {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={segment}
              onValueChange={v => {
                setSegment(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-11 w-full text-sm" aria-label="Filtrer par segment">
                <SelectValue placeholder="Segment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les segments</SelectItem>
                {SEGMENT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Plaque, client ou téléphone…"
                aria-label="Rechercher un client (plaque, nom ou téléphone)"
                className="h-11 pl-9 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <span className="font-semibold tabular-nums text-foreground">{num(total)}</span>
              clients
              {stale && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {filtersActive > 0 && (
                <Button variant="outline" size="sm" className="ml-1 h-8 gap-1 text-xs" onClick={resetFilters}>
                  <RotateCcw className="h-3 w-3" aria-hidden /> Réinitialiser ({filtersActive})
                </Button>
              )}
            </p>
            <Button
              variant="outline"
              className="h-11 gap-2"
              onClick={doExport}
              disabled={exporting || total === 0}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden />
              )}
              Exporter CSV
            </Button>
          </div>

          <Separator />

          {/* ---- Table paginée (20/page) ---- */}
          <div className={stale ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {current === null && data === null ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-2/3 rounded-md" />
              </div>
            ) : vehicles.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucun client ne correspond à ces filtres.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-10 pl-3 text-[11px] uppercase tracking-wide">Plaque</TableHead>
                      <TableHead className="h-10 text-[11px] uppercase tracking-wide">Client</TableHead>
                      <TableHead className="h-10 text-[11px] uppercase tracking-wide">Véhicule</TableHead>
                      <TableHead className="h-10 text-[11px] uppercase tracking-wide">Type</TableHead>
                      <TableHead className="h-10 text-[11px] uppercase tracking-wide">Segment</TableHead>
                      <TableHead className="h-10 text-right text-[11px] uppercase tracking-wide">Visites</TableHead>
                      <TableHead className="h-10 text-[11px] uppercase tracking-wide">Dernière visite</TableHead>
                      <TableHead className="h-10 pr-3 text-right text-[11px] uppercase tracking-wide">CA cumulé (est.)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map(v => (
                      <TableRow
                        key={v.id}
                        className="cursor-pointer hover:bg-accent/60"
                        onClick={() => setDetailId(v.id)}
                        title="Ouvrir la fiche client"
                      >
                        <TableCell className="py-2.5 pl-3">
                          <Badge variant="outline" className="font-mono text-[11px] tracking-tight">
                            {v.plate}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[170px] py-2.5">
                          <p className="truncate text-[13px] font-medium">{v.clientName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{v.clientPhone}</p>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate py-2.5 text-[13px]">
                          {v.brand} {v.model}
                        </TableCell>
                        <TableCell className="py-2.5"><VehicleTypeBadge type={v.type} /></TableCell>
                        <TableCell className="py-2.5"><SegmentBadge segment={v.segment} /></TableCell>
                        <TableCell className="py-2.5 text-right text-[13px] tabular-nums">
                          {num(v.visitsCount)}
                        </TableCell>
                        <TableCell
                          className="py-2.5 text-[13px] text-muted-foreground"
                          title={v.lastVisit ? dateFr(v.lastVisit) : "jamais"}
                        >
                          {relativeDateFr(v.lastVisit)}
                        </TableCell>
                        <TableCell className="py-2.5 pr-3 text-right text-[13px] tabular-nums">
                          {v.estimatedRevenue > 0 ? `${num(v.estimatedRevenue)} DT` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ---- Pagination ---- */}
            {total > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {num((page - 1) * PAGE_SIZE + 1)}–{num(Math.min(page * PAGE_SIZE, total))} sur{" "}
                  {num(total)} client{total > 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-11 gap-1"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden /> Précédent
                  </Button>
                  <span className="text-sm tabular-nums" aria-live="polite">
                    Page {num(page)} / {num(pages)}
                  </span>
                  <Button
                    variant="outline"
                    className="h-11 gap-1"
                    disabled={page >= pages}
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                  >
                    Suivant <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---- Sheet détail client ---- */}
      <Sheet open={detailId != null} onOpenChange={o => { if (!o) setDetailId(null) }}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        >
          {detailVehicle ? (
            <>
              <SheetHeader className="space-y-1 border-b p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[11px] tracking-tight">
                    {detailVehicle.plate}
                  </Badge>
                  <SegmentBadge segment={detailVehicle.segment} />
                </div>
                <SheetTitle className="text-left text-base leading-snug">{detailVehicle.clientName}</SheetTitle>
                <SheetDescription className="text-left text-xs">
                  {detailVehicle.brand} {detailVehicle.model} · {detailVehicle.hubCode} —{" "}
                  {detailVehicle.hubName}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 p-4">
                {/* Fiche client + véhicule */}
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Téléphone</span>
                      {detailVehicle.clientPhone}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
                      <VehicleTypeBadge type={detailVehicle.type} />
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dernière visite</span>
                      {relativeDateFr(detailVehicle.lastVisit)}
                      {detailVehicle.lastVisit && (
                        <span className="text-muted-foreground"> · {dateFr(detailVehicle.lastVisit)}</span>
                      )}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visites enregistrées</span>
                      {num(detailVehicle.visitsCount)}
                    </span>
                  </p>
                </div>

                {/* Segment éditable */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Segment de fidélité
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      value={segDraft}
                      onValueChange={v => setSegOverride(prev => ({ ...prev, [detailVehicle.id]: v }))}
                    >
                      <SelectTrigger className="h-11 flex-1 text-sm" aria-label="Segment du client">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEGMENT_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>
                            {SEGMENT_META[o.value]?.label ?? o.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      className="h-11 gap-2 sm:w-44"
                      disabled={!segDirty || savingSeg}
                      onClick={saveSegment}
                    >
                      {savingSeg && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      Enregistrer
                    </Button>
                  </div>
                </div>

                {/* Historique des interventions (table imbriquée max-h-96) */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <History className="h-3.5 w-3.5" aria-hidden /> Historique des interventions
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {detail ? num(detail.interventions.length) : "…"}
                    </Badge>
                  </p>
                  <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border [scrollbar-width:thin]">
                    {detail === null ? (
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-2/3 rounded-md" />
                      </div>
                    ) : detail.interventions.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        Aucune intervention enregistrée pour ce véhicule.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted">
                          <TableRow>
                            <TableHead className="h-9 text-[11px]">Type</TableHead>
                            <TableHead className="h-9 text-[11px]">Service</TableHead>
                            <TableHead className="h-9 text-right text-[11px]">Prix</TableHead>
                            <TableHead className="h-9 text-[11px]">Statut</TableHead>
                            <TableHead className="h-9 text-[11px]">Date</TableHead>
                            <TableHead className="h-9 text-right text-[11px]">Durée</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.interventions.map(i => (
                            <TableRow key={i.id}>
                              <TableCell className="py-2 text-[13px]">
                                {INTERVENTION_TYPE_LABELS[i.type] ?? i.type}
                              </TableCell>
                              <TableCell className="max-w-[170px] truncate py-2 text-[13px]" title={i.serviceName ?? ""}>
                                {i.serviceName ?? "—"}
                              </TableCell>
                              <TableCell className="py-2 text-right text-[13px] tabular-nums">
                                {num(i.price)} DT
                              </TableCell>
                              <TableCell className="py-2">
                                <InterventionStatusBadge status={i.status} />
                              </TableCell>
                              <TableCell className="py-2 text-[13px] text-muted-foreground">
                                {dateFr(i.scheduledAt)} · {timeFr(i.scheduledAt)}
                              </TableCell>
                              <TableCell className="py-2 text-right text-[13px] tabular-nums">
                                {i.durationMin != null ? `${i.durationMin} min` : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                  {detail && (
                    <p className="mt-2 flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-[13px]">
                      <span className="text-muted-foreground">CA cumulé estimé</span>
                      <span className="font-semibold tabular-nums">
                        {num(detail.vehicle.estimatedRevenue)} DT
                      </span>
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Historique limité aux 50 dernières interventions (date
                    décroissante) ; le CA cumulé porte sur l&apos;ensemble des
                    interventions non annulées — d&apos;où la mention « est. ».
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-40 rounded-md" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
