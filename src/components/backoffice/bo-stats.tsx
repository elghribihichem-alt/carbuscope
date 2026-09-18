'use client'

// D.2.5 — Statistiques plateforme (enrichies, données réelles) :
// KPIs réelles, qualité des fiches, part de marché, contributions,
// modération, activité communauté, alertes, comptes et rapports.

import { useEffect, useMemo, useState } from "react"
import {
  Users, MessageSquarePlus, Target, CheckCircle2, Store, PieChart as PieIcon, BarChart3,
  ShieldAlert, TimerReset, FileBarChart2, Gauge, Quote,
} from "lucide-react"
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Line, ComposedChart, Area,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { KpiCard } from "@/components/shell/kpi-card"
import { CHART_PALETTE, AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import {
  CONTRIBUTION_TYPE_LABELS, ALERT_TYPE_LABELS,
  type ContributionDTO, type MarketShareRow, type PlatformStats,
} from "@/lib/types"
import { num, pct } from "@/components/settings/settings-shared"

const TYPE_SHORT: Record<string, string> = {
  CLOSED: "Fermée",
  SERVICE_UNAVAILABLE: "Service",
  PRICE_ABNORMAL: "Prix",
  PUMP_BROKEN: "Pompe",
  QUEUE: "File",
  CLEANLINESS: "Propreté",
}

const SEVERITY_META: Record<string, { label: string; color: string; cls: string }> = {
  CRITICAL: { label: "Critique", color: "#dc2626", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  MEDIUM: { label: "Moyenne", color: "#d97706", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  INFO: { label: "Info", color: "#64748b", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  NETWORK: "Réseau",
  COMMERCIAL: "Commercial",
  EXPANSION: "Expansion",
  VIEWER: "Lecture seule",
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  VALIDATED: "Validées",
  REJECTED: "Rejetées",
}

export function BoStats() {
  const [contributions, setContributions] = useState<ContributionDTO[] | null>(null)
  const [marketShare, setMarketShare] = useState<MarketShareRow[] | null>(null)
  const [platform, setPlatform] = useState<PlatformStats | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/contributions?limit=100", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { contributions?: ContributionDTO[] }) => { setContributions(j.contributions ?? []) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stats/market-share", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { data?: MarketShareRow[] }) => { setMarketShare(j.data ?? []) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stats/platform", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: PlatformStats) => { setPlatform(j) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  // Contributions reçues + répartition par type
  const byType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of contributions ?? []) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
    return [...counts.entries()].map(([type, value]) => ({
      type,
      label: TYPE_SHORT[type] ?? type,
      value,
    }))
  }, [contributions])

  const stationsSuivies = useMemo(
    () => (marketShare ?? []).reduce((acc, r) => acc + (r.stations || 0), 0),
    [marketShare]
  )

  const loading = contributions === null || marketShare === null
  const p = platform

  // Données dérivées qualité (pourcentages)
  const qualityRows = useMemo(() => {
    if (!p) return []
    const t = p.stations.total || 1
    return [
      { label: "Adresses renseignées", value: (p.stations.withAddress / t) * 100, hint: `${num(p.stations.withAddress)} / ${num(p.stations.total)} fiches` },
      { label: "Stations notées", value: (p.stations.rated / t) * 100, hint: `${num(p.stations.rated)} fiches avec avis` },
      { label: "Notoriété ≥ 3 avis", value: (p.stations.wellRated / t) * 100, hint: `${num(p.stations.wellRated)} fiches significatives` },
      { label: "Vérifiées < 90 jours", value: (p.stations.fresh / t) * 100, hint: `${num(p.stations.fresh)} fiches fraîches` },
      { label: "Ouvertes 24h/24 ou 7j/7", value: (p.stations.h24 / t) * 100, hint: `${num(p.stations.h24)} stations` },
    ]
  }, [p])

  // Entonnoir modération
  const moderationRows = useMemo(() => {
    if (!p) return []
    return (["PENDING", "VALIDATED", "REJECTED"] as const).map(status => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      count: p.moderation.byStatus[status] ?? 0,
    }))
  }, [p])

  // Alertes par type (libellés)
  const alertsByType = useMemo(() => {
    if (!p) return []
    return p.alerts.byType.map(a => ({ ...a, label: ALERT_TYPE_LABELS[a.type] ?? a.type }))
  }, [p])

  return (
    <div className="space-y-4">
      {/* ---------- KPIs plateforme (données réelles) ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Stations suivies"
          value={stationsSuivies > 0 ? num(stationsSuivies) : p ? num(p.stations.total) : "…"}
          icon={Store}
          tone="default"
          sub={p ? `${p.stations.avgServicesPerStation.toString().replace(".", ",")} services/fiche en moyenne` : undefined}
        />
        <KpiCard
          label="Avis clients"
          value={p ? num(p.reviews.total) : "…"}
          icon={Quote}
          tone="info"
          sub={p ? `Note moyenne plateforme : ${p.reviews.avgRating.toString().replace(".", ",")}/5` : undefined}
        />
        <KpiCard
          label="Contributeurs actifs"
          value={p ? num(p.reviews.distinctAuthors) : "…"}
          icon={Users}
          tone="default"
          sub={p ? `${num(p.moderation.total)} signalements déposés` : undefined}
        />
        <KpiCard
          label="Contributions"
          value={contributions ? num(contributions.length) : p ? num(p.moderation.total) : "…"}
          icon={MessageSquarePlus}
          tone="warning"
          sub={p ? `${p.moderation.byStatus.PENDING ?? 0} en attente de modération` : undefined}
        />
        <KpiCard
          label="Indice qualité données"
          value={p ? `${p.stations.qualityScore}/100` : "…"}
          icon={Target}
          tone="success"
          sub="Complétude · notoriété · fraîcheur"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Part de marché — doughnut */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="h-4 w-4 text-emerald-600" aria-hidden /> Part de marché par enseigne
            </CardTitle>
            <CardDescription>Répartition des stations actives (1 814 fiches, 6 enseignes + indépendants).</CardDescription>
          </CardHeader>
          <CardContent>
            {loading || !marketShare ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={marketShare}
                      dataKey="sharePct"
                      nameKey="brand"
                      innerRadius="52%"
                      outerRadius="78%"
                      paddingAngle={2}
                      stroke="var(--background)"
                      strokeWidth={2}
                    >
                      {marketShare.map(row => (
                        <Cell key={row.slug} fill={row.color || CHART_PALETTE[0]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      formatter={(value: number, name: string, entry: { payload?: MarketShareRow }) => [
                        `${pct(value)} · ${entry?.payload?.stations ?? 0} stations`,
                        name,
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contributions par type — bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-amber-600" aria-hidden /> Contributions par type
            </CardTitle>
            <CardDescription>
              {contributions ? `${contributions.length} signalements` : "Chargement…"} — tous statuts confondus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : byType.length === 0 ? (
              <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Aucune contribution enregistrée.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byType} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={AXIS_STYLE.tick}
                      stroke={AXIS_STYLE.stroke}
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle()}
                      cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                      formatter={(value: number, _name: string, entry: { payload?: { type: string } }) => [
                        `${value} signalement(s)`,
                        CONTRIBUTION_TYPE_LABELS[entry?.payload?.type ?? ""] ?? "Type",
                      ]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {byType.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Qualité des données ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Qualité des données du référentiel
          </CardTitle>
          <CardDescription>
            {p
              ? `Indice global ${p.stations.qualityScore}/100 — ${num(p.stations.servicesTotal)} services référencés sur ${num(p.stations.total)} fiches.`
              : "Chargement des indicateurs qualité…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!p ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              {/* Jauge qualité */}
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="relative h-36 w-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ name: "Qualité", value: p.stations.qualityScore }, { name: "Reste", value: 100 - p.stations.qualityScore }]}
                        dataKey="value"
                        innerRadius="66%"
                        outerRadius="88%"
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      >
                        <Cell fill="#059669" />
                        <Cell fill="var(--muted)" fillOpacity={0.35} />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                      {p.stations.qualityScore}
                    </span>
                    <span className="text-[11px] text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Complétude 30 pts · notoriété 25 pts<br />fraîcheur 25 pts · services 20 pts
                </p>
              </div>
              {/* Barres de progression */}
              <div className="space-y-3.5">
                {qualityRows.map(row => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{row.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        <span className="font-bold text-foreground">{Math.round(row.value * 10) / 10} %</span>
                        <span className="ms-1.5 hidden sm:inline">· {row.hint}</span>
                      </span>
                    </div>
                    <Progress value={row.value} className="h-2" aria-label={`${row.label} : ${Math.round(row.value)} %`} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Modération + activité communauté ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden /> Entonnoir de modération
            </CardTitle>
            <CardDescription>
              {p
                ? `${num(p.moderation.total)} contributions traitées ou en cours — taux de résolution ${p.moderation.resolutionRate.toString().replace(".", ",")} %.`
                : "Chargement…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!p ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <>
                <div className="space-y-2.5">
                  {moderationRows.map(row => {
                    const total = Math.max(1, p.moderation.total)
                    const share = (row.count / total) * 100
                    const color = row.status === "PENDING" ? "#d97706" : row.status === "VALIDATED" ? "#059669" : "#dc2626"
                    return (
                      <div key={row.status}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium">{row.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            <span className="font-bold text-foreground">{row.count}</span> ({Math.round(share)} %)
                          </span>
                        </div>
                        <div
                          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={`${row.label} : ${row.count}`}
                          aria-valuenow={Math.round(share)}
                          aria-valuemin={0}
                          aria-valuemax={100}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Top contributeurs (signalements)
                  </p>
                  <div className="space-y-1.5">
                    {p.moderation.topContributors.map((c, i) => (
                      <div key={c.author} className="flex items-center gap-2.5 rounded-lg border bg-muted/20 p-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          {i + 1}
                        </span>
                        <span className="flex-1 truncate text-sm font-medium">{c.author}</span>
                        <Badge variant="secondary" className="tabular-nums">{c.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-emerald-600" aria-hidden /> Activité de la communauté
            </CardTitle>
            <CardDescription>
              {p
                ? `${num(p.reviews.total)} avis publiés par ${num(p.reviews.distinctAuthors)} contributeurs — note moyenne ${p.reviews.avgRating.toString().replace(".", ",")}/5.`
                : "Chargement…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!p ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={p.reviews.trend} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                      <defs>
                        <linearGradient id="boReviewsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} />
                      <YAxis yAxisId="left" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} allowDecimals={false} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        formatter={(value: number, name: string) => [num(value), name === "reviews" ? "Avis" : "Auteurs actifs"]}
                      />
                      <Area yAxisId="left" type="monotone" dataKey="reviews" name="reviews" stroke="#059669" strokeWidth={2} fill="url(#boReviewsFill)" />
                      <Line yAxisId="right" type="monotone" dataKey="authors" name="authors" stroke="#d97706" strokeWidth={2} dot={{ r: 3, fill: "#d97706" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" aria-hidden /> Avis publiés (mois)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-600" aria-hidden /> Auteurs actifs
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Alertes + comptes & rapports ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-red-600" aria-hidden /> Alertes stratégiques actives
            </CardTitle>
            <CardDescription>
              {p ? `${num(p.alerts.total)} alertes suivies — répartition par gravité et par type.` : "Chargement…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!p ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(["CRITICAL", "MEDIUM", "INFO"] as const).map(sev => {
                    const meta = SEVERITY_META[sev]
                    const count = p.alerts.bySeverity[sev] ?? 0
                    return (
                      <Badge key={sev} variant="outline" className={`gap-1.5 px-2.5 py-1 ${meta.cls}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                        {meta.label} : <span className="font-bold tabular-nums">{count}</span>
                      </Badge>
                    )
                  })}
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={alertsByType} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 42 }}>
                      <CartesianGrid horizontal={false} stroke={GRID_STROKE} strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} tick={AXIS_STYLE.tick} stroke={AXIS_STYLE.stroke} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={tooltipStyle()}
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        formatter={(value: number) => [`${value} alerte(s)`, ""]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={13}>
                        {alertsByType.map((_, i) => (
                          <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileBarChart2 className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden /> Comptes plateforme &amp; rapports
            </CardTitle>
            <CardDescription>
              {p
                ? `${num(p.users.total)} comptes (${num(p.users.active)} actifs) — ${num(p.reports.total)} rapports générés.`
                : "Chargement…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!p ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comptes par rôle</p>
                  <div className="flex flex-wrap gap-2">
                    {p.users.byRole.map(u => (
                      <Badge key={u.role} variant="secondary" className="gap-1.5 px-2.5 py-1">
                        {ROLE_LABELS[u.role] ?? u.role} : <span className="font-bold tabular-nums">{u.count}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rapports</p>
                  <div className="flex flex-wrap gap-2">
                    {p.reports.byStatus.map(r => (
                      <Badge key={r.status} variant="outline" className="gap-1.5 px-2.5 py-1">
                        {r.status === "GENERATED" ? "Générés" : r.status} : <span className="font-bold tabular-nums">{r.count}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <TimerReset className="mx-auto h-4 w-4 text-amber-600" aria-hidden />
                    <p className="mt-1 text-lg font-bold tabular-nums leading-none">{p.moderation.byStatus.PENDING ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground">modérations en attente</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <MessageSquarePlus className="mx-auto h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
                    <p className="mt-1 text-lg font-bold tabular-nums leading-none">{num(p.stations.servicesTotal)}</p>
                    <p className="text-[11px] text-muted-foreground">services référencés</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-hidden />
                    <p className="mt-1 text-lg font-bold tabular-nums leading-none">{Math.round((p.stations.wellRated / (p.stations.total || 1)) * 100)} %</p>
                    <p className="text-[11px] text-muted-foreground">fiches ≥ 3 avis</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
