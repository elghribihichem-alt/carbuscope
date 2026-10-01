'use client'

// CarbuScope — T54-Ca — Module 2 « Mobility Hub Operations », volet 1/5 :
// « Carte des TMP ». Carte Leaflet réelle (fond Esri jour/nuit, tuiles sans
// clé API — socle osm-map réutilisé via hub-map.tsx, monté ssr:false) +
// panneau latéral de filtres (statut / type / gouvernorat) et liste des hubs
// filtrés (cartes compactes cliquables). Clic liste OU marqueur → popup +
// sélection (survol doux) + Sheet détail : identité complète du hub, 3 KPI
// (services actifs, réservations du mois, CA mensuel), mini-table des
// services (imbriquée, scroll max-h-72) et handoffs « Gérer les services » /
// « Base clients » vers les volets 2 et 3 avec hub présélectionné
// (nav.hubsSel = hubId — pattern nav.radarSim de B3a).
// KPIs de tête : hubs actifs, véhicules/j cumulés, CA mensuel cumulé,
// prochaine ouverture (hub CONSTRUCTION). Données /api/hubs (session enseigne).

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  Building2, CalendarCheck, Coins, Gauge, ListFilter, Loader2, MapPin,
  Phone, Plus, Ruler, Users, Wrench,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Skeleton, TabSkeleton, ErrorState } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import { num } from "@/lib/chart"
import {
  GOVS_24, HUB_STATUS_META, HUB_TYPE_LABELS, HUB_TYPE_OPTIONS,
  ServiceCategoryBadge, ServiceStatusBadge, HubStatusBadge,
  dateFr, kdt, priceFr,
  type HubDTO, type HubServiceDTO,
} from "./hub-shared"

// Fond cartographique réel Leaflet — chargé côté client uniquement
// (pattern tunisia-map.tsx → osm-map.tsx).
const HubLeafletMap = dynamic(() => import("./hub-map").then(m => m.HubLeafletMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-secondary/30 backdrop-blur-[2px]">
      <span className="inline-flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du fond cartographique…
      </span>
    </div>
  ),
})

const HUB_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ACTIVE", label: "Actifs" },
  { value: "CONSTRUCTION", label: "En construction" },
  { value: "PLANNED", label: "Planifiés" },
]

export function HubCarte() {
  const setNav = useAppStore(s => s.setNav)

  // ---- Données /api/hubs (abortable, retry — pattern radar-zones) ----
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
  }, [reloadKey])

  // ---- Filtres (panneau latéral) ----
  const [statusF, setStatusF] = useState("ALL")
  const [typeF, setTypeF] = useState("ALL")
  const [govF, setGovF] = useState("ALL")

  // ---- Sélection (liste OU marqueur) → Sheet détail ----
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const selectedHub = useMemo(
    () => (hubs && selectedId ? hubs.find(h => h.id === selectedId) ?? null : null),
    [hubs, selectedId],
  )

  const selectHub = (hub: HubDTO) => {
    setSelectedId(hub.id)
    setSheetOpen(true)
  }

  // ---- Services du hub sélectionné (mini-table du Sheet, abortable). État
  // clé par hubId + DÉRIVATION : aucun setState synchrone dans le corps de
  // l'effet (pattern render-time/derive — discipline lint T54-B3b) ; la
  // Skeleton s'affiche tant que la réponse ne correspond pas au hub ouvert. ----
  const [sheetServices, setSheetServices] = useState<{
    hubId: string
    services: HubServiceDTO[]
  } | null>(null)
  useEffect(() => {
    if (!selectedHub) return
    const ctrl = new AbortController()
    fetch(`/api/hubs/services?hubId=${encodeURIComponent(selectedHub.id)}`, {
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs/services → ${r.status}`)
        return (await r.json()) as { services: HubServiceDTO[] }
      })
      .then(d => setSheetServices({ hubId: selectedHub.id, services: d.services ?? [] }))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => ctrl.abort()
  }, [selectedHub])
  const servicesOfSheet: HubServiceDTO[] | null =
    selectedHub && sheetServices && sheetServices.hubId === selectedHub.id
      ? sheetServices.services
      : null

  // ---- Liste filtrée + KPIs de tête ----
  const filtered = useMemo(() => {
    if (!hubs) return []
    return hubs.filter(
      h =>
        (statusF === "ALL" || h.status === statusF) &&
        (typeF === "ALL" || h.type === typeF) &&
        (govF === "ALL" || h.gouvernorat === govF),
    )
  }, [hubs, statusF, typeF, govF])

  const kpis = useMemo(() => {
    const active = hubs?.filter(h => h.status === "ACTIVE") ?? []
    const daily = active.reduce((a, h) => a + h.dailyVehicles, 0)
    const revenue = active.reduce((a, h) => a + h.monthlyRevenue, 0)
    // Prochaine ouverture : le hub en construction (les planifiés n'ont pas
    // de date d'ouverture — invariant du seed T54-A1).
    const next = hubs?.find(h => h.status === "CONSTRUCTION") ?? null
    return { activeCount: active.length, daily, revenue, next }
  }, [hubs])

  // ---- Handoffs vers les volets 2 et 3 (hub présélectionné) ----
  const goServices = () => {
    if (!selectedHub) return
    setNav("hubsSel", selectedHub.id)
    setNav("hubs", "services")
    setSheetOpen(false)
  }
  const goClients = () => {
    if (!selectedHub) return
    setNav("hubsSel", selectedHub.id)
    setNav("hubs", "clients")
    setSheetOpen(false)
  }

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
  }
  if (hubs === null) {
    return <TabSkeleton title="Chargement de la carte des TMP…" />
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- KPIs de tête (réseau TMP réel /api/hubs) ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Hubs actifs
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {num(kpis.activeCount)}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                / {num(hubs.length)} sites
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Gauge className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Véhicules/jour
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{num(kpis.daily)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">cumul des hubs actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> CA mensuel
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{kdt(kpis.revenue)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">services des hubs actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarCheck className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Prochaine ouverture
            </p>
            {kpis.next ? (
              <>
                <p className="mt-1 truncate text-sm font-bold" title={kpis.next.name}>
                  {kpis.next.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {kpis.next.gouvernorat} · en construction
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Split responsive : carte Leaflet + panneau filtres/liste ---- */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden p-0 lg:col-span-2">
          <div className="h-[420px] w-full md:h-[520px]">
            <HubLeafletMap hubs={filtered} selectedId={selectedId} onSelect={selectHub} />
          </div>
        </Card>

        {/* ---- Panneau latéral : filtres + liste des hubs ---- */}
        <Card className="min-w-0 lg:col-span-1">
          <CardContent className="space-y-3 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ListFilter className="h-3.5 w-3.5" aria-hidden /> Filtres
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {num(filtered.length)} / {num(hubs.length)}
              </Badge>
            </p>
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="h-11 w-full text-sm" aria-label="Filtrer par statut">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                {HUB_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeF} onValueChange={setTypeF}>
              <SelectTrigger className="h-11 w-full text-sm" aria-label="Filtrer par type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                {HUB_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={govF} onValueChange={setGovF}>
              <SelectTrigger className="h-11 w-full text-sm" aria-label="Filtrer par gouvernorat">
                <SelectValue placeholder="Gouvernorat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les gouvernorats</SelectItem>
                {GOVS_24.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Separator />

            {/* Liste des hubs filtrés (max-h + scrollbar fine — charte listes) */}
            <div
              className="max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]"
              role="list"
              aria-label="Hubs filtrés"
            >
              {filtered.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Aucun hub ne correspond à ces filtres.
                </p>
              )}
              {filtered.map(hub => {
                const meta = HUB_STATUS_META[hub.status]
                const isSel = hub.id === selectedId
                return (
                  <button
                    key={hub.id}
                    role="listitem"
                    onClick={() => selectHub(hub)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSel
                        ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/40 dark:bg-emerald-950/40"
                        : "hover:bg-accent"
                    }`}
                    aria-current={isSel ? "true" : undefined}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] tracking-tight">
                        {hub.code}
                      </Badge>
                      {meta && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
                          {meta.label}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {hub.dailyVehicles > 0 ? `${num(hub.dailyVehicles)} véh./j` : "—"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{hub.name}</p>
                    <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {HUB_TYPE_LABELS[hub.type] ?? hub.type} · {hub.gouvernorat}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {hub.monthlyRevenue > 0 ? kdt(hub.monthlyRevenue) : "—"}
                      </span>
                    </p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Sheet détail d'un hub ---- */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
          {selectedHub && (
            <>
              <SheetHeader className="space-y-1 border-b p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">{selectedHub.code}</Badge>
                  <HubStatusBadge status={selectedHub.status} />
                </div>
                <SheetTitle className="text-left text-base leading-snug">{selectedHub.name}</SheetTitle>
                <SheetDescription className="text-left text-xs">
                  {HUB_TYPE_LABELS[selectedHub.type] ?? selectedHub.type} ·{" "}
                  {selectedHub.gouvernorat}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 p-4">
                {/* Identité complète */}
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--c-terra)]" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adresse</span>
                      {selectedHub.address}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Téléphone</span>
                      {selectedHub.phone ?? "—"}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Responsable</span>
                      {selectedHub.manager ?? "—"}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Surface</span>
                      {selectedHub.surfaceM2 != null ? `${num(selectedHub.surfaceM2)} m²` : "—"}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ouvert le</span>
                      {selectedHub.openedAt ? dateFr(selectedHub.openedAt) : "pas encore ouvert"}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 rounded-lg border p-2.5">
                    <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trafic capteurs</span>
                      {selectedHub.dailyVehicles > 0 ? `${num(selectedHub.dailyVehicles)} véh./j` : "—"}
                    </span>
                  </p>
                </div>

                {/* 3 KPI */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Services actifs</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{num(selectedHub.activeServicesCount)}</p>
                    <p className="text-[10px] text-muted-foreground">sur {num(selectedHub.servicesCount)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Réserv. du mois</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{num(selectedHub.bookingsThisMonth)}</p>
                    <p className="text-[10px] text-muted-foreground">tous services</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CA mensuel</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">
                      {selectedHub.monthlyRevenue > 0 ? kdt(selectedHub.monthlyRevenue) : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">services</p>
                  </div>
                </div>

                {/* Mini-table des services (imbriquée, scroll max-h-72) */}
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5" aria-hidden /> Services du hub
                  </p>
                  <div className="max-h-72 overflow-y-auto rounded-lg border [scrollbar-width:thin]">
                    {servicesOfSheet === null ? (
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-full rounded-md" />
                        <Skeleton className="h-8 w-2/3 rounded-md" />
                      </div>
                    ) : servicesOfSheet.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        Aucun service enregistré
                        {selectedHub.status !== "ACTIVE" && " — hub non ouvert"}
                        {" · "}
                        <span className="font-medium">créez-les depuis « Gérer les services »</span>
                      </p>
                    ) : (
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted">
                          <TableRow>
                            <TableHead className="h-9 text-[11px]">Catégorie</TableHead>
                            <TableHead className="h-9 text-[11px]">Nom</TableHead>
                            <TableHead className="h-9 text-right text-[11px]">Tarif</TableHead>
                            <TableHead className="h-9 text-[11px]">Statut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {servicesOfSheet.map(s => (
                            <TableRow key={s.id}>
                              <TableCell className="py-2"><ServiceCategoryBadge category={s.category} /></TableCell>
                              <TableCell className="max-w-[180px] truncate py-2 text-[13px]">{s.name}</TableCell>
                              <TableCell className="py-2 text-right text-[13px] tabular-nums">{priceFr(s.price)}</TableCell>
                              <TableCell className="py-2"><ServiceStatusBadge status={s.status} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>

                {/* Handoffs volets 2 / 3 (hub présélectionné via nav.hubsSel) */}
                <div className="flex flex-col gap-2 pb-2 sm:flex-row">
                  <Button className="h-11 flex-1 gap-2" onClick={goServices}>
                    <Wrench className="h-4 w-4" aria-hidden /> Gérer les services
                  </Button>
                  <Button variant="outline" className="h-11 flex-1 gap-2" onClick={goClients}>
                    <Users className="h-4 w-4" aria-hidden /> Base clients
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
