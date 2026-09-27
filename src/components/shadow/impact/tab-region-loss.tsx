'use client'

// Shadow Market — Analyse d'Impact, onglet « 📉 Perte par Région » (T44-d).
// Agrégation par gouvernorat (BarChart horizontal top 12 + tableau complet
// triable) et comparatif entre enseignes (barres à la couleur de l'enseigne,
// part du préjudice national), cartes totales.

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Fuel, Layers, Users } from "lucide-react"
import { useAppStore } from "@/store/app-store"
import type { ShadowGovLossDTO, ShadowLevel, ShadowRegionImpactResponse } from "@/lib/types"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import {
  LEVEL_COLORS, SHADOW_COLORS, SectionHeader, ShadowKpiCard, formatLJ, formatTnd,
} from "../shadow-shared"
import { TipRow, TipShell } from "./impact-shared"

type SortKey = "points" | "volumeLJ" | "lossTnd" | "stationsThreatened" | "gouvernorat"
type SortDir = "asc" | "desc"

const LEVEL_LABELS: Record<ShadowLevel, string> = { RED: "Critique", ORANGE: "Modéré", YELLOW: "Vigilance", GREEN: "Calme" }

export function TabRegionLoss() {
  const session = useAppStore((s) => s.session)
  const brandSlug = useAppStore((s) => s.brandSlug)
  const isSuperAdmin = session?.role === "SUPER_ADMIN"
  // Mise en avant : l'enseigne connectée (périmètre BRAND) ; en vision
  // nationale, la lentille de la Super Administration ne force aucun surlignage.
  const highlightedBrand = isSuperAdmin ? null : (session?.brandSlug ?? brandSlug)

  const [data, setData] = useState<ShadowRegionImpactResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>("lossTnd")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/impact/region", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<ShadowRegionImpactResponse>
      })
      .then((json) => {
        setData(json)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  const govSorted = useMemo(() => {
    if (data === null) return []
    const list = [...data.gouvernorats]
    const mul = sortDir === "asc" ? 1 : -1
    list.sort((a, b) => {
      if (sortKey === "gouvernorat") return a.gouvernorat.localeCompare(b.gouvernorat, "fr") * mul
      return (a[sortKey] - b[sortKey]) * mul
    })
    return list
  }, [data, sortKey, sortDir])

  const top12 = useMemo(() => govSorted.slice(0, 12), [govSorted])

  const brandsSorted = useMemo(() => {
    if (data === null) return []
    return [...data.brands].sort((a, b) => b.lossTnd - a.lossTnd)
  }, [data])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "gouvernorat" ? "asc" : "desc")
    }
  }

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }
  if (data === null) {
    return <TabSkeleton title="Agrégation des pertes par région…" />
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="📉"
        title="Perte par région"
        description="Agrégation des pertes par gouvernorat et comparatif entre enseignes — qui porte le préjudice du marché parallèle."
      />

      {/* Cartes totales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ShadowKpiCard value={num(data.total.points)} label="Points actifs" sub="recensés nationalement" tone="yellow" icon={Users} />
        <ShadowKpiCard value={formatTnd(data.total.lossTnd)} label="Perte nationale" sub="marge grignotée / mois" tone="red" icon={Layers} />
        <ShadowKpiCard value={num(data.total.stationsThreatened)} label="Stations menacées" sub="≥ 5 000 DT/mois de perte" tone="orange" icon={Fuel} />
        <ShadowKpiCard value={formatLJ(data.total.volumeLJ)} label="Volume parallèle" sub="litres/jour écoulés" tone="orange" icon={Fuel} />
      </div>

      {/* Classement gouvernorats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top 12 des gouvernorats les plus impactés</CardTitle>
          <p className="text-xs text-muted-foreground">Perte mensuelle estimée — la couleur suit le niveau de menace.</p>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top12} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)} K DT`}
                />
                <YAxis
                  type="category"
                  dataKey="gouvernorat"
                  width={86}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as ShadowGovLossDTO | undefined
                    if (!row) return null
                    return (
                      <TipShell title={row.gouvernorat}>
                        <TipRow label="Perte / mois" value={formatTnd(row.lossTnd)} color={LEVEL_COLORS[row.level]} />
                        <TipRow label="Points" value={num(row.points)} />
                        <TipRow label="Volume" value={formatLJ(row.volumeLJ)} />
                        <TipRow label="Stations menacées" value={num(row.stationsThreatened)} />
                      </TipShell>
                    )
                  }}
                />
                <Bar dataKey="lossTnd" name="Perte" barSize={14} radius={[0, 4, 4, 0]}>
                  {top12.map((g) => (
                    <Cell key={g.gouvernorat} fill={LEVEL_COLORS[g.level] ?? SHADOW_COLORS.gray} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tableau complet triable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tous les gouvernorats ({govSorted.length})</CardTitle>
          <p className="text-xs text-muted-foreground">Cliquez sur un en-tête pour trier.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortTh label="Gouvernorat" k="gouvernorat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortTh label="Points" k="points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                  <SortTh label="Volume" k="volumeLJ" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                  <SortTh label="Perte / mois" k="lossTnd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                  <SortTh label="Stations menacées" k="stationsThreatened" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                  <TableHead>Niveau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {govSorted.map((g) => (
                  <TableRow key={g.gouvernorat}>
                    <TableCell className="pl-4 text-xs font-medium">{g.gouvernorat}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{num(g.points)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatLJ(g.volumeLJ)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums" style={{ color: "#E53935" }}>
                      {formatTnd(g.lossTnd)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{num(g.stationsThreatened)}</TableCell>
                    <TableCell>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: LEVEL_COLORS[g.level] ?? SHADOW_COLORS.gray }}
                      >
                        {LEVEL_LABELS[g.level] ?? g.level}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Comparatif enseignes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4" aria-hidden /> Comparatif entre enseignes
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Perte mensuelle par enseigne{highlightedBrand ? " — votre enseigne est encadrée" : ""}.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brandsSorted} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="brandName"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  interval={0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)} K DT`}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as (typeof brandsSorted)[number] | undefined
                    if (!row) return null
                    return (
                      <TipShell title={row.brandName}>
                        <TipRow label="Perte / mois" value={formatTnd(row.lossTnd)} color={row.brandColor} />
                        <TipRow label="Part du préjudice" value={`${row.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`} />
                        <TipRow label="Stations menacées" value={num(row.stationsThreatened)} />
                        <TipRow label="Points proches" value={num(row.points)} />
                      </TipShell>
                    )
                  }}
                />
                <Bar dataKey="lossTnd" name="Perte" barSize={38} radius={[4, 4, 0, 0]}>
                  {brandsSorted.map((b) => (
                    <Cell
                      key={b.brandSlug}
                      fill={b.brandColor}
                      stroke={highlightedBrand === b.brandSlug ? "var(--foreground)" : undefined}
                      strokeWidth={highlightedBrand === b.brandSlug ? 2.5 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Enseigne</TableHead>
                <TableHead className="text-right">Perte / mois</TableHead>
                <TableHead className="text-right">Part du préjudice</TableHead>
                <TableHead className="text-right">Stations menacées</TableHead>
                <TableHead className="pr-4 text-right">Points proches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandsSorted.map((b) => (
                <TableRow
                  key={b.brandSlug}
                  className={cn(highlightedBrand === b.brandSlug && "bg-stone-50 font-medium dark:bg-stone-900")}
                >
                  <TableCell className="pl-4">
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.brandColor }} aria-hidden />
                      {b.brandName}
                      {highlightedBrand === b.brandSlug ? (
                        <span className="rounded-full bg-stone-900 px-1.5 py-0.5 text-[9px] font-semibold text-white dark:bg-stone-100 dark:text-stone-900">
                          vous
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums" style={{ color: "#E53935" }}>
                    {formatTnd(b.lossTnd)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {b.sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{num(b.stationsThreatened)}</TableCell>
                  <TableCell className="pr-4 text-right text-xs tabular-nums">{num(b.points)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Lecture : la perte est la marge perdue par les stations officielles au profit des points informels —
        elle est attribuée aux enseignes dont les stations sont les plus proches (plafond de 3 stations par point).
        Le volume parallèle {formatLJ(data.total.volumeLJ)} représente l&apos;écoulement informel quotidien estimé.
      </p>
    </div>
  )
}

function SortTh({
  label, k, sortKey, sortDir, onSort, className,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sortKey === k
  return (
    <TableHead className={cn("whitespace-nowrap", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Trier par ${label}`}
      >
        {label}
        {active
          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />}
      </button>
    </TableHead>
  )
}
