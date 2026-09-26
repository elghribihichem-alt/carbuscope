"use client"

// Super Administration — ⑦ Analytics SaaS : la santé économique de CarbuScope
// vue éditeur. MRR / ARR / ARPE / churn, série 12 mois (facturé vs encaissé),
// répartition du revenu par enseigne, cohortes fondatrices, usage réel des
// modules et définitions honnêtes (pédagogie financière).
// Données : GET /api/super/analytics — montants en MILLIMES (1 DT = 1 000).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, LabelList,
} from "recharts"
import { tooltipStyle, num, pct } from "@/lib/chart"
import { useChartPalette } from "@/hooks/use-chart-palette"
import {
  formatDT, formatDTCourt, formatInt, formatMois, type AnalyticsResponse,
} from "@/lib/sa-types"
import {
  TrendingUp, Target, Sigma, Users, ShieldCheck, MapPin, Banknote, Clock, AlertTriangle,
  RefreshCw, ClipboardList, FileText, Bell, MessageSquareText, Users2, PlugZap, Calculator,
  Radar, Activity, ArrowUp, ArrowDown, Minus, Info, PieChart as PieIcon, Layers, BookOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Couleurs métier (T41 phase 6) : thémées via useChartPalette — mrr = identité
// SA color(4), facturé = color(1), encaissé = color(3). Jamais bleu statique.
// ---------------------------------------------------------------------------
function useSaColors() {
  const palette = useChartPalette()
  return {
    palette,
    C: {
      mrr: palette.color(4),
      facture: palette.color(1),
      encaisse: palette.color(3),
      cohorte: palette.color(4),
    },
  }
}

const LEGEND = { fontSize: 11, paddingTop: 8 }

/** "2026-09" → "sept. 26" (axe X condensé). */
function moisCourt(mois: string): string {
  const [y, m] = mois.split("-").map(Number)
  const s = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(y, m - 1, 1))
  return `${s.replace(".", "")}. ${String(y).slice(2)}`
}

/** Icône (sensée) par module d'usage, avec repli neutre. */
const USAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  veille_terrain: ClipboardList,
  rapports: FileText,
  notifications: Bell,
  avis: MessageSquareText,
  contributions: Users2,
  api: PlugZap,
  calculs: Calculator,
  watchlist: Radar,
}

const TENDANCE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  hausse: { label: "en hausse", icon: ArrowUp, cls: "text-emerald-600 dark:text-emerald-400" },
  stable: { label: "stable", icon: Minus, cls: "text-slate-500 dark:text-slate-400" },
  baisse: { label: "en baisse", icon: ArrowDown, cls: "text-red-600 dark:text-red-400" },
}

// ---------------------------------------------------------------------------
// Chargement / erreur / squelettes communs
// ---------------------------------------------------------------------------
function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement des analytics SaaS">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={`k1-${i}`} className="h-24 w-full" />)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`k2-${i}`} className="h-24 w-full" />)}
      </div>
      <Skeleton className="h-96 w-full" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
        <div>
          <p className="font-semibold">Impossible de charger les analytics SaaS</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réessayer
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Graphique principal : MRR (ligne identité SA) + facturé/encaissé (aires thémées)
// ---------------------------------------------------------------------------
function SerieMrrChart({ data }: { data: AnalyticsResponse["serie"] }) {
  const { palette, C } = useSaColors()
  const TICK = { fontSize: 11, fill: palette.axis }
  const rows = useMemo(
    () => data.map(s => ({
      mois: s.mois,
      label: moisCourt(s.mois),
      "CA facturé TTC": s.factureMillimes,
      "CA encaissé TTC": s.encaisseMillimes,
      "MRR abonnements": s.mrrMillimes,
    })),
    [data],
  )
  const moisParLabel = useMemo(
    () => Object.fromEntries(rows.map(r => [r.label, r.mois])),
    [rows],
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
          Revenu récurrent et encaissements — 12 mois
        </CardTitle>
        <CardDescription>
          MRR de fin de mois (abonnements actifs mensualisés) face au CA facturé et réellement
          encaissé TTC. Les pics facturation correspondent aux adhésions (6 000 DT) et
          anniversaires annuels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="h-80"
          role="img"
          aria-label="Évolution sur 12 mois du MRR, du CA facturé TTC et du CA encaissé TTC"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradFacture" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.facture} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={C.facture} stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="gradEncaisse" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.encaisse} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={C.encaisse} stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
              <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis
                tick={TICK}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v: number) => `${num(v / 1_000_000)} k DT`}
              />
              <Tooltip
                contentStyle={tooltipStyle()}
                cursor={{ stroke: palette.axisLine }}
                labelFormatter={(l) => formatMois(moisParLabel[String(l)] ?? String(l))}
                formatter={(v, n) => [formatDTCourt(Number(v)), String(n)]}
              />
              <Legend wrapperStyle={LEGEND} iconType="circle" iconSize={8} />
              <Area
                type="monotone"
                dataKey="CA facturé TTC"
                stroke={C.facture}
                strokeWidth={1.5}
                fill="url(#gradFacture)"
                activeDot={{ r: 3 }}
              />
              <Area
                type="monotone"
                dataKey="CA encaissé TTC"
                stroke={C.encaisse}
                strokeWidth={1.5}
                fill="url(#gradEncaisse)"
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="MRR abonnements"
                stroke={C.mrr}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Axe Y en milliers de dinars (k DT). MRR = revenu mensualisé des abonnements actifs à
          la fin du mois ; le CA facturé comprend l&apos;adhésion et les annuels, d&apos;où
          l&apos;écart avec le MRR.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Répartition du MRR par client : donut + tableau DataViews (barre de part)
// ---------------------------------------------------------------------------
function RepartitionClients({ data }: { data: AnalyticsResponse["revenusParClient"] }) {
  const { palette } = useSaColors()
  const rows = useMemo(
    () => data.map((r, i) => ({
      ...r,
      couleur: palette.color(i + 1),
      nomComplet: `${r.nomClient} — ${pct(r.partPct)}`,
    })),
    [data, palette],
  )
  const totalMrr = useMemo(() => data.reduce((s, r) => s + r.mrrMillimes, 0), [data])

  const columns: DataViewColumn<(typeof rows)[number]>[] = [
    {
      key: "client", header: "Enseigne", sortValue: (r) => r.nomClient,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: r.couleur }}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-tight">{r.nomClient}</span>
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{r.brandSlug}</span>
          </span>
        </span>
      ),
    },
    {
      key: "mrr", header: "MRR", align: "right", sortValue: (r) => r.mrrMillimes,
      render: (r) => <span className="text-sm font-semibold tabular-nums">{formatDTCourt(r.mrrMillimes)}</span>,
    },
    {
      key: "part", header: "Part du MRR", sortValue: (r) => r.partPct,
      render: (r) => (
        <span className="flex items-center justify-end gap-2">
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.min(r.partPct, 100)}%`, backgroundColor: r.couleur }}
            />
          </span>
          <span className="w-14 text-right text-xs font-medium tabular-nums">{pct(r.partPct)}</span>
        </span>
      ),
    },
    {
      key: "encaisse12m", header: "Encaissé 12 mois (TTC)", align: "right", sortValue: (r) => r.encaisse12mTtcMillimes,
      render: (r) => <span className="text-sm tabular-nums text-emerald-700 dark:text-emerald-400">{formatDTCourt(r.encaisse12mTtcMillimes)}</span>,
    },
    {
      key: "retards", header: "Retards", align: "center", sortValue: (r) => r.facturesEnRetard,
      render: (r) => r.facturesEnRetard > 0 ? (
        <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {formatInt(r.facturesEnRetard)} en retard
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">à jour</span>
      ),
    },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="min-w-0 lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieIcon className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
            Répartition du MRR
          </CardTitle>
          <CardDescription>Part de chaque enseigne dans le revenu récurrent mensuel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative h-64" role="img" aria-label="Répartition du MRR par enseigne en anneau">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="mrrMillimes"
                  nameKey="nomComplet"
                  innerRadius="58%"
                  outerRadius="88%"
                  paddingAngle={2}
                  strokeWidth={1}
                  stroke="var(--background)"
                >
                  {rows.map(r => <Cell key={r.brandSlug} fill={r.couleur} />)}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle()}
                  formatter={(v) => [formatDT(Number(v)), "MRR"] as [string, string]}
                />
                <Legend wrapperStyle={LEGEND} iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">MRR total</span>
              <span className="text-base font-bold tabular-nums">{formatDTCourt(totalMrr)}</span>
              <span className="text-[10px] text-muted-foreground">{formatInt(data.length)} enseignes</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Concentration à surveiller : Agil pèse environ un tiers du MRR — la croissance
            viendra des 4 autres enseignes et du prospect.
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-3">
        <CardHeader>
          <CardTitle>Revenu par enseigne</CardTitle>
          <CardDescription>
            MRR courant, part du total, encaissé TTC sur 12 mois et incidents de paiement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="sa-revenus-clients"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.brandSlug}
            maxHeightClassName="max-h-96"
            emptyMessage="Aucun client actif — MRR nul."
            renderCard={(r) => (
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.couleur }} aria-hidden />
                        {r.nomClient}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{r.brandSlug}</p>
                    </div>
                    <span className="text-base font-bold tabular-nums">{formatDTCourt(r.mrrMillimes)}</span>
                  </div>
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(r.partPct, 100)}%`, backgroundColor: r.couleur }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Part du MRR</span>
                      <span className="font-medium tabular-nums">{pct(r.partPct)}</span>
                    </div>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Encaissé 12 mois TTC</span>
                    <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatDTCourt(r.encaisse12mTtcMillimes)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Factures</span>
                    {r.facturesEnRetard > 0 ? (
                      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                        {formatInt(r.facturesEnRetard)} en retard
                      </Badge>
                    ) : (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">à jour</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cohortes de signature : barres horizontales + MRR total en étiquette
// ---------------------------------------------------------------------------
function CohortesChart({ data }: { data: AnalyticsResponse["cohortes"] }) {
  const { palette, C } = useSaColors()
  const TICK = { fontSize: 11, fill: palette.axis }
  const rows = useMemo(
    () => data.map(c => ({
      ...c,
      label: `${formatInt(c.nb)} client${c.nb > 1 ? "s" : ""} · ${formatDTCourt(c.mrrMillimes)} de MRR`,
    })),
    [data],
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
          Cohortes de signature
        </CardTitle>
        <CardDescription>
          Clients regroupés par trimestre de signature du contrat, avec le MRR qu&apos;ils
          apportent aujourd&apos;hui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-52" role="img" aria-label="Nombre de clients et MRR par cohorte de signature">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 140, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={palette.grid} />
              <XAxis type="number" hide domain={[0, (dMax: number) => dMax + 0.5]} />
              <YAxis type="category" dataKey="libelle" tick={TICK} axisLine={false} tickLine={false} width={64} />
              <Tooltip
                contentStyle={tooltipStyle()}
                cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
                formatter={(v, n) => (n === "nb" ? [`${formatInt(Number(v))} client(s)`, "Clients"] : [String(v), String(n)])}
              />
              <Bar dataKey="nb" fill={C.cohorte} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="label" position="right" className="fill-muted-foreground text-[11px]" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          <strong>0 résiliation à ce jour</strong> — les cohortes fondatrices (T4 2025 → T2 2026)
          sont toutes actives : churn de 0 % sur les 6 clients signés, prospect non inclus.
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Usage réel par module : grille de cartes avec tendance
// ---------------------------------------------------------------------------
function UsageGrid({ data }: { data: AnalyticsResponse["usageModules"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
          Usage réel des modules
        </CardTitle>
        <CardDescription>
          Compteurs réels (base de données) sur les modules vendus — mesure la valeur perçue
          par les enseignes et nourrit la conversation de renouvellement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.map(m => {
            const Icon = USAGE_ICONS[m.module] ?? Activity
            const t = TENDANCE_META[m.tendance] ?? TENDANCE_META.stable
            const TrendIcon = t.icon
            return (
              <Card key={m.module} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400">
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", t.cls)}>
                      <TrendIcon className="h-3.5 w-3.5" aria-hidden />
                      {t.label}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums leading-none">{formatInt(m.valeur)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{m.unite}</p>
                  <p className="mt-2 min-h-[2.2rem] text-xs font-medium leading-snug">{m.libelle}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Les valeurs reflètent l&apos;activité des 30 derniers jours. Un module peu utilisé à
          J-60 du renouvellement est un signal commercial à traiter en amont.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Encart pédagogique : définitions honnêtes des indicateurs
// ---------------------------------------------------------------------------
function DefinitionsCard({ k }: { k: AnalyticsResponse["kpis"] }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
          Comment lire ces indicateurs
        </CardTitle>
        <CardDescription>
          Définitions exactes — pas de vanity metrics. Destiné aux nouveaux membres de
          l&apos;équipe CarbuScope.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-xs leading-relaxed text-muted-foreground">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-foreground">MRR (revenu récurrent mensuel)</dt>
            <dd className="mt-0.5">
              Somme des abonnements actifs mensualisés : 564 mensuels à 40 DT + les annuels
              (400 DT) ramenés au mois. Ne comprend ni l&apos;adhésion (one-shot 6 000 DT),
              ni la TVA.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">ARR (revenu annuel récurrent)</dt>
            <dd className="mt-0.5">MRR × 12 ({formatDTCourt(k.arrMillimes)}) — projection si
              rien ne change : ni gain, ni perte de client.</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">ARPE (revenu moyen par enseigne)</dt>
            <dd className="mt-0.5">MRR ÷ clients actifs = {formatDTCourt(k.arpeMillimes)}.
              À comparer au mix « petites/grosses enseignes » du portefeuille.</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Churn &amp; rétention</dt>
            <dd className="mt-0.5">Churn = résiliés ÷ (actifs + résiliés) sur la période =
              {" "}{pct(k.churnPct)} ; rétention = {pct(k.tauxRetentionPct)}. Aucune résiliation
              depuis le lancement.</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Facturé vs encaissé</dt>
            <dd className="mt-0.5">Le CA facturé TTC compte les factures émises (payées +
              en attente) ; l&apos;encaissé ne retient que les paiements reçus. L&apos;écart =
              trésorerie à suivre (onglet Facturation).</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">En retard</dt>
            <dd className="mt-0.5">Factures dépassant l&apos;échéance (délai paramétrable,
              30 j par défaut) — relances manuelles depuis la Facturation.</dd>
          </div>
        </dl>
        <Separator className="my-3" />
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Montants hors TVA pour le MRR/ARR/ARPE ; TTC pour l&apos;encaissé et le facturé.
          Tout est stocké en millimes (1 DT = 1 000) et formaté en dinars.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Export PDF du rapport — document A4 autonome dans une iframe (srcdoc).
// Zéro collision avec l'impression facture (#facture-print + globals.css) :
// l'iframe embarque ses PROPRES styles (préfixe rp-*, aucune classe partagée)
// et le CSS print de la page parente ne s'y applique pas.
// ---------------------------------------------------------------------------

/** Échappe une donnée dynamique avant insertion dans le srcdoc HTML. */
function ech(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Construit le « Rapport d'activité éditeur » : document HTML complet (A4,
 * noir sur blanc, marque CarbuScope SAS en émeraude #059669, en-têtes de
 * section en petites capitales grises, tableaux au filet gris clair) à partir
 * de l'état chargé du module. Fonction pure, testable avec un
 * AnalyticsResponse figé. Formats identiques au module : formatDTCourt pour
 * la synthèse KPI, formatDT (virgule FR) dans les tableaux, pct pour les
 * pourcentages. Compteurs de page omis : Chrome ne supporte pas les
 * margin-boxes @page (compteurs CSS non fiables).
 */
function construireRapportHtml(donnees: AnalyticsResponse, editeLe: Date = new Date()): string {
  const k = donnees.kpis
  const serie = donnees.serie
  const clients = [...donnees.revenusParClient].sort((a, b) => b.mrrMillimes - a.mrrMillimes)
  const totalMrr = clients.reduce((s, c) => s + c.mrrMillimes, 0)
  const totalEncaisse12m = clients.reduce((s, c) => s + c.encaisse12mTtcMillimes, 0)
  const nbRetards = clients.reduce((s, c) => s + c.facturesEnRetard, 0)

  const dateLongue = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(editeLe)
  const dateCourte = new Intl.DateTimeFormat("fr-FR").format(editeLe)
  const periodeDe = serie.length > 0 ? formatMois(serie[0].mois) : "—"
  const periodeA = serie.length > 0 ? formatMois(serie[serie.length - 1].mois) : "—"

  // Faits dérivés des données pour la « Lecture du trimestre » — rien d'inventé.
  const mrrFin = serie.length > 0 ? serie[serie.length - 1].mrrMillimes : 0
  const mrrDebutTrimestre = serie.length >= 4 ? serie[serie.length - 4].mrrMillimes : mrrFin
  const deltaTrimestre = mrrFin - mrrDebutTrimestre
  const evolTrimestre =
    mrrDebutTrimestre > 0 ? pct(Math.round((deltaTrimestre / mrrDebutTrimestre) * 1000) / 10) : null
  let meilleureProgression: { mois: string; delta: number } | null = null
  for (let i = 1; i < serie.length; i++) {
    // On écarte le passage 0 → premier mois non nul (initialisation du
    // portefeuille, pas une progression) : seul compte un vrai gain MoM.
    const d = serie[i].mrrMillimes - serie[i - 1].mrrMillimes
    if (d > 0 && serie[i - 1].mrrMillimes > 0 && (meilleureProgression === null || d > meilleureProgression.delta)) {
      meilleureProgression = { mois: serie[i].mois, delta: d }
    }
  }
  const retardataires = clients.filter(c => c.facturesEnRetard > 0)

  const phraseEvol =
    deltaTrimestre === 0
      ? `Sur les trois derniers mois de la période, le MRR est resté stable à ${formatDTCourt(mrrFin)}`
      : `Sur les trois derniers mois de la période, le MRR est passé de ${formatDTCourt(mrrDebutTrimestre)} à ${formatDTCourt(mrrFin)} (${deltaTrimestre > 0 ? "+" : "-"}${evolTrimestre ?? "n.a."})`
  const phraseProgression = meilleureProgression
    ? `La plus forte progression mensuelle a été enregistrée en ${formatMois(meilleureProgression.mois)} : +${formatDTCourt(meilleureProgression.delta)} de MRR d'un mois sur l'autre`
    : "Aucune progression mensuelle du MRR n'a été enregistrée sur la période couverte"
  const phraseContributeur =
    clients.length > 0
      ? `${clients[0].nomClient} demeure le principal contributeur du revenu récurrent avec ${pct(clients[0].partPct)} du MRR (${formatDTCourt(clients[0].mrrMillimes)} sur ${formatDTCourt(totalMrr)})`
      : "Aucun client actif : le MRR est nul sur la période"
  const phraseRetards =
    k.enRetardTtcMillimes > 0 || nbRetards > 0
      ? `Côté recouvrement, ${formatDT(k.enRetardTtcMillimes)} TTC restent en retard (${formatInt(nbRetards)} facture${nbRetards > 1 ? "s" : ""}${retardataires.length > 0 ? ` — ${retardataires.map(c => c.nomClient).join(", ")}` : ""}) : relance conseillée depuis la Facturation`
      : "Côté recouvrement, aucune facture en retard : le portefeuille est intégralement à jour"

  // Bloc 2 colonnes — libellés FR exacts des KpiCard du module.
  const kpiCell = (libelle: string, valeur: string, sousTexte: string) =>
    `<td><span class="rp-lib">${ech(libelle)}</span><span class="rp-val">${ech(valeur)}</span><span class="rp-sub">${ech(sousTexte)}</span></td>`
  const kpis = [
    kpiCell("MRR — revenu récurrent mensuel", formatDTCourt(k.mrrMillimes), "hors TVA — abonnements actifs mensualisés"),
    kpiCell("ARR — annualisé", formatDTCourt(k.arrMillimes), "MRR × 12 — projection à portefeuille constant"),
    kpiCell("ARPE — revenu moyen / enseigne", formatDTCourt(k.arpeMillimes), `MRR ÷ ${k.clientsActifs} clients actifs`),
    kpiCell("Churn / rétention", pct(k.churnPct), `rétention de ${pct(k.tauxRetentionPct)}`),
    kpiCell("Clients actifs", formatInt(k.clientsActifs), `${formatInt(k.stationsSouscrites)} stations souscrites`),
    kpiCell("Prospect en cycle de vente", formatInt(k.prospects), "pipeline commercial en cours"),
  ]
  const blocKpis = `<tr>${kpis[0]}${kpis[1]}</tr><tr>${kpis[2]}${kpis[3]}</tr><tr>${kpis[4]}${kpis[5]}</tr>`

  // Série 12 mois — mêmes données que le graphique (3 métriques de la shape).
  const lignesSerie = serie
    .map(
      s =>
        `<tr><td>${ech(formatMois(s.mois))}</td><td class="rp-num">${ech(formatDT(s.factureMillimes))}</td><td class="rp-num">${ech(formatDT(s.encaisseMillimes))}</td><td class="rp-num">${ech(formatDT(s.mrrMillimes))}</td></tr>`,
    )
    .join("")

  // Répartition par enseigne — mêmes colonnes que le DataViews du module.
  const lignesClients = clients
    .map(
      c =>
        `<tr><td><span class="rp-nom">${ech(c.nomClient)}</span><span class="rp-slug">${ech(c.brandSlug)}</span></td><td class="rp-num">${ech(formatDT(c.mrrMillimes))}</td><td class="rp-num">${ech(pct(c.partPct))}</td><td class="rp-num">${ech(formatDT(c.encaisse12mTtcMillimes))}</td><td>${c.facturesEnRetard > 0 ? `${ech(formatInt(c.facturesEnRetard))} en retard` : "à jour"}</td></tr>`,
    )
    .join("")
  const ligneTotal = `<tr class="rp-total"><td>Total — ${ech(formatInt(clients.length))} enseigne${clients.length > 1 ? "s" : ""}</td><td class="rp-num">${ech(formatDT(totalMrr))}</td><td class="rp-num">100&nbsp;%</td><td class="rp-num">${ech(formatDT(totalEncaisse12m))}</td><td>${nbRetards > 0 ? `${ech(formatInt(nbRetards))} en retard` : "à jour"}</td></tr>`

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport CarbuScope</title>
<style>
  @page { size: A4; margin: 14mm }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0 }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.5; color: #0f172a; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .rp-entete { margin: 0 }
  .rp-marque { margin: 0; color: #059669; font-size: 17pt; font-weight: 700; letter-spacing: 0.02em }
  .rp-soustitre { margin: 1.5mm 0 0; font-size: 11.5pt; font-weight: 600; color: #0f172a }
  .rp-meta { margin: 1mm 0 0; font-size: 9pt; color: #64748b }
  .rp-filet { margin: 4mm 0 0; border: 0; border-top: 1.5pt solid #059669 }
  .rp-section { margin: 6mm 0 0 }
  .rp-titre { margin: 0 0 2.5mm; font-size: 9pt; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.14em }
  .rp-kpis { width: 100%; border-collapse: collapse }
  .rp-kpis td { width: 50%; padding: 2mm 0; border-bottom: 0.5pt solid #e2e8f0; vertical-align: top }
  .rp-kpis td:first-child { padding-right: 6mm }
  .rp-lib { display: block; font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.07em }
  .rp-val { display: block; margin-top: 0.5mm; font-size: 12.5pt; font-weight: 700; color: #0f172a }
  .rp-sub { display: block; margin-top: 0.5mm; font-size: 8pt; color: #64748b }
  .rp-table { width: 100%; border-collapse: collapse; font-size: 9pt }
  .rp-table th { padding: 1.6mm 2mm; border-bottom: 1pt solid #94a3b8; text-align: left; font-size: 7.5pt; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.07em }
  .rp-table td { padding: 1.5mm 2mm; border-bottom: 0.5pt solid #e2e8f0 }
  .rp-table th.rp-num, .rp-table td.rp-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums }
  .rp-table tr { page-break-inside: avoid }
  .rp-total td { border-top: 1pt solid #94a3b8; border-bottom: 0; font-weight: 700 }
  .rp-nom { display: block; font-weight: 600 }
  .rp-slug { display: block; font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em }
  .rp-note { margin: 2mm 0 0; font-size: 8pt; color: #64748b }
  .rp-lecture { margin: 6mm 0 0; padding: 3.5mm 4.5mm; border: 0.75pt solid #cbd5e1; border-left: 2.5pt solid #059669; background: #f8fafc; page-break-inside: avoid }
  .rp-lecture-titre { margin: 0; font-size: 9pt; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 0.14em }
  .rp-lecture p { margin: 1.5mm 0 0; font-size: 9.5pt }
  .rp-pied { margin: 8mm 0 0; padding-top: 2.5mm; border-top: 0.5pt solid #cbd5e1; text-align: center; font-size: 8pt; color: #64748b }
  .rp-pied strong { color: #059669 }
</style>
</head>
<body>
  <header class="rp-entete">
    <p class="rp-marque">CarbuScope SAS</p>
    <p class="rp-soustitre">Rapport d'activité éditeur — Super Administration</p>
    <p class="rp-meta">Édité le ${ech(dateLongue)} · Période couverte : ${ech(periodeDe)} – ${ech(periodeA)}</p>
  </header>
  <hr class="rp-filet">
  <section class="rp-section">
    <h2 class="rp-titre">Synthèse des indicateurs</h2>
    <table class="rp-kpis">${blocKpis}</table>
  </section>
  <section class="rp-section">
    <h2 class="rp-titre">Revenu récurrent et encaissements — 12 mois</h2>
    <table class="rp-table">
      <thead><tr><th>Mois</th><th class="rp-num">CA facturé TTC</th><th class="rp-num">CA encaissé TTC</th><th class="rp-num">MRR abonnements</th></tr></thead>
      <tbody>${lignesSerie}</tbody>
    </table>
    <p class="rp-note">MRR de fin de mois (abonnements actifs mensualisés, hors TVA) ; CA facturé et encaissé en TTC — mêmes données que le graphique du module.</p>
  </section>
  <section class="rp-section">
    <h2 class="rp-titre">Répartition du revenu par enseigne</h2>
    <table class="rp-table">
      <thead><tr><th>Enseigne</th><th class="rp-num">MRR</th><th class="rp-num">Part du MRR</th><th class="rp-num">Encaissé 12 mois (TTC)</th><th>Retards</th></tr></thead>
      <tbody>${lignesClients}${ligneTotal}</tbody>
    </table>
  </section>
  <aside class="rp-lecture">
    <h3 class="rp-lecture-titre">Lecture du trimestre</h3>
    <p>${ech(phraseEvol)}.</p>
    <p>${ech(phraseProgression)}.</p>
    <p>${ech(phraseContributeur)}.</p>
    <p>${ech(phraseRetards)}.</p>
  </aside>
  <footer class="rp-pied">
    Document généré par <strong>CarbuScope</strong> — plateforme de démonstration · Données au ${ech(dateCourte)}
  </footer>
</body>
</html>`
}

/**
 * Ouvre la boîte d'impression du navigateur sur un document HTML autonome
 * monté dans une iframe hors écran (srcdoc). Imprimante → « Enregistrer au
 * format PDF » produit le rapport A4. Aucune collision avec l'impression
 * facture : le CSS print de la page ne s'applique pas dans l'iframe et
 * l'iframe est retirée du DOM après fermeture réelle du dialogue
 * (afterprint), avec garde-fou 60 s — en headless print() est un no-op,
 * l'iframe reste alors montée pour la QA.
 */
function ouvrirRapportImpression(html: string): void {
  const iframe = document.createElement("iframe")
  iframe.title = "Rapport d'activité CarbuScope (impression)"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;background:#fff"
  iframe.srcdoc = html
  let nettoye = false
  let garde: number | undefined
  const nettoyer = () => {
    if (nettoye) return
    nettoye = true
    window.clearTimeout(garde)
    iframe.remove()
  }
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      // Environnement sans dialogue d'impression (headless) : la garde
      // temporelle ci-dessous nettoie — l'iframe reste entre-temps pour la QA.
    }
    try {
      iframe.contentWindow?.addEventListener("afterprint", nettoyer, { once: true })
    } catch {
      // afterprint indisponible : la garde temporelle nettoie l'iframe.
    }
    // Garde-fou 60 s : print() peut être un no-op (headless), on laisse
    // l'iframe montée le temps de la QA puis on la retire du DOM.
    garde = window.setTimeout(nettoyer, 60_000)
  }
  document.body.appendChild(iframe)
}

// ---------------------------------------------------------------------------
// Module ⑦ — Analytics SaaS
// ---------------------------------------------------------------------------
export function SaAnalytics() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [majLe, setMajLe] = useState<string>("")

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/super/analytics", { signal })
      if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`)
      const j = (await r.json()) as AnalyticsResponse
      setData(j)
      setMajLe(new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()))
      setLoading(false)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setError((e as Error).message || "Erreur inconnue")
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void load(ac.signal)
    return () => ac.abort()
  }, [load, refreshKey])

  const retry = useCallback(() => setRefreshKey(k => k + 1), [])

  // Export PDF : document A4 autonome (iframe srcdoc) → boîte d'impression.
  const exporterRapport = useCallback(() => {
    if (!data) return
    ouvrirRapportImpression(construireRapportHtml(data))
  }, [data])

  if (error) return <ErrorCard message={error} onRetry={retry} />
  if (loading && !data) return <AnalyticsSkeleton />
  if (!data) return null

  const k = data.kpis

  return (
    <div className="space-y-4">
      {/* En-tête du module */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" aria-hidden />
            Analytics SaaS
            <Badge variant="outline" className="ml-1 border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
              éditeur
            </Badge>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilotage économique de CarbuScope : revenu récurrent, encaissements, concentration
            et usage réel — {data.revenusParClient.length} enseignes actives, {formatInt(k.stationsSouscrites)}{" "}
            stations souscrites.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {majLe && (
              <span className="hidden text-xs text-muted-foreground sm:inline">calculé à {majLe}</span>
            )}
            <Button size="sm" variant="outline" onClick={retry} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              Recalculer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exporterRapport}
              disabled={loading || !data}
              className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
              title="Ouvrir la boîte d'impression — choisir « Enregistrer au format PDF »"
              aria-label="Exporter le rapport d'activité analytics en PDF : ouvre la boîte d'impression du navigateur, choisir « Enregistrer au format PDF »"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Exporter le rapport (PDF)
            </Button>
          </div>
          <p className="max-w-[18rem] text-right text-[11px] leading-snug text-muted-foreground">
            Le PDF est généré par votre navigateur (boîte d&apos;impression → « Enregistrer au
            format PDF ») — mise en page A4 optimisée.
          </p>
        </div>
      </header>

      {/* Rangée 1 — santé récurrente */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="MRR — revenu récurrent mensuel"
          value={formatDTCourt(k.mrrMillimes)}
          icon={TrendingUp}
          tone="info"
          sub="564 mensuels × 40 DT + 72 annuels proratisés"
          trend={k.croissanceMrrPct !== null ? { value: Math.round(k.croissanceMrrPct * 10) / 10, label: " % vs mois précédent" } : undefined}
        />
        <KpiCard
          label="ARR — annualisé"
          value={formatDTCourt(k.arrMillimes)}
          icon={Target}
          tone="success"
          sub="MRR × 12 — projection à portefeuille constant"
        />
        <KpiCard
          label="ARPE — revenu moyen / enseigne"
          value={formatDTCourt(k.arpeMillimes)}
          icon={Sigma}
          tone="default"
          sub={`MRR ÷ ${k.clientsActifs} clients actifs`}
        />
        <KpiCard
          label="Clients actifs"
          value={formatInt(k.clientsActifs)}
          icon={Users}
          tone="default"
          sub={`+ ${k.prospects} prospect en cycle de vente`}
        />
        <KpiCard
          label="Churn / rétention"
          value={pct(k.churnPct)}
          icon={ShieldCheck}
          tone="success"
          sub={`Rétention de ${pct(k.tauxRetentionPct)} — aucune résiliation`}
        />
        <KpiCard
          label="Stations souscrites"
          value={formatInt(k.stationsSouscrites)}
          icon={MapPin}
          tone="info"
          sub="564 mensuelles · 72 annuelles"
        />
      </div>

      {/* Rangée 2 — caisse du mois */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Encaissé ce mois (TTC)"
          value={formatDTCourt(k.encaisseMoisTtcMillimes)}
          icon={Banknote}
          tone="success"
          sub="Paiements reçus sur le mois en cours"
        />
        <KpiCard
          label="En attente d'encaissement (TTC)"
          value={formatDTCourt(k.enAttenteTtcMillimes)}
          icon={Clock}
          tone="info"
          sub="Factures émises non réglées à ce jour"
        />
        <KpiCard
          label="En retard (TTC)"
          value={formatDTCourt(k.enRetardTtcMillimes)}
          icon={AlertTriangle}
          tone="danger"
          sub="Dépassement d'échéance — relance conseillée"
        />
      </div>

      {/* Graphique principal */}
      <SerieMrrChart data={data.serie} />

      {/* Répartition par client */}
      <section aria-label="Répartition du revenu par enseigne">
        <RepartitionClients data={data.revenusParClient} />
      </section>

      {/* Cohortes + usage */}
      <div className="grid gap-4 xl:grid-cols-2">
        <CohortesChart data={data.cohortes} />
        <UsageGrid data={data.usageModules} />
      </div>

      {/* Pédagogie financière */}
      <DefinitionsCard k={k} />

      <p className="text-right text-[11px] text-muted-foreground">
        Source : /api/super/analytics — agrégations Prisma sur contrats, abonnements et
        factures réels. Dernier recalcul : {majLe ? `${majLe}` : "—"}.
      </p>
    </div>
  )
}
