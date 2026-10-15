'use client'

// T51-c — Mobility Hub Operations / section « Carte des TMP » (4 onglets) :
//   1. Vue Nationale — carte SVG Tunisie + 15 TMP + filtre statut + stats réseau
//   2. Par Enseigne  — sélecteur d'enseigne + grille des TMP avec KPIs
//   3. Performance   — classement triable (CA, ROI, conversion, satisfaction)
//   4. Pipeline      — TMP en construction / pilote + changement de statut
// Données : hubs réseau national passés par MobilityHubView (useHubs()).

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Award, Coins, Gauge, Hammer, MapPin, Medal, Package, Star, Store,
  Target, TrendingDown, TrendingUp, Trophy, Users, Wrench, ChevronDown,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { HUB_STATUS_LABELS, type HubDTO } from '@/lib/t51-dto'
import {
  brandLabel, brandMarkerColor, dateFr, fmtNum, fmtPct, fmtRating, formatTnd, HintNote,
  HubStatusBadge, MiniBar, MobilityKpi, monthsSinceFr, postMobility, SCROLLABLE,
  sortBy, TunisiaHubMap, type HubStats,
} from './hub-shared'

export interface HubCarteProps {
  brandSlug: string
  /** Réseau national complet (toutes enseignes). */
  hubs: HubDTO[]
  stats: HubStats | null
  hubsLoading: boolean
  onHubsReload: () => void
}

const STATUS_KEYS = ['OPERATIONNEL', 'PILOTE', 'EN_CONSTRUCTION', 'SUSPENDU'] as const

export function HubCarte({ brandSlug, hubs, stats, hubsLoading, onHubsReload }: HubCarteProps) {
  const [tab, setTab] = useState('nationale')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Carte des TMP
          </h2>
          <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Vue nationale du réseau des micro-stations, déclinaison par enseigne, classement de performance et pipeline
            d&apos;ouverture (en construction / pilotes).
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="nationale">Vue Nationale</TabsTrigger>
          <TabsTrigger value="enseigne">Par Enseigne</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline (en construction)</TabsTrigger>
        </TabsList>

        <TabsContent value="nationale" className="mt-4 space-y-4">
          <VueNationale hubs={hubs} stats={stats} loading={hubsLoading} />
        </TabsContent>
        <TabsContent value="enseigne" className="mt-4 space-y-4">
          <ParEnseigne hubs={hubs} brandSlug={brandSlug} loading={hubsLoading} />
        </TabsContent>
        <TabsContent value="performance" className="mt-4 space-y-4">
          <Performance hubs={hubs} brandSlug={brandSlug} loading={hubsLoading} />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <Pipeline hubs={hubs} loading={hubsLoading} onHubsReload={onHubsReload} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 1 — Vue Nationale
// ---------------------------------------------------------------------------

function VueNationale({ hubs, stats, loading }: { hubs: HubDTO[]; stats: HubStats | null; loading: boolean }) {
  const [statusFilter, setStatusFilter] = useState<string>('tous')
  const [selected, setSelected] = useState<HubDTO | null>(null)

  const filtered = useMemo(
    () => (statusFilter === 'tous' ? hubs : hubs.filter(h => h.status === statusFilter)),
    [hubs, statusFilter],
  )

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la carte des TMP">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-[560px] rounded-xl" />
      </div>
    )
  }

  return (
    <>
      {/* bandeau stats réseau */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi
          value={stats ? `${stats.total}` : '—'}
          label="TMP sur le réseau"
          sub={stats ? `${stats.operational} opérationnels · ${stats.construction + stats.pilotes} en déploiement` : undefined}
          icon={Store}
          tone="emerald"
        />
        <MobilityKpi
          value={stats ? formatTnd(stats.ca30) : '—'}
          label="CA services 30 j (réseau)"
          sub={stats ? `${fmtNum(stats.conversions90)} conversions proposées sur 90 j` : undefined}
          icon={Coins}
          tone="amber"
        />
        <MobilityKpi
          value={stats ? fmtPct(stats.avgConversionRate) : '—'}
          label="Taux de conversion moyen"
          sub={stats ? `${stats.confirmed90} confirmées / ${stats.conversions90} proposées` : undefined}
          icon={TrendingUp}
          tone="teal"
        />
        <MobilityKpi
          value={stats ? fmtRating(stats.avgRating) : '—'}
          label="Satisfaction client réseau"
          sub={stats ? `${fmtNum(stats.vehicles)} véhicules suivis` : undefined}
          icon={Star}
          tone="violet"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Carte nationale des micro-hubs</CardTitle>
            <CardDescription>
              {filtered.length} TMP affiché(s) — épingle colorée par enseigne, pastille centrale = statut, halo animé = en
              construction. Survolez un TMP pour le détail, cliquez pour la fiche complète.
            </CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[190px]" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous les statuts</SelectItem>
              {STATUS_KEYS.map(s => (
                <SelectItem key={s} value={s}>{HUB_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <TunisiaHubMap hubs={filtered} onSelect={setSelected} selectedCode={selected?.code ?? null} />
        </CardContent>
      </Card>

      {/* fiche TMP au clic sur la carte */}
      <HubDetailDialog hub={selected} onClose={() => setSelected(null)} />
    </>
  )
}

/** Fiche complète d'un TMP (ouverte au clic sur un marqueur). */
export function HubDetailDialog({ hub, onClose }: { hub: HubDTO | null; onClose: () => void }) {
  return (
    <Dialog open={hub !== null} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl">
        {hub && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brandMarkerColor(hub.brandSlug) }} aria-hidden />
                {hub.name}
                <span className="font-mono text-xs text-muted-foreground">{hub.code}</span>
                <HubStatusBadge status={hub.status} />
              </DialogTitle>
              <DialogDescription>
                {brandLabel(hub.brandSlug)} · {hub.address} · Franchisé : {hub.franchisee}
                {hub.contractRef ? ` · Contrat ${hub.contractRef}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MobilityKpi value={formatTnd(hub.ca30)} label="CA 30 j" sub={`précédent : ${formatTnd(hub.caPrev30)}`} icon={Coins} tone="amber" />
              <MobilityKpi value={fmtNum(hub.services30)} label="Prestations 30 j" sub={`${hub.vehiclesCount} véhicules suivis`} icon={Wrench} tone="teal" />
              <MobilityKpi value={fmtPct(hub.conversionRate)} label="Taux conversion 90 j" sub={`${hub.conversionsConfirmed90}/${hub.conversions90} confirmées`} icon={TrendingUp} tone="emerald" />
              <MobilityKpi value={fmtRating(hub.rating)} label="Satisfaction" sub={`${fmtNum(hub.reviewsCount)} avis`} icon={Star} tone="violet" />
            </div>
            <div className="space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Target className="h-4 w-4" aria-hidden /> Objectif mensuel
                </span>
                <span className="font-semibold tabular-nums">
                  {formatTnd(hub.ca30)} / {formatTnd(hub.targetMonthlyCa)} · {fmtPct(hub.targetPct)}
                </span>
              </div>
              <Progress value={Math.min(100, hub.targetPct)} className="h-2" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground md:grid-cols-4">
                <span>ROI annualisé : <b className="text-stone-800 dark:text-stone-200">{fmtPct(hub.roiPct)}</b></span>
                <span>Investissement : <b className="text-stone-800 dark:text-stone-200">{formatTnd(hub.investment)}</b></span>
                <span>CA capté stations : <b className="text-stone-800 dark:text-stone-200">{formatTnd(hub.caCaptured)}</b></span>
                <span>Surface : <b className="text-stone-800 dark:text-stone-200">{hub.surfaceM2} m² · {hub.bays} baies</b></span>
                <span>Ouverture : <b className="text-stone-800 dark:text-stone-200">{dateFr(hub.openedAt)}</b></span>
                <span>Alertes équip. : <b className={hub.equipmentAlerts > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-stone-800 dark:text-stone-200'}>{hub.equipmentAlerts}</b></span>
                <span>Alertes stock : <b className={hub.stockAlerts > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-stone-800 dark:text-stone-200'}>{hub.stockAlerts}</b></span>
                <span>Gouvernorat : <b className="text-stone-800 dark:text-stone-200">{hub.gouvernorat}</b></span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Onglet 2 — Par Enseigne
// ---------------------------------------------------------------------------

function ParEnseigne({ hubs, brandSlug, loading }: { hubs: HubDTO[]; brandSlug: string; loading: boolean }) {
  const [brand, setBrand] = useState(brandSlug)
  const brands = useMemo(() => {
    const seen = new Map<string, number>()
    for (const h of hubs) seen.set(h.brandSlug, (seen.get(h.brandSlug) ?? 0) + 1)
    return [...seen.entries()].map(([slug, count]) => ({ slug, count, label: brandLabel(slug) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [hubs])

  const rows = useMemo(() => hubs.filter(h => h.brandSlug === brand), [hubs, brand])
  const agg = useMemo(() => ({
    ca30: rows.reduce((s, h) => s + h.ca30, 0),
    conversions: rows.reduce((s, h) => s + h.conversions90, 0),
    confirmed: rows.reduce((s, h) => s + h.conversionsConfirmed90, 0),
    rating: rows.length ? Math.round((rows.reduce((s, h) => s + h.rating, 0) / rows.length) * 10) / 10 : 0,
    vehicles: rows.reduce((s, h) => s + h.vehiclesCount, 0),
  }), [rows])

  if (loading) return <MobilityKpiSkeletonGrid />

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Réseau par enseigne</CardTitle>
            <CardDescription>Comparez le parc de micro-hubs enseigne par enseigne (objectif, services, fidèle clientèle).</CardDescription>
          </div>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-[210px]" aria-label="Sélectionner une enseigne">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brands.map(b => (
                <SelectItem key={b.slug} value={b.slug}>
                  {b.label} · {b.count} TMP
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <MobilityKpi value={`${rows.length}`} label="TMP de l'enseigne" icon={Store} tone="emerald" />
            <MobilityKpi value={formatTnd(agg.ca30)} label="CA 30 j" icon={Coins} tone="amber" />
            <MobilityKpi value={`${agg.confirmed}/${agg.conversions}`} label="Conversions 90 j" sub="confirmées / proposées" icon={TrendingUp} tone="teal" />
            <MobilityKpi value={fmtRating(agg.rating)} label="Note moyenne" icon={Star} tone="violet" />
            <MobilityKpi value={fmtNum(agg.vehicles)} label="Véhicules suivis" icon={Users} tone="slate" />
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-muted-foreground dark:border-stone-700">
              Aucun TMP référencé pour cette enseigne.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map(h => (
                <Card key={h.id} className="border-stone-200/80 transition-shadow hover:shadow-md dark:border-stone-800">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{h.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{h.code} · {h.gouvernorat} · {h.franchisee}</p>
                      </div>
                      <HubStatusBadge status={h.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                        <span className="text-muted-foreground">CA 30 j</span>
                        <b className="tabular-nums">{formatTnd(h.ca30)}</b>
                      </span>
                      <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                        <span className="text-muted-foreground">Services 30 j</span>
                        <b className="tabular-nums">{fmtNum(h.services30)}</b>
                      </span>
                      <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                        <span className="text-muted-foreground">Véhicules</span>
                        <b className="tabular-nums">{fmtNum(h.vehiclesCount)}</b>
                      </span>
                      <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                        <span className="text-muted-foreground">Note</span>
                        <b className="tabular-nums">{fmtRating(h.rating)}</b>
                      </span>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Objectif mensuel</span>
                        <span className={`font-semibold tabular-nums ${h.targetPct >= 100 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                          {fmtPct(h.targetPct)} de {formatTnd(h.targetMonthlyCa)}
                        </span>
                      </div>
                      <MiniBar
                        pct={h.targetPct}
                        color={h.targetPct >= 100 ? '#059669' : h.targetPct >= 70 ? '#d97706' : '#c2410c'}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function MobilityKpiSkeletonGrid() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 3 — Performance (classement triable)
// ---------------------------------------------------------------------------

type SortKey = 'ca30' | 'roiPct' | 'conversionRate' | 'rating' | 'services30'

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'ca30', label: 'CA 30 j' },
  { key: 'roiPct', label: 'ROI' },
  { key: 'conversionRate', label: 'Conversion' },
  { key: 'rating', label: 'Satisfaction' },
  { key: 'services30', label: 'Volume 30 j' },
]

const MEDALS = [
  { icon: Trophy, color: '#c98a2d', label: 'Or' },
  { icon: Medal, color: '#94a3b8', label: 'Argent' },
  { icon: Award, color: '#b45309', label: 'Bronze' },
]

function Performance({ hubs, brandSlug, loading }: { hubs: HubDTO[]; brandSlug: string; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('ca30')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const operational = useMemo(() => hubs.filter(h => h.status === 'OPERATIONNEL' || h.status === 'PILOTE'), [hubs])
  const ranked = useMemo(() => sortBy(operational, sortKey, dir), [operational, sortKey, dir])
  const maxCa = useMemo(() => Math.max(1, ...operational.map(h => h.ca30)), [operational])
  const podium = ranked.slice(0, 3)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortKey(key)
      setDir('desc')
    }
  }

  if (loading) return <MobilityKpiSkeletonGrid />

  return (
    <>
      {/* podium top 3 selon le critère actif */}
      <div className="grid gap-3 md:grid-cols-3">
        {podium.map((h, i) => {
          const M = MEDALS[i]
          const trend = h.ca30 - h.caPrev30
          return (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <Card className="border-stone-200/80 dark:border-stone-800">
                <CardContent className="relative overflow-hidden p-4">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: M.color }} aria-hidden />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: M.color }}>
                        <M.icon className="h-3.5 w-3.5" aria-hidden /> {i + 1}{i === 0 ? 'er' : 'e'} · {M.label}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold">{h.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {h.code} · {brandLabel(h.brandSlug)} · {h.franchisee}
                      </p>
                    </div>
                    <HubStatusBadge status={h.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                      <span className="text-muted-foreground">{SORT_COLUMNS.find(c => c.key === sortKey)?.label}</span>
                      <b className="tabular-nums">
                        {sortKey === 'ca30' ? formatTnd(h.ca30)
                          : sortKey === 'roiPct' ? fmtPct(h.roiPct)
                          : sortKey === 'conversionRate' ? fmtPct(h.conversionRate)
                          : sortKey === 'rating' ? fmtRating(h.rating)
                          : fmtNum(h.services30)}
                      </b>
                    </span>
                    <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                      <span className="text-muted-foreground">Tendance CA</span>
                      <b className={`flex items-center gap-1 tabular-nums ${trend >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-orange-700 dark:text-orange-400'}`}>
                        {trend >= 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
                        {trend >= 0 ? '+' : ''}{formatTnd(trend)}
                      </b>
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CA vs meilleur du réseau</span>
                      <span className="tabular-nums">{fmtPct(Math.round((h.ca30 / maxCa) * 100))}</span>
                    </div>
                    <MiniBar pct={(h.ca30 / maxCa) * 100} color={M.color} className="mt-1" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Classement des TMP — {SORT_COLUMNS.find(c => c.key === sortKey)?.label} ({dir === 'desc' ? 'décroissant' : 'croissant'})</CardTitle>
          <CardDescription>
            Cliquez sur un en-tête pour changer de critère. Les TMP de {brandLabel(brandSlug)} sont surlignés. Les pastilles
            « équipement / stock » signalent les alertes de maintenance et de réassort.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">#</TableHead>
                  <TableHead>TMP</TableHead>
                  <TableHead>Enseigne</TableHead>
                  {SORT_COLUMNS.map(col => (
                    <TableHead key={col.key} className="text-right">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold transition-colors hover:text-stone-900 dark:hover:text-stone-100 ${sortKey === col.key ? 'text-stone-900 dark:text-stone-100' : 'text-muted-foreground'}`}
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.label}
                        {sortKey === col.key && (dir === 'desc' ? <TrendingDown className="h-3 w-3" aria-hidden /> : <TrendingUp className="h-3 w-3" aria-hidden />)}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="w-36 pr-4">Objectif</TableHead>
                  <TableHead className="pr-4 text-right">Alertes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((h, i) => (
                  <TableRow
                    key={h.id}
                    className={h.brandSlug === brandSlug ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}
                  >
                    <TableCell className="pl-4 text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <p className="max-w-56 truncate text-xs font-semibold">{h.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{h.code} · {h.gouvernorat}</p>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: brandMarkerColor(h.brandSlug) }} aria-hidden />
                        {brandLabel(h.brandSlug)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums">{formatTnd(h.ca30)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <span className={h.roiPct >= 100 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>{fmtPct(h.roiPct)}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtPct(h.conversionRate)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtRating(h.rating)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtNum(h.services30)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                        <span>{fmtPct(h.targetPct)}</span>
                        <MiniBar
                          pct={h.targetPct}
                          color={h.targetPct >= 100 ? '#059669' : h.targetPct >= 70 ? '#d97706' : '#c2410c'}
                          className="w-14"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {h.equipmentAlerts > 0 && (
                          <Badge variant="outline" className="gap-1 border-orange-300 bg-orange-50 text-[10px] text-orange-800 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                            <Wrench className="h-3 w-3" aria-hidden /> {h.equipmentAlerts}
                          </Badge>
                        )}
                        {h.stockAlerts > 0 && (
                          <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <Package className="h-3 w-3" aria-hidden /> {h.stockAlerts}
                          </Badge>
                        )}
                        {h.equipmentAlerts === 0 && h.stockAlerts === 0 && (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            RAS
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Onglet 4 — Pipeline (en construction / pilotes)
// ---------------------------------------------------------------------------

function Pipeline({ hubs, loading, onHubsReload }: { hubs: HubDTO[]; loading: boolean; onHubsReload: () => void }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const pipeline = useMemo(
    () => hubs.filter(h => h.status === 'EN_CONSTRUCTION' || h.status === 'PILOTE'),
    [hubs],
  )

  const changeStatus = async (hub: HubDTO, status: string) => {
    setPendingId(hub.id)
    const res = await postMobility('/api/mobility/hubs', { action: 'maj-statut', hubId: hub.id, status })
    setPendingId(null)
    if (res.ok) {
      toast.success('Statut mis à jour', {
        description: `${hub.code} — ${hub.name} est désormais « ${HUB_STATUS_LABELS[status] ?? status} ».`,
      })
      onHubsReload()
    } else {
      toast.error('Mise à jour refusée', { description: res.error })
    }
  }

  if (loading) return <MobilityKpiSkeletonGrid />

  return (
    <>
      <HintNote>
        <b>Pipeline de déploiement</b> — les TMP « en construction » (halo animé sur la carte nationale) sont en cours
        d&apos;équipement avant mise en service ; les « pilotes » exploitent depuis quelques mois avec un suivi renforcé de
        la direction réseau. Le changement de statut est journalisé (audit module MOBILITY).
      </HintNote>

      {pipeline.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-muted-foreground dark:border-stone-700">
          Aucun TMP en construction ni en phase pilote actuellement.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pipeline.map(h => {
            const isConstruction = h.status === 'EN_CONSTRUCTION'
            const months = monthsSinceFr(h.openedAt)
            const pending = pendingId === h.id
            return (
              <Card key={h.id} className="border-stone-200/80 dark:border-stone-800">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brandMarkerColor(h.brandSlug) }} aria-hidden />
                    {h.name}
                    <span className="font-mono text-[10px] text-muted-foreground">{h.code}</span>
                    <HubStatusBadge status={h.status} />
                    {isConstruction && (
                      <Badge variant="outline" className="gap-1 whitespace-nowrap border-slate-300 bg-slate-100 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <Hammer className="h-3 w-3" aria-hidden /> En construction
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {brandLabel(h.brandSlug)} · {h.address} · Franchisé : {h.franchisee}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                      <span className="text-muted-foreground">{isConstruction ? 'Mise en service prévue' : 'Exploitation'}</span>
                      <b className="tabular-nums">{isConstruction ? dateFr(h.openedAt) : `${months} mois`}</b>
                    </span>
                    <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                      <span className="text-muted-foreground">Investissement</span>
                      <b className="tabular-nums">{formatTnd(h.investment)}</b>
                    </span>
                    <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                      <span className="text-muted-foreground">CA cible mensuel</span>
                      <b className="tabular-nums">{formatTnd(h.targetMonthlyCa)}</b>
                    </span>
                    <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                      <span className="text-muted-foreground">Configuration</span>
                      <b className="tabular-nums">{h.surfaceM2} m² · {h.bays} baies</b>
                    </span>
                  </div>

                  {h.status === 'PILOTE' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Objectif atteint sur le mois glissant</span>
                        <span className={`font-semibold tabular-nums ${h.targetPct >= 100 ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{fmtPct(h.targetPct)}</span>
                      </div>
                      <MiniBar pct={h.targetPct} color={h.targetPct >= 100 ? '#059669' : '#d97706'} />
                      <p className="text-[11px] text-muted-foreground">
                        CA 30 j : {formatTnd(h.ca30)} · {fmtNum(h.services30)} prestations · {fmtNum(h.vehiclesCount)} véhicules · note {fmtRating(h.rating)}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" aria-hidden />
                      Suivi : {h.gouvernorat} · {h.delegation}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={pending}>
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          {pending ? 'Mise à jour…' : 'Changer le statut'}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Cycle de vie du TMP</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {STATUS_KEYS.filter(s => s !== h.status).map(s => (
                          <DropdownMenuItem key={s} onClick={() => { void changeStatus(h, s) }}>
                            {HUB_STATUS_LABELS[s]}
                            {s === 'OPERATIONNEL' && <span className="ml-auto text-[10px] text-muted-foreground">mise en service</span>}
                            {s === 'SUSPENDU' && <span className="ml-auto text-[10px] text-muted-foreground">provisoire</span>}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
