'use client'

// T51-c — Mobility Hub Operations / section « Base clients TMP » (4 onglets) :
//   1. Véhicules diagnostiqués — recherche q (serveur) + fiche complète au clic
//   2. Historique entretien    — timeline par véhicule ou liste groupée
//   3. Alertes automatiques    — échéances dépassées (urgent) / proches (info)
//   4. Programme fidélité      — règles de l'enseigne + donut des paliers
// Données : GET /api/mobility/vehicles (hook useVehicles) + GET
// /api/mobility/settings → loyalty (hook useHubSettings pour l'onglet 4).

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Award, BellRing, Car, CircleDot, Coins, Crown, Droplets, History, Phone,
  ScanLine, Search, TrendingUp, Users, Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { LOYALTY_ACTION_LABELS, SERVICE_TYPE_LABELS, TIER_LABELS, type HubDTO, type HubLoyaltyRuleDTO, type HubVehicleDTO } from '@/lib/t51-dto'
import {
  dateFr, fmtNum, formatDt, HintNote, LoadError, MobilityKpi, MobilitySkeleton,
  SCROLLABLE, useHubSettings, useVehicles, type VehicleHistoryRow,
} from './hub-shared'

export interface HubClientsProps {
  brandSlug: string
  /** Réseau national (filtré ici sur l'enseigne connectée). */
  hubs: HubDTO[]
  hubsLoading: boolean
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: '#a16207',
  ARGENT: '#94a3b8',
  OR: '#d97706',
  PLATINE: '#475569',
}

const FUEL_LABELS: Record<string, string> = {
  ESSENCE: 'Essence',
  DIESEL: 'Diesel',
  HYBRIDE: 'Hybride',
  GPL: 'GPL',
  ELECTRIQUE: 'Électrique',
}

const SERVICE_ICONS: Record<string, typeof Droplets> = {
  VIDANGE: Droplets,
  PNEUS_VENTE: CircleDot,
  PNEUS_MONTAGE: CircleDot,
  DIAGNOSTIC: ScanLine,
}

export function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? '#7d6b58'
  return (
    <Badge
      variant="outline"
      className="gap-1 whitespace-nowrap border-transparent font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {(tier === 'OR' || tier === 'PLATINE') && <Crown className="h-3 w-3" aria-hidden />}
      {TIER_LABELS[tier] ?? tier}
    </Badge>
  )
}

export function HubClients({ brandSlug, hubs, hubsLoading }: HubClientsProps) {
  const [tab, setTab] = useState('vehicules')
  // Recherche « q » : debounce 300 ms → paramètre du GET /api/mobility/vehicles
  const [search, setSearch] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [hubFilter, setHubFilter] = useState('tous')
  const [tierFilter, setTierFilter] = useState('tous')
  const [selected, setSelected] = useState<HubVehicleDTO | null>(null)

  const { data, error, loading, reload } = useVehicles({ q: debouncedQ })
  const settings = useHubSettings(brandSlug)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const brandHubs = useMemo(() => hubs.filter(h => h.brandSlug === brandSlug), [hubs, brandSlug])
  const brandHubIds = useMemo(() => new Set(brandHubs.map(h => h.id)), [brandHubs])

  const brandVehicles = useMemo(
    () => (data?.vehicles ?? []).filter(v => brandHubIds.has(v.hubId)),
    [data, brandHubIds],
  )
  const visibleVehicles = useMemo(
    () =>
      brandVehicles.filter(
        v => (hubFilter === 'tous' || v.hubId === hubFilter) && (tierFilter === 'tous' || v.loyaltyTier === tierFilter),
      ),
    [brandVehicles, hubFilter, tierFilter],
  )
  const brandHistory = useMemo(
    () => (data?.history ?? []).filter(r => brandVehicles.some(v => v.id === r.vehicleId)),
    [data, brandVehicles],
  )
  const historyByVehicle = useMemo(() => {
    const m = new Map<string, VehicleHistoryRow[]>()
    for (const r of brandHistory) {
      const list = m.get(r.vehicleId) ?? []
      list.push(r)
      m.set(r.vehicleId, list)
    }
    for (const list of m.values()) list.sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    return m
  }, [brandHistory])

  const alerts = useMemo(() => brandVehicles.filter(v => v.alert !== null), [brandVehicles])

  if (hubsLoading) return <MobilitySkeleton label="Chargement de la base clients TMP…" />
  if (loading) return <MobilitySkeleton label="Chargement des véhicules et de l'historique…" />
  if (error && !data) {
    return (
      <div className="space-y-4">
        <SectionIntro />
        <LoadError message={error} onRetry={reload} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionIntro />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="vehicules">Véhicules diagnostiqués</TabsTrigger>
          <TabsTrigger value="historique">Historique entretien</TabsTrigger>
          <TabsTrigger value="alertes">
            Alertes automatiques
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] tabular-nums">{alerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="fidelite">Programme fidélité</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicules" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">Véhicules suivis par les TMP ({visibleVehicles.length})</CardTitle>
                <CardDescription>
                  Recherche par immatriculation, propriétaire ou modèle ({brandVehicles.length} véhicules de
                  l&apos;enseigne). Cliquez sur une ligne pour la fiche complète et l&apos;historique d&apos;entretien.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Immat., client, modèle…"
                    className="h-9 w-52 pl-8"
                    aria-label="Rechercher un véhicule"
                  />
                </div>
                <Select value={hubFilter} onValueChange={setHubFilter}>
                  <SelectTrigger className="w-[190px]" aria-label="Filtrer par TMP">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Tous les TMP</SelectItem>
                    {brandHubs.map(h => (
                      <SelectItem key={h.id} value={h.id}>{h.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-[150px]" aria-label="Filtrer par palier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Tous paliers</SelectItem>
                    {['BRONZE', 'ARGENT', 'OR', 'PLATINE'].map(t => (
                      <SelectItem key={t} value={t}>{TIER_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {visibleVehicles.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Aucun véhicule ne correspond aux filtres / à la recherche.
                </p>
              ) : (
                <div className={`overflow-x-auto ${SCROLLABLE}`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Immat.</TableHead>
                        <TableHead>Véhicule</TableHead>
                        <TableHead>Carburant</TableHead>
                        <TableHead className="text-right">Km</TableHead>
                        <TableHead>Propriétaire</TableHead>
                        <TableHead className="text-right">Services</TableHead>
                        <TableHead className="text-right">Dépenses</TableHead>
                        <TableHead className="pr-4">Palier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleVehicles.map(v => (
                        <TableRow
                          key={v.id}
                          className="cursor-pointer"
                          onClick={() => setSelected(v)}
                        >
                          <TableCell className="pl-4 font-mono text-xs font-semibold tabular-nums">
                            <span className="flex items-center gap-1.5">
                              {v.alert && (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: v.alert.level === 'URGENT' ? '#c2410c' : '#d97706' }}
                                  aria-label={v.alert.level === 'URGENT' ? 'Alerte urgente' : 'Échéance proche'}
                                />
                              )}
                              {v.plate}
                            </span>
                          </TableCell>
                          <TableCell>
                            <p className="max-w-44 truncate text-xs font-medium">{v.brand} {v.model}</p>
                            <p className="text-[10px] text-muted-foreground">{v.year} · {v.hubCode ?? '—'}</p>
                          </TableCell>
                          <TableCell className="text-xs">{FUEL_LABELS[v.fuel] ?? v.fuel}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmtNum(v.km)} km</TableCell>
                          <TableCell>
                            <p className="max-w-40 truncate text-xs">{v.ownerName}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{v.ownerPhone}</p>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold tabular-nums">{v.servicesCount}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatDt(v.totalSpent)}</TableCell>
                          <TableCell className="pr-4"><TierBadge tier={v.loyaltyTier} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historique" className="mt-4 space-y-4">
          <HistoriqueTab
            vehicles={brandVehicles}
            historyByVehicle={historyByVehicle}
            onSelectVehicle={setSelected}
          />
        </TabsContent>

        <TabsContent value="alertes" className="mt-4 space-y-4">
          <AlertesTab alerts={alerts} />
        </TabsContent>

        <TabsContent value="fidelite" className="mt-4 space-y-4">
          <FideliteTab
            vehicles={brandVehicles}
            rules={settings.data?.loyalty ?? []}
            loading={settings.loading}
            error={settings.error}
            onRetry={settings.reload}
          />
        </TabsContent>
      </Tabs>

      {/* fiche véhicule au clic */}
      <VehicleDetailDialog vehicle={selected} history={selected ? historyByVehicle.get(selected.id) ?? [] : []} onClose={() => setSelected(null)} />
    </div>
  )
}

function SectionIntro() {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Base clients TMP
      </h2>
      <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Véhicules diagnostiqués et entretenus dans les micro-hubs de l&apos;enseigne : fiche complète, historique
        d&apos;entretien, alertes d&apos;échéance automatiques et programme de fidélité.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 2 — Historique d'entretien
// ---------------------------------------------------------------------------

function HistoriqueTab({
  vehicles, historyByVehicle, onSelectVehicle,
}: {
  vehicles: HubVehicleDTO[]
  historyByVehicle: Map<string, VehicleHistoryRow[]>
  onSelectVehicle: (v: HubVehicleDTO) => void
}) {
  const [vehicleId, setVehicleId] = useState('tous')

  const total = useMemo(() => [...historyByVehicle.values()].reduce((s, list) => s + list.length, 0), [historyByVehicle])
  const selectedVehicle = vehicles.find(v => v.id === vehicleId) ?? null
  const rows = vehicleId === 'tous'
    ? [...historyByVehicle.entries()]
        .flatMap(([vid, list]) => list.map(r => ({ ...r, vehicleId: vid })))
        .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    : (historyByVehicle.get(vehicleId) ?? [])

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles])

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">Historique d&apos;entretien ({total} prestations)</CardTitle>
          <CardDescription>
            {vehicleId === 'tous'
              ? 'Chronologie de toutes les prestations de l\'enseigne, véhicule par véhicule (liste groupée scrollable).'
              : 'Chronologie complète du véhicule sélectionné, de la plus récente à la plus ancienne.'}
          </CardDescription>
        </div>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="w-[280px]" aria-label="Sélectionner un véhicule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les véhicules</SelectItem>
            {vehicles.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.plate} — {v.brand} {v.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune prestation enregistrée.</p>
        ) : (
          <div className={SCROLLABLE}>
            {vehicleId === 'tous' ? (
              // liste groupée par véhicule
              <div className="space-y-4">
                {[...historyByVehicle.entries()]
                  .sort(([, a], [, b]) => (b[0]?.performedAt ?? '').localeCompare(a[0]?.performedAt ?? ''))
                  .map(([vid, list]) => {
                    const v = vehicleById.get(vid)
                    return (
                      <div key={vid} className="rounded-lg border border-stone-200 dark:border-stone-800">
                        <button
                          type="button"
                          className="flex w-full flex-wrap items-center justify-between gap-2 rounded-t-lg bg-stone-100/70 px-3 py-2 text-left transition-colors hover:bg-stone-200/70 dark:bg-stone-800/70 dark:hover:bg-stone-800"
                          onClick={() => (v ? onSelectVehicle(v) : undefined)}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="font-mono text-xs font-semibold">{v?.plate ?? vid}</span>
                            <span className="truncate text-xs text-muted-foreground">{v ? `${v.brand} ${v.model} · ${v.ownerName}` : ''}</span>
                          </span>
                          <Badge variant="secondary" className="tabular-nums">{list.length} prestation(s)</Badge>
                        </button>
                        <Timeline rows={list} compact />
                      </div>
                    )
                  })}
              </div>
            ) : (
              <Timeline rows={rows} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Timeline verticale des prestations d'un véhicule. */
function Timeline({ rows, compact }: { rows: VehicleHistoryRow[]; compact?: boolean }) {
  return (
    <ol className={`relative space-y-3 border-l border-stone-200 pl-5 dark:border-stone-800 ${compact ? 'px-3 py-3' : 'py-1'}`}>
      {rows.map((r, i) => {
        const Icon = SERVICE_ICONS[r.type] ?? Wrench
        return (
          <motion.li
            key={`${r.vehicleId}-${r.performedAt}-${i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
            className="relative"
          >
            <span className="absolute -left-[26px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900" aria-hidden>
              <Icon className="h-2 w-2 text-stone-500 dark:text-stone-400" />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-xs font-semibold">{SERVICE_TYPE_LABELS[r.type] ?? r.type}</span>
              <span className="text-[11px] text-muted-foreground">
                {dateFr(r.performedAt)} · {r.hubCode ?? '—'}
              </span>
              <span className="ml-auto text-xs font-semibold tabular-nums">{formatDt(r.amount)}</span>
            </div>
            {r.detail && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{r.detail}</p>
            )}
          </motion.li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Onglet 3 — Alertes automatiques
// ---------------------------------------------------------------------------

function AlertesTab({ alerts }: { alerts: HubVehicleDTO[] }) {
  const [filter, setFilter] = useState('toutes')
  const urgent = alerts.filter(v => v.alert?.level === 'URGENT')
  const info = alerts.filter(v => v.alert?.level === 'INFO')
  const rows = filter === 'toutes' ? alerts : filter === 'urgentes' ? urgent : info

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi value={fmtNum(alerts.length)} label="Alertes actives" sub="échéances d'entretien" icon={BellRing} tone="amber" />
        <MobilityKpi value={fmtNum(urgent.length)} label="Urgentes" sub="échéance dépassée — relancer" icon={BellRing} tone="terracotta" />
        <MobilityKpi value={fmtNum(info.length)} label="À venir" sub="entretien à planifier" icon={History} tone="slate" />
        <MobilityKpi
          value={alerts.length > 0 ? `${Math.round((urgent.length / alerts.length) * 100)} %` : '—'}
          label="Part d'urgents"
          sub="parmi les alertes actives"
          icon={TrendingUp}
          tone="violet"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Alertes d&apos;échéance ({rows.length})</CardTitle>
            <CardDescription>
              Calcul automatique à partir de la prochaine échéance d&apos;entretien et du seuil « jours » du paramétrage
              TMP de l&apos;enseigne : <b>terracotta = dépassée (urgent)</b>, <b>ambre = à prévoir (info)</b>.
            </CardDescription>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[170px]" aria-label="Filtrer les alertes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="toutes">Toutes ({alerts.length})</SelectItem>
              <SelectItem value="urgentes">Urgentes ({urgent.length})</SelectItem>
              <SelectItem value="infos">À venir ({info.length})</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              Aucune alerte — toutes les échéances d&apos;entretien sont à jour.
            </p>
          ) : (
            <div className={`grid gap-3 md:grid-cols-2 ${SCROLLABLE}`}>
              {rows.map(v => {
                const isUrgent = v.alert?.level === 'URGENT'
                return (
                  <Card
                    key={v.id}
                    className={`border-stone-200/80 dark:border-stone-800 ${isUrgent ? 'border-l-4 border-l-[#c2410c]' : 'border-l-4 border-l-[#d97706]'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-bold tabular-nums">{v.plate}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {v.brand} {v.model} · {v.ownerName} · TMP {v.hubCode ?? '—'}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`whitespace-nowrap ${
                            isUrgent
                              ? 'border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'
                              : 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {isUrgent ? 'Urgente' : 'À venir'}
                        </Badge>
                      </div>
                      <p className="mt-2 rounded-md bg-stone-100/70 px-2.5 py-2 text-xs leading-relaxed text-stone-700 dark:bg-stone-800/70 dark:text-stone-200">
                        {v.alert?.message}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          Dernier passage : {v.lastServiceAt ? dateFr(v.lastServiceAt) : '—'}
                        </span>
                        <Button asChild size="sm" variant="outline" className="h-7 gap-1.5">
                          <a href={`tel:${v.ownerPhone.replace(/\s/g, '')}`}>
                            <Phone className="h-3.5 w-3.5" aria-hidden /> {v.ownerPhone}
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Onglet 4 — Programme fidélité
// ---------------------------------------------------------------------------

function FideliteTab({
  vehicles, rules, loading, error, onRetry,
}: {
  vehicles: HubVehicleDTO[]
  rules: HubLoyaltyRuleDTO[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const tiers = useMemo(() => {
    const counts = { BRONZE: 0, ARGENT: 0, OR: 0, PLATINE: 0 }
    for (const v of vehicles) {
      const t = v.loyaltyTier as keyof typeof counts
      if (t in counts) counts[t] += 1
    }
    return counts
  }, [vehicles])
  const donutData = useMemo(
    () =>
      (Object.keys(tiers) as (keyof typeof tiers)[]).map(t => ({
        tier: t,
        label: TIER_LABELS[t],
        value: tiers[t],
        color: TIER_COLORS[t],
      })),
    [tiers],
  )
  const points = vehicles.reduce((s, v) => s + v.loyaltyPoints, 0)
  const avgSpent = vehicles.length ? Math.round(vehicles.reduce((s, v) => s + v.totalSpent, 0) / vehicles.length) : 0
  const avgServices = vehicles.length
    ? Math.round((vehicles.reduce((s, v) => s + v.servicesCount, 0) / vehicles.length) * 10) / 10
    : 0
  const fuelMix = (() => {
    const m = new Map<string, number>()
    for (const v of vehicles) m.set(v.fuel, (m.get(v.fuel) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  })()

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi value={fmtNum(vehicles.length)} label="Clients fidèles" sub="véhicules de l'enseigne" icon={Users} tone="emerald" />
        <MobilityKpi value={fmtNum(points)} label="Points cumulés" sub="toutes cartes confondues" icon={Coins} tone="amber" />
        <MobilityKpi value={formatDt(avgSpent)} label="Panier moyen cumulé" sub="dépenses moyennes par véhicule" icon={TrendingUp} tone="teal" />
        <MobilityKpi value={`${avgServices.toLocaleString('fr-FR')}`} label="Prestations / client" sub="moyenne par véhicule" icon={Wrench} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* donut paliers */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Répartition des paliers</CardTitle>
            <CardDescription>{vehicles.length} véhicules par niveau de fidélité.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="mx-auto aspect-square h-56 w-full max-w-64">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  strokeWidth={1.5}
                >
                  {donutData.map(d => (
                    <Cell key={d.tier} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {donutData.map(d => (
                <span key={d.tier} className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1 text-[11px] dark:bg-stone-800/70">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                    {d.label}
                  </span>
                  <b className="tabular-nums">{d.value}</b>
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {fuelMix.map(([fuel, count]) => (
                <Badge key={fuel} variant="secondary" className="text-[10px]">
                  {FUEL_LABELS[fuel] ?? fuel} : {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* règles */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Règles de fidélité de l&apos;enseigne</CardTitle>
            <CardDescription>
              Points attribués par action et récompenses débloquées au seuil — paramétrables dans les consoles
              Super Admin (action « maj-loyalty »).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <LoadError message={error} onRetry={onRetry} />}
            {loading && !error && <p className="text-sm text-muted-foreground">Chargement des règles…</p>}
            {!loading && !error && rules.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune règle de fidélité paramétrée.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {rules.map(rule => (
                <Card key={rule.id} className="border-stone-200/80 dark:border-stone-800">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-bold">
                        <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                        {LOYALTY_ACTION_LABELS[rule.action] ?? rule.action}
                      </p>
                      <Badge
                        variant="outline"
                        className={rule.active
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'}
                      >
                        {rule.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                      +{rule.points} <span className="text-sm font-medium text-muted-foreground">pts</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Récompense : <b className="text-stone-800 dark:text-stone-200">{rule.rewardLabel}</b>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Seuil de déblocage : {fmtNum(rule.rewardThreshold)} pts</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <HintNote>
              Paliers : Bronze &lt; 150 pts · Argent ≥ 150 · Or ≥ 300 · Platine ≥ 500. Une prestation enregistrée au TMP
              crédite automatiquement la carte du client (vidange +10, diagnostic +5, pneus +15, conversion +25).
            </HintNote>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Fiche véhicule (Dialog)
// ---------------------------------------------------------------------------

function VehicleDetailDialog({
  vehicle, history, onClose,
}: {
  vehicle: HubVehicleDTO | null
  history: VehicleHistoryRow[]
  onClose: () => void
}) {
  return (
    <Dialog open={vehicle !== null} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto scroll-coffee">
        {vehicle && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                <span className="font-mono">{vehicle.plate}</span>
                <span className="text-sm font-normal text-muted-foreground">{vehicle.brand} {vehicle.model} · {vehicle.year}</span>
                <TierBadge tier={vehicle.loyaltyTier} />
              </DialogTitle>
              <DialogDescription>
                {FUEL_LABELS[vehicle.fuel] ?? vehicle.fuel} · {fmtNum(vehicle.km)} km · TMP {vehicle.hubCode ?? '—'} ·
                Client : {vehicle.ownerName} ({vehicle.ownerPhone}) · fidélité : {fmtNum(vehicle.loyaltyPoints)} pts
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MobilityKpi value={fmtNum(vehicle.servicesCount)} label="Prestations" icon={Wrench} tone="teal" />
              <MobilityKpi value={formatDt(vehicle.totalSpent)} label="Dépenses cumulées" icon={Coins} tone="amber" />
              <MobilityKpi value={fmtNum(vehicle.loyaltyPoints)} label="Points fidélité" icon={Award} tone="violet" />
              <MobilityKpi
                value={vehicle.nextServiceDueAt ? dateFr(vehicle.nextServiceDueAt) : '—'}
                label="Prochaine échéance"
                sub={vehicle.alert ? vehicle.alert.message : 'à jour'}
                icon={BellRing}
                tone={vehicle.alert?.level === 'URGENT' ? 'terracotta' : vehicle.alert ? 'amber' : 'emerald'}
              />
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Premier passage : <b className="text-stone-800 dark:text-stone-200">{dateFr(vehicle.firstSeenAt)}</b></span>
              <span>Dernier passage : <b className="text-stone-800 dark:text-stone-200">{vehicle.lastServiceAt ? dateFr(vehicle.lastServiceAt) : '—'}</b></span>
              {vehicle.notes && (
                <span className="sm:col-span-2 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Note interne : {vehicle.notes}
                </span>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <History className="h-4 w-4 text-muted-foreground" aria-hidden />
                Historique des prestations ({history.length})
              </p>
              <div className={SCROLLABLE}>
                {history.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Aucune prestation rattachée à cette fiche.</p>
                ) : (
                  <Timeline rows={history} />
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={`tel:${vehicle.ownerPhone.replace(/\s/g, '')}`}>
                  <Phone className="h-3.5 w-3.5" aria-hidden /> Appeler le client
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
