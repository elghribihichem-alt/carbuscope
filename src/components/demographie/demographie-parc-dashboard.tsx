'use client'

// CarbuScope — Module Démographie (T45, mission 2) : mini-tableau de bord
// « Parc automobile » affiché en tête du volet Délégations de la Super
// Administration. Sommes nationales par catégorie (sur les délégations
// renseignées), top 5 des délégations par parc et répartition en camembert
// Recharts (palette thémée useChartPalette — aucun bleu).

import { useMemo } from "react"
import { Car, Info, PieChart as PieIcon, TrendingUp } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { VEHICLE_CATEGORIES, type DemographicDelegationDTO } from "@/lib/saas"
import { useChartPalette } from "@/hooks/use-chart-palette"

const fmtInt = (v: number) => new Intl.NumberFormat("fr-FR").format(v)

const fleetTotal = (d: DemographicDelegationDTO) =>
  VEHICLE_CATEGORIES.reduce((s, v) => s + ((d as unknown as Record<string, number | null>)[v.key] ?? 0), 0)

export function DemographieParcDashboard({ delegations }: { delegations: DemographicDelegationDTO[] }) {
  const palette = useChartPalette()

  const stats = useMemo(() => {
    const sums = VEHICLE_CATEGORIES.map(c => ({
      key: c.key,
      label: c.label,
      value: delegations.reduce((s, d) => s + ((d as unknown as Record<string, number | null>)[c.key] ?? 0), 0),
    }))
    const total = sums.reduce((s, x) => s + x.value, 0)
    const filled = delegations.filter(d => fleetTotal(d) > 0)
    const top5 = [...filled]
      .sort((a, b) => fleetTotal(b) - fleetTotal(a))
      .slice(0, 5)
      .map(d => ({ label: `${d.delegation} (${d.gouvernorat})`, value: fleetTotal(d) }))
    return { sums, total, filledCount: filled.length, top5 }
  }, [delegations])

  const chartData = stats.sums.filter(s => s.value > 0).map((s, i) => ({ ...s, fill: palette.color(i + 1) }))
  const hasData = stats.total > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-4 w-4 text-emerald-600" aria-hidden /> Parc automobile — vue nationale
        </CardTitle>
        <CardDescription>
          Sommes des {stats.filledCount} délégations renseignées ({delegations.length - stats.filledCount} restent à
          alimenter via l&apos;import en masse), top 5 des délégations et répartition par catégorie.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 py-8 text-center text-muted-foreground">
            <PieIcon className="h-7 w-7 opacity-40" aria-hidden />
            <p className="max-w-md text-sm leading-relaxed">
              Aucune catégorie du parc n&apos;est encore renseignée par délégation — utilisez le bouton
              « Modèle véhicules » puis « Importer » pour alimenter les chiffres en masse.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* KPI par catégorie */}
            <div className="space-y-2">
              <div className="rounded-lg border bg-emerald-50/60 p-3 dark:bg-emerald-950/30">
                <p className="text-[11px] font-medium text-muted-foreground">Parc total (délégations renseignées)</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmtInt(stats.total)} <span className="text-sm font-semibold">véh.</span>
                </p>
              </div>
              {stats.sums.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette.color(i + 1) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs">{s.label}</span>
                  <span className="font-mono text-xs tabular-nums font-semibold">{fmtInt(s.value)}</span>
                  <span className="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground/70">
                    {stats.total > 0 ? `${((s.value / stats.total) * 100).toFixed(1).replace(".", ",")} %` : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Camembert de répartition */}
            <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/20 p-3">
              <div className="h-48 w-full" role="img" aria-label={`Camembert du parc automobile : total ${fmtInt(stats.total)} véhicules`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {chartData.map(entry => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${fmtInt(value)} véh.`, name]}
                      contentStyle={{ borderRadius: "0.625rem", fontSize: "11px", border: "1px solid var(--border)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                Répartition du parc ({fmtInt(stats.total)} véh. cumulés)
              </p>
            </div>

            {/* Top 5 délégations */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Top 5 délégations par parc
              </p>
              {stats.top5.map((t, i) => {
                const max = stats.top5[0]?.value ?? 1
                return (
                  <div key={t.label} className="flex items-center gap-2.5">
                    <span className="w-5 shrink-0 text-right text-[11px] font-bold text-muted-foreground">{i + 1}.</span>
                    <div className="relative h-6 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className="h-full rounded-md bg-amber-500/80"
                        style={{ width: `${Math.max((t.value / max) * 100, 4)}%` }}
                        aria-hidden
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center truncate text-[11px] font-medium" title={t.label}>
                        <span className="truncate">{t.label}</span>
                      </span>
                      <span className="absolute inset-y-0 right-2 flex items-center font-mono text-[10px] tabular-nums">
                        {fmtInt(t.value)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {stats.top5.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Aucune délégation renseignée pour le classement.</p>
              )}
              <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                Le parc par délégation s&apos;alimente par import en masse (JSON, CSV, XLS, XML) — le modèle
                « Modèle véhicules » donne le format attendu.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
