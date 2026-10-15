'use client'

// T51-c — Mobility Hub Operations / section « Analytics & Conversions » (4 onglets) :
//   1. Taux de conversion TMP → Station — ComposedChart mensuel + cartes par TMP
//   2. CA généré pour les stations — stationCapture + topConversions + AreaChart
//   3. ROI par TMP — barres horizontales (seuil 100 %) + scatter CA/ROI
//   4. Comparatif entre franchisés — tableau réseau 15 TMP + radar du sélectionné
// Données : GET /api/mobility/analytics?brand= (useAnalytics) + hubs réseau
// national (props, pour l'onglet comparatif toutes enseignes).

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRightLeft, BarChart3, Building2, Coins, Gauge, TrendingDown, TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { tooltipStyle } from '@/lib/chart'
import { useChartPalette } from '@/hooks/use-chart-palette'
import { type HubDTO } from '@/lib/t51-dto'
import {
  brandLabel, brandMarkerColor, dateFr, fmtNum, fmtPct, fmtRating, formatTnd, HintNote,
  LoadError, MiniBar, MobilityKpi, MobilitySkeleton, SCROLLABLE, sortBy, useAnalytics,
} from './hub-shared'

export interface HubAnalyticsProps {
  brandSlug: string
  /** Réseau national complet — comparatif entre franchisés (onglet 4). */
  hubs: HubDTO[]
  hubsLoading: boolean
}

type SortKey = 'ca30' | 'services30' | 'conversions90' | 'conversionRate' | 'roiPct' | 'rating'

export function HubAnalytics({ brandSlug, hubs, hubsLoading }: HubAnalyticsProps) {
  const [tab, setTab] = useState('conversion')
  const { data, error, loading, reload } = useAnalytics(brandSlug)

  if (loading) return <MobilitySkeleton label="Chargement des analytics TMP…" />
  if (error && !data) {
    return (
      <div className="space-y-4">
        <SectionIntro />
        <LoadError message={error} onRetry={reload} />
      </div>
    )
  }

  const totals = data?.totals
  const hubsBrand = data?.hubs ?? []

  return (
    <div className="space-y-4">
      <SectionIntro />

      {/* KPIs enseigne */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi value={formatTnd(totals?.ca30 ?? 0)} label="CA 30 j (enseigne)" sub={`${hubsBrand.length} TMP actifs`} icon={Coins} tone="amber" />
        <MobilityKpi value={formatTnd(totals?.captured ?? 0)} label="CA capté pour les stations" sub="conversions confirmées" icon={Building2} tone="emerald" />
        <MobilityKpi value={`${totals?.confirmed90 ?? 0}/${totals?.conversions90 ?? 0}`} label="Conversions 90 j" sub="confirmées / proposées" icon={ArrowRightLeft} tone="teal" />
        <MobilityKpi value={fmtPct(totals?.avgRoi ?? 0)} label="ROI moyen" sub="annualisé sur investissement" icon={Gauge} tone="violet" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="conversion">Taux de conversion TMP → Station</TabsTrigger>
          <TabsTrigger value="stations">CA généré pour les stations</TabsTrigger>
          <TabsTrigger value="roi">ROI par TMP</TabsTrigger>
          <TabsTrigger value="comparatif">Comparatif entre franchisés</TabsTrigger>
        </TabsList>

        <TabsContent value="conversion" className="mt-4 space-y-4">
          <ConversionTab monthly={data?.monthly ?? []} hubs={hubsBrand} avgConversion={totals?.avgConversion ?? 0} />
        </TabsContent>
        <TabsContent value="stations" className="mt-4 space-y-4">
          <StationsTab stationCapture={data?.stationCapture ?? []} topConversions={data?.topConversions ?? []} monthly={data?.monthly ?? []} captured={totals?.captured ?? 0} />
        </TabsContent>
        <TabsContent value="roi" className="mt-4 space-y-4">
          <RoiTab hubs={hubsBrand} />
        </TabsContent>
        <TabsContent value="comparatif" className="mt-4 space-y-4">
          <ComparatifTab hubs={hubs} brandSlug={brandSlug} hubsLoading={hubsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectionIntro() {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Analytics &amp; Conversions
      </h2>
      <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Mesure de l&apos;effet réseau : clients du micro-hub orientés vers les stations classiques, chiffre d&apos;affaires
        capté, retour sur investissement par TMP et comparatif complet des franchisés.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 1 — Taux de conversion TMP → Station
// ---------------------------------------------------------------------------

function ConversionTab({
  monthly, hubs, avgConversion,
}: {
  monthly: { month: string; ca: number; conversions: number; captured: number }[]
  hubs: HubDTO[]
  avgConversion: number
}) {
  const palette = useChartPalette()
  const TICK = { fontSize: 10, fill: palette.axis }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversions confirmées &amp; CA capté (6 mois)</CardTitle>
            <CardDescription>
              Barres = conversions confirmées vers les stations classiques · courbe = CA capté (dinars).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-64 w-full">
              <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={TICK} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => `${Math.round(v / 1000)} K`} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  cursor={{ fill: palette.cursor }}
                  formatter={(v, n) => [n === 'CA capté (DT)' ? formatTnd(Number(v)) : fmtNum(Number(v)), String(n)]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                <Bar yAxisId="left" dataKey="conversions" name="Conversions confirmées" fill={palette.color(1)} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Line yAxisId="right" dataKey="captured" name="CA capté (DT)" stroke={palette.color(2)} strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taux global de conversion</CardTitle>
            <CardDescription>Conversions confirmées / proposées sur 90 jours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{fmtPct(avgConversion)}</span>
              <span className="text-xs text-muted-foreground">moyenne enseigne</span>
            </div>
            <MiniBar pct={avgConversion} color={avgConversion >= 60 ? '#059669' : avgConversion >= 40 ? '#d97706' : '#c2410c'} className="h-2" />
            <HintNote>
              Le taux mesure la capacité des TMP à orienter leurs clients vers les stations-service classiques du réseau
              (prestations hors périmètre micro-hub : carburant, mécanique lourde, boutique).
            </HintNote>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conversion par TMP (90 jours)</CardTitle>
          <CardDescription>Taux de confirmation des orientations proposées par chaque micro-hub.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {hubs.map(h => (
              <Card key={h.id} className="border-stone-200/80 dark:border-stone-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{h.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{h.code} · {h.gouvernorat}</p>
                    </div>
                    <span className="text-lg font-bold tabular-nums">{fmtPct(h.conversionRate)}</span>
                  </div>
                  <MiniBar
                    pct={h.conversionRate}
                    color={h.conversionRate >= 60 ? '#059669' : h.conversionRate >= 40 ? '#d97706' : '#c2410c'}
                    className="mt-2.5"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {h.conversionsConfirmed90}/{h.conversions90} confirmées · {formatTnd(h.caCaptured)} captés
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Onglet 2 — CA généré pour les stations classiques
// ---------------------------------------------------------------------------

function StationsTab({
  stationCapture, topConversions, monthly, captured,
}: {
  stationCapture: { station: string; stationCode: string; amount: number; count: number }[]
  topConversions: { plate: string; reason: string; amount: number; station: string; stationCode: string; proposedAt: string }[]
  monthly: { month: string; ca: number; conversions: number; captured: number }[]
  captured: number
}) {
  const palette = useChartPalette()
  const TICK = { fontSize: 10, fill: palette.axis }
  const maxAmount = Math.max(1, ...stationCapture.map(s => s.amount))
  const top = stationCapture[0]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi value={formatTnd(captured)} label="CA total capté" sub="conversions confirmées" icon={Coins} tone="emerald" />
        <MobilityKpi value={fmtNum(stationCapture.length)} label="Stations bénéficiaires" sub="stations classiques du réseau" icon={Building2} tone="teal" />
        <MobilityKpi value={top ? top.station : '—'} label="1re bénéficiaire" sub={top ? `${top.stationCode} · ${formatTnd(top.amount)} · ${top.count} conversion(s)` : undefined} icon={TrendingUp} tone="amber" />
        <MobilityKpi value={fmtNum(topConversions.length)} label="Plus grosses conversions" sub="historique complet" icon={ArrowRightLeft} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CA capté par mois (6 mois)</CardTitle>
            <CardDescription>Dinars réalisés dans les stations suite aux orientations TMP.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-64 w-full">
              <AreaChart data={monthly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="mobCaptured" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={palette.color(2)} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={palette.color(2)} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => `${Math.round(v / 1000)} K`} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  formatter={(v, n) => [formatTnd(Number(v)), String(n)]}
                />
                <Area dataKey="captured" name="CA capté" stroke={palette.color(2)} strokeWidth={2.2} fill="url(#mobCaptured)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stations classiques bénéficiaires ({stationCapture.length})</CardTitle>
            <CardDescription>CA cumulé capté grâce aux orientations des TMP de l&apos;enseigne.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${SCROLLABLE}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Station</TableHead>
                    <TableHead className="text-right">Conversions</TableHead>
                    <TableHead className="text-right">CA capté</TableHead>
                    <TableHead className="pr-4">Part</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stationCapture.map(s => (
                    <TableRow key={s.stationCode}>
                      <TableCell className="pl-4">
                        <p className="max-w-52 truncate text-xs font-medium">{s.station}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{s.stationCode}</p>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{s.count}</TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">{formatTnd(s.amount)}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                            {fmtPct(Math.round((s.amount / maxAmount) * 100))}
                          </span>
                          <MiniBar pct={(s.amount / maxAmount) * 100} color={palette.color(1)} className="w-20" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top 12 des plus grosses conversions</CardTitle>
          <CardDescription>Montants unitaires les plus élevés réalisés en station suite à une orientation TMP.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Immat.</TableHead>
                  <TableHead>Motif de l&apos;orientation</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="pr-4 text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topConversions.map((c, i) => (
                  <TableRow key={`${c.plate}-${c.proposedAt}-${i}`}>
                    <TableCell className="pl-4 font-mono text-xs font-semibold tabular-nums">{c.plate}</TableCell>
                    <TableCell className="max-w-56"><span className="block truncate text-xs" title={c.reason}>{c.reason}</span></TableCell>
                    <TableCell>
                      <p className="max-w-52 truncate text-xs font-medium">{c.station}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{c.stationCode}</p>
                    </TableCell>
                    <TableCell className="text-xs">{dateFr(c.proposedAt)}</TableCell>
                    <TableCell className="pr-4 text-right text-xs font-bold tabular-nums">{formatTnd(c.amount)}</TableCell>
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
// Onglet 3 — ROI par TMP
// ---------------------------------------------------------------------------

function RoiTab({ hubs }: { hubs: HubDTO[] }) {
  const palette = useChartPalette()
  const TICK = { fontSize: 10, fill: palette.axis }
  const rows = useMemo(
    () => [...hubs].sort((a, b) => b.roiPct - a.roiPct).map(h => ({ code: h.code, name: h.name, roi: h.roiPct, ca30: h.ca30 })),
    [hubs],
  )
  const best = rows[0]
  const worst = rows[rows.length - 1]
  const above = rows.filter(r => r.roi >= 100).length
  const scatterData = useMemo(
    () => rows.map(r => ({ ca: r.ca30, roi: r.roi, code: r.code })),
    [rows],
  )

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi
          value={best ? best.code : '—'}
          label="Meilleur ROI"
          sub={best ? `${best.name} · ${fmtPct(best.roi)}` : undefined}
          icon={TrendingUp}
          tone="emerald"
        />
        <MobilityKpi
          value={worst && worst !== best ? worst.code : '—'}
          label="ROI le plus faible"
          sub={worst && worst !== best ? `${worst.name} · ${fmtPct(worst.roi)}` : undefined}
          icon={TrendingDown}
          tone="terracotta"
        />
        <MobilityKpi value={`${above}/${rows.length}`} label="TMP ≥ 100 %" sub="seuil de rentabilité annualisé" icon={Gauge} tone="amber" />
        <MobilityKpi value={fmtNum(rows.length)} label="TMP analysés" sub="exploitations actives" icon={Building2} tone="slate" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ROI annualisé par TMP</CardTitle>
            <CardDescription>
              (CA 30 j × 12) / investissement — la ligne pointillée marque le seuil de 100 %.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-80 w-full">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v} %`} />
                <YAxis type="category" dataKey="code" width={70} tick={{ ...TICK, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  cursor={{ fill: palette.cursor }}
                  formatter={(v, n, item) => {
                    const p = (item as { payload?: { name?: string } }).payload
                    return [fmtPct(Number(v)), p?.name ?? String(n)]
                  }}
                />
                <ReferenceLine x={100} stroke="#c2410c" strokeDasharray="4 3" label={{ value: 'Seuil 100 %', position: 'insideTopRight', fontSize: 10, fill: '#c2410c' }} />
                <Bar dataKey="roi" name="ROI" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {rows.map(r => (
                    <Cell key={r.code} fill={r.roi >= 100 ? palette.color(3) : r.roi >= 60 ? palette.color(2) : palette.color(4)} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">CA 30 j vs ROI — dispersion du réseau</CardTitle>
            <CardDescription>Chaque bulle est un TMP : le volume de CA (x) face au rendement (y).</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="aspect-auto h-80 w-full">
              <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis
                  type="number"
                  dataKey="ca"
                  name="CA 30 j"
                  tick={TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)} K`}
                />
                <YAxis
                  type="number"
                  dataKey="roi"
                  name="ROI"
                  tick={TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v} %`}
                />
                <ZAxis range={[60, 60]} />
                <ReferenceLine y={100} stroke="#c2410c" strokeDasharray="4 3" />
                <Tooltip
                  contentStyle={tooltipStyle()}
                  cursor={{ strokeDasharray: "3 3", stroke: palette.axisLine }}
                  formatter={(v, n) => [n === 'ROI' ? fmtPct(Number(v)) : formatTnd(Number(v)), String(n)]}
                  labelFormatter={() => ''}
                />
                <Scatter data={scatterData} fill={palette.color(1)} fillOpacity={0.75} />
              </ScatterChart>
            </ChartContainer>
            <HintNote>
              Un TMP à droite et en haut combine volume et rendement ; en haut à gauche, rendement élevé sur un petit
              volume (à développer) ; sous la ligne 100 %, la rentabilité annualisée ne couvre pas encore l&apos;investissement.
            </HintNote>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Onglet 4 — Comparatif entre franchisés (réseau national, 15 TMP)
// ---------------------------------------------------------------------------

const COMPARATIF_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'ca30', label: 'CA 30 j' },
  { key: 'services30', label: 'Prestations' },
  { key: 'conversions90', label: 'Conversions' },
  { key: 'conversionRate', label: 'Taux' },
  { key: 'roiPct', label: 'ROI' },
  { key: 'rating', label: 'Note' },
]

function ComparatifTab({ hubs, brandSlug, hubsLoading }: { hubs: HubDTO[]; brandSlug: string; hubsLoading: boolean }) {
  const palette = useChartPalette()
  const TICK = { fontSize: 10, fill: palette.axis }
  const [sortKey, setSortKey] = useState<SortKey>('ca30')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const ranked = useMemo(() => sortBy(hubs, sortKey, dir), [hubs, sortKey, dir])
  const selected = useMemo(
    () => hubs.find(h => h.id === selectedId) ?? hubs.find(h => h.brandSlug === brandSlug) ?? hubs[0] ?? null,
    [hubs, selectedId, brandSlug],
  )

  // Radar normalisé sur les maxima du réseau national
  const radarData = useMemo(() => {
    if (!selected || hubs.length === 0) return []
    const max = (fn: (h: HubDTO) => number) => Math.max(1, ...hubs.map(fn))
    const mCa = max(h => h.ca30)
    const mRoi = max(h => h.roiPct)
    const mVol = max(h => h.services30)
    return [
      { axis: 'CA', value: Math.round((selected.ca30 / mCa) * 100) },
      { axis: 'Taux conv.', value: selected.conversionRate },
      { axis: 'ROI', value: Math.round((selected.roiPct / mRoi) * 100) },
      { axis: 'Satisfaction', value: Math.round((selected.rating / 5) * 100) },
      { axis: 'Volume', value: Math.round((selected.services30 / mVol) * 100) },
    ]
  }, [selected, hubs])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortKey(key)
      setDir('desc')
    }
  }

  if (hubsLoading) return <MobilitySkeleton label="Chargement du comparatif réseau…" />

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Comparatif des franchisés — réseau national ({hubs.length} TMP)</CardTitle>
            <CardDescription>
              Toutes enseignes confondues. Les TMP {brandLabel(brandSlug)} sont surlignés ; triez par colonne puis
              sélectionnez un franchisé pour son profil radar.
            </CardDescription>
          </div>
          <Select value={selected?.id ?? ''} onValueChange={setSelectedId}>
            <SelectTrigger className="w-[280px]" aria-label="Sélectionner un franchisé">
              <SelectValue placeholder="Sélectionner un franchisé" />
            </SelectTrigger>
            <SelectContent>
              {hubs.map(h => (
                <SelectItem key={h.id} value={h.id}>
                  {h.code} — {h.franchisee}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">#</TableHead>
                  <TableHead>Franchisé</TableHead>
                  <TableHead>Enseigne</TableHead>
                  {COMPARATIF_COLUMNS.map(col => (
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
                  <TableHead className="pr-4 text-center">Radar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((h, i) => (
                  <TableRow key={h.id} className={h.brandSlug === brandSlug ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}>
                    <TableCell className="pl-4 text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <p className="max-w-48 truncate text-xs font-semibold">{h.franchisee}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{h.code} · {h.gouvernorat}</p>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: brandMarkerColor(h.brandSlug) }} aria-hidden />
                        {brandLabel(h.brandSlug)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums">{formatTnd(h.ca30)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtNum(h.services30)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{h.conversionsConfirmed90}/{h.conversions90}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtPct(h.conversionRate)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <span className={h.roiPct >= 100 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>{fmtPct(h.roiPct)}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtRating(h.rating)}</TableCell>
                    <TableCell className="pr-4 text-center">
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                        onClick={() => setSelectedId(h.id)}
                      >
                        {selected?.id === h.id ? '● affiché' : 'afficher'}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brandMarkerColor(selected.brandSlug) }} aria-hidden />
                Profil de {selected.franchisee}
                <Badge variant="outline" className="font-mono text-[10px]">{selected.code}</Badge>
              </CardTitle>
              <CardDescription>
                {selected.name} · {brandLabel(selected.brandSlug)} · axes normalisés 0-100 sur les maxima du réseau
                national (CA, taux de conversion, ROI, satisfaction, volume de prestations).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <ChartContainer config={{}} className="aspect-auto h-72 w-full">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke={palette.grid} />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: palette.axis }} />
                  <Tooltip contentStyle={tooltipStyle()} formatter={(v) => [`${fmtNum(Number(v))}/100`, 'Score']} />
                  <Radar dataKey="value" name={selected.franchisee} stroke={palette.color(1)} fill={palette.color(1)} fillOpacity={0.32} strokeWidth={2} />
                </RadarChart>
              </ChartContainer>
              <div className="grid content-start gap-2">
                {radarData.map(d => (
                  <div key={d.axis} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{d.axis}</span>
                    <MiniBar pct={d.value} color={palette.color(1)} />
                    <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">{d.value}/100</span>
                  </div>
                ))}
                <HintNote>
                  Lecture : 100/100 = meilleur franchisé du réseau national sur l&apos;axe. Satisfaction normalisée sur
                  la note maximale de 5 ; le taux de conversion est lu directement (pourcentage).
                </HintNote>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </>
  )
}
