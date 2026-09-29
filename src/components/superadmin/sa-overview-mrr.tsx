'use client'

// Super Administration — Vue d'ensemble : carte « MRR — 6 derniers mois »
// (T52-R1). Série REELLE reconstruite côté serveur (/api/super/overview,
// champ mrrHistory) à partir des contrats SaaS actifs et de leurs dates de
// souscription — aucun montant fabriqué. AreaChart discret, palette
// émeraude/teal (aucun bleu), tooltip et grille thémés (tokens CSS).

import { useMemo } from "react"
import { Banknote, TrendingDown, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts"
import { fmtDT } from "@/lib/saas"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle } from "@/lib/chart"
import { cn } from "@/lib/utils"

const FMT_MOIS = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" })

/** « 2026-04 » → « avr. 26 ». */
function moisCourt(mois: string): string {
  const [y, m] = mois.split("-").map(Number)
  return FMT_MOIS.format(new Date(y, m - 1, 1))
}

/** « 6 630 » (axe Y compact, milliers DT). */
const fmtAxe = (v: number): string => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v)

export function SaOverviewMrr({ history }: { history: { mois: string; mrr: number }[] }) {
  const data = useMemo(
    () => history.map(h => ({ mois: moisCourt(h.mois), mrr: h.mrr })),
    [history],
  )

  const courant = history.at(-1)?.mrr ?? 0
  const precedent = history.at(-2)?.mrr
  const variation = precedent !== undefined ? courant - precedent : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            MRR — 6 derniers mois
          </span>
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums" aria-label={`MRR courant ${fmtDT(courant)}`}>
              {fmtDT(courant)}
            </span>
            {variation !== null && variation !== 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-0.5 text-[10px] tabular-nums",
                  variation > 0
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                    : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
                )}
              >
                {variation > 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
                {variation > 0 ? "+" : ""}
                {fmtDT(Math.abs(variation))}
              </Badge>
            )}
            {variation === 0 && (
              <Badge variant="outline" className="text-[10px]">stable</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Historique insuffisant pour tracer la tendance — il apparaîtra dès le second mois de vie du portefeuille.
          </p>
        ) : (
          <div className="h-40 w-full" role="img" aria-label={`Courbe du MRR sur six mois, actuellement ${fmtDT(courant)} par mois`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="saMrrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="mois"
                  tick={{ ...AXIS_STYLE.tick, fontSize: 10 }}
                  stroke={AXIS_STYLE.stroke}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ ...AXIS_STYLE.tick, fontSize: 10 }}
                  stroke={AXIS_STYLE.stroke}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={fmtAxe}
                />
                <RTooltip
                  contentStyle={tooltipStyle()}
                  cursor={{ stroke: "#0d9488", strokeOpacity: 0.35 }}
                  formatter={(value: number | string) => [fmtDT(Number(value)), "MRR"]}
                  labelFormatter={(label: string) => `Mois : ${label}`}
                />
                <Area
                  dataKey="mrr"
                  name="MRR"
                  stroke="#0d9488"
                  strokeWidth={2}
                  fill="url(#saMrrFill)"
                  isAnimationActive={false}
                  dot={{ r: 2.5, fill: "#0d9488", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "#0f766e", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Reconstruction fidèle depuis les souscriptions actives (essais et contrats résiliés exclus).
        </p>
      </CardContent>
    </Card>
  )
}
