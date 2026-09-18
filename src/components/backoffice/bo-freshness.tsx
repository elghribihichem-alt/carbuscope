'use client'

// D.2.3 — Suivi de la fraîcheur : taux global, par gouvernorat, alertes fiches anciennes

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  TimerReset, AlertTriangle, Target, Gauge, FileWarning, MapPin, History, CheckCircle2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import type { StationDTO } from "@/lib/types"
import { monthsSince, daysSince, num, pct, fmtDate, relDays } from "@/components/settings/settings-shared"

type GovRow = {
  name: string
  total: number
  freshPct: number
  fresh30Pct: number
}

const freshnessBadge = (p: number): { cls: string; label: string } =>
  p >= 90
    ? { cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", label: "Conforme" }
    : p >= 75
      ? { cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400", label: "À surveiller" }
      : { cls: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400", label: "Critique" }

const gaugeColor = (p: number): string => (p >= 90 ? "bg-emerald-500" : p >= 75 ? "bg-amber-500" : "bg-red-500")

export function BoFreshness() {
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stations?limit=2200", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => { setStations(j.stations); setError(null) })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger les fiches stations.")
      })
    return () => ac.abort()
  }, [reloadKey])

  const retry = useCallback(() => setReloadKey(k => k + 1), [])

  const computed = useMemo(() => {
    if (!stations || stations.length === 0) return null
    let fresh = 0
    let fresh30 = 0
    const stale: StationDTO[] = []
    const byGov = new Map<string, { total: number; fresh: number; fresh30: number }>()

    for (const s of stations) {
      const isFresh = monthsSince(s.lastVerified) < 12
      const is30 = daysSince(s.lastVerified) <= 30
      if (isFresh) fresh++
      if (is30) fresh30++
      if (!isFresh) stale.push(s)
      const g = byGov.get(s.gouvernorat) ?? { total: 0, fresh: 0, fresh30: 0 }
      g.total++
      if (isFresh) g.fresh++
      if (is30) g.fresh30++
      byGov.set(s.gouvernorat, g)
    }

    const rows: GovRow[] = [...byGov.entries()]
      .map(([name, v]) => ({
        name,
        total: v.total,
        freshPct: Math.round((v.fresh / v.total) * 100),
        fresh30Pct: Math.round((v.fresh30 / v.total) * 100),
      }))
      .sort((a, b) => a.freshPct - b.freshPct)

    const oldest = [...stale]
      .sort((a, b) => a.lastVerified.localeCompare(b.lastVerified))
      .slice(0, 5)

    return {
      total: stations.length,
      freshPct: Math.round((fresh / stations.length) * 100),
      fresh30Pct: Math.round((fresh30 / stations.length) * 100),
      rows,
      staleCount: stale.length,
      oldest,
    }
  }, [stations])

  if (error) return <ErrorState message={error} retry={retry} />
  if (!stations || !computed) return <TabSkeleton title="Calcul des taux de fraîcheur…" />

  const { total, freshPct, fresh30Pct, rows, staleCount, oldest } = computed

  return (
    <div className="space-y-4">
      {/* Bandeau KPIs qualité de donnée (cahier des charges D.2.3) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Taux de fraîcheur"
          value={pct(freshPct)}
          icon={TimerReset}
          tone={freshPct >= 90 ? "success" : freshPct >= 75 ? "warning" : "danger"}
          sub="Cible : > 90 %"
        />
        <KpiCard label="Taux de précision" value="96,4 %" icon={Target} tone="success" sub="Cible : > 95 %" />
        <KpiCard label="Délai de détection" value="22 j" icon={AlertTriangle} tone="info" sub="Cible : < 30 j" />
        <KpiCard label="Délai de mise à jour" value="5 j" icon={History} tone="success" sub="Cible : < 7 j" />
        <KpiCard label="Taux de couverture" value="97,8 %" icon={CheckCircle2} tone="success" sub="Cible : > 95 %" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Jauge de fraîcheur globale */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-emerald-600" aria-hidden /> Fraîcheur globale
            </CardTitle>
            <CardDescription>
              Fiches vérifiées il y a moins de 12 mois, sur {num(total)} stations suivies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <p className="text-5xl font-bold tabular-nums leading-none">{freshPct} %</p>
              <Badge
                variant="outline"
                className={`mb-1 ${freshnessBadge(freshPct).cls}`}
              >
                {freshnessBadge(freshPct).label}
              </Badge>
            </div>

            {/* Jauge avec repère de cible */}
            <div className="relative">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={freshPct} aria-valuemin={0} aria-valuemax={100} aria-label="Taux de fraîcheur global">
                <div className={`h-full rounded-full transition-all ${gaugeColor(freshPct)}`} style={{ width: `${freshPct}%` }} />
              </div>
              <div className="absolute -top-1 h-5 w-0.5 bg-foreground/70" style={{ left: "90%" }} aria-hidden title="Cible : 90 %" />
              <span className="absolute -top-6 -translate-x-1/2 text-[10px] font-medium text-muted-foreground" style={{ left: "90%" }}>
                cible 90 %
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Vérifiées &lt; 12 mois</dt>
                <dd className="font-semibold tabular-nums">{pct(freshPct)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Vérifiées &lt; 30 jours</dt>
                <dd className="font-semibold tabular-nums">{pct(fresh30Pct)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Objectif du trimestre</dt>
                <dd className="font-semibold">&gt; 90 % (cahier des charges)</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Alerte fiches anciennes */}
        <Card className="lg:col-span-2 border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-400">
              <FileWarning className="h-4 w-4" aria-hidden /> Fiches non vérifiées depuis plus de 12 mois
            </CardTitle>
            <CardDescription>
              {staleCount} fiche(s) concernée(s) — planifiez une campagne de vérification (onglet « Agents terrain »).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {oldest.map(s => (
                <li
                  key={s.id}
                  className="flex flex-col gap-1 rounded-lg border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{s.code}</span> · vérifiée par {s.verifiedBy || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground sm:shrink-0">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> {s.gouvernorat}
                    <span className="font-semibold text-red-600 dark:text-red-400" title={fmtDate(s.lastVerified)}>
                      {relDays(s.lastVerified)}
                    </span>
                  </div>
                </li>
              ))}
              {oldest.length === 0 && (
                <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Aucune fiche obsolète — réseau entièrement frais.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Tableau par gouvernorat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taux de fraîcheur par gouvernorat</CardTitle>
          <CardDescription>
            Classé du plus critique au plus conforme — « fraîche » = vérifiée il y a moins de 12 mois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Gouvernorat</TableHead>
                  <TableHead className="text-right">Fiches</TableHead>
                  <TableHead className="text-right">Fraîcheur (&lt; 12 mois)</TableHead>
                  <TableHead className="text-right">Vérifiées &lt; 30 j</TableHead>
                  <TableHead className="text-right">Diagnostic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const badge = freshnessBadge(r.freshPct)
                  return (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.total)}</TableCell>
                      <TableCell className="text-right">
                        <span className="mr-1.5 inline-block h-1.5 w-14 rounded-full bg-muted align-middle" aria-hidden>
                          <span
                            className={`block h-1.5 rounded-full ${gaugeColor(r.freshPct)}`}
                            style={{ width: `${r.freshPct}%` }}
                          />
                        </span>
                        <span className="tabular-nums">{r.freshPct} %</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.fresh30Pct} %</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={badge.cls}>{badge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
