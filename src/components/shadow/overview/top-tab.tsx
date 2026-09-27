"use client"

// Shadow Market (T44-c) — onglet « 🏆 Top 10 Menaces » : podium 1-2-3 (médailles)
// + tableau des 10 stations/zones les plus impactées + raccourci cartographie.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ShadowOverviewResponse } from "@/lib/types"
import {
  ShadowLevelBadge, formatTnd, formatLJ, SHADOW_COLORS,
} from "@/components/shadow/shadow-shared"
import { Map, Trophy } from "lucide-react"

const MEDALS = ["🥇", "🥈", "🥉"]

export function TopTab({ data, onNavigate }: { data: ShadowOverviewResponse; onNavigate?: (section: string) => void }) {
  const top = data.topThreats

  return (
    <div className="space-y-4">
      {/* ---------- Podium 1-2-3 ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {top.slice(0, 3).map((s, i) => (
          <Card
            key={s.code}
            className={`relative overflow-hidden border-stone-200/80 ${i === 0 ? "sm:-mt-2 sm:shadow-md" : ""} dark:border-stone-800`}
          >
            <span
              className="absolute inset-x-0 top-0 h-1"
              style={{ backgroundColor: i === 0 ? SHADOW_COLORS.red : i === 1 ? SHADOW_COLORS.orange : SHADOW_COLORS.yellow }}
              aria-hidden
            />
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none" role="img" aria-label={`Rang ${i + 1}`}>{MEDALS[i]}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-stone-900 dark:text-stone-50">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                    <span className="truncate">{s.name}</span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.brandName} · {s.delegation}, {s.gouvernorat}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                {formatTnd(s.lossTnd)}
                <span className="ml-1 text-xs font-medium text-muted-foreground">/mois</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <ShadowLevelBadge level={s.level} />
                <Badge variant="outline" className="text-[10px] tabular-nums">{s.points} points</Badge>
                <Badge variant="outline" className="text-[10px] tabular-nums">{formatLJ(s.volumeStolenLJ)}</Badge>
                {s.worstDistanceM != null && (
                  <Badge variant="outline" className="text-[10px] tabular-nums text-[#E53935]">
                    le + proche : {Math.round(s.worstDistanceM)} m
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---------- Tableau des 10 menaces ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden />
                Classement des 10 menaces
              </CardTitle>
              <CardDescription>
                Stations les plus impactées par la concurrence informelle — perte mensuelle, volume capté et niveau de menace
              </CardDescription>
            </div>
            {onNavigate && (
              <Button size="sm" className="h-9 shrink-0 gap-1.5" style={{ backgroundColor: SHADOW_COLORS.red, borderColor: SHADOW_COLORS.red }} onClick={() => onNavigate("cartography")}>
                <Map className="h-3.5 w-3.5" aria-hidden />
                Voir sur la carte
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">Rang</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead>Gouvernorat</TableHead>
                  <TableHead className="text-right">Points actifs</TableHead>
                  <TableHead className="text-right">Volume volé</TableHead>
                  <TableHead className="text-right">Perte / mois</TableHead>
                  <TableHead className="text-right">Niveau</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((s, i) => (
                  <TableRow key={s.code} className={i < 3 ? "bg-[#E53935]/4" : undefined}>
                    <TableCell className="text-center text-xs font-bold tabular-nums text-muted-foreground">
                      {i < 3 ? MEDALS[i] : i + 1}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                        <span className="font-medium">{s.name}</span>
                        <span className="hidden text-[11px] text-muted-foreground sm:inline">{s.brandName}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.gouvernorat}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.points}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatLJ(s.volumeStolenLJ)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(s.lossTnd)}</TableCell>
                    <TableCell className="text-right">
                      <ShadowLevelBadge level={s.level} loss={s.lossTnd} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Perte cumulée du top 10 :{" "}
            <strong className="text-foreground">{formatTnd(top.reduce((s, x) => s + x.lossTnd, 0))}</strong> par mois — soit{" "}
            {Math.round((top.reduce((s, x) => s + x.lossTnd, 0) / Math.max(data.kpis.estLossTnd, 1)) * 100)} % de la perte
            nationale estimée.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
