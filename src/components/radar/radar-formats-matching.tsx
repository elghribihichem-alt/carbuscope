'use client'

// T55-B3-a — Formats > « matching » : le moteur de règles format ↔ zone.
// Règle V1 100 % transparente (affichée par zone sous forme de chips de
// justification) : CLASSIQUE si score ≥ 60 et TMJ ≥ 25 000 · EXPRESS si
// score ≥ 45 et (TMJ ≥ 8 000 ou zone blanche/sous-équipée) · MOBILITY_HUB
// sinon. Table des 24 zones triées par score, filtre par format, vue
// nested par format, détail en Sheet réutilisé (ZoneDetailSheet) avec CTA
// « Voir l'aperçu de ce format » → sous-onglet apercu.

import { useMemo, useState } from "react"
import { ChevronRight, GitCompare, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { PalierBadge, ScoreBar } from "@/components/implantation/implantation-shared"
import type { PalierKey } from "@/components/implantation/implantation-shared"
import { num } from "@/lib/chart"
import type { RadarZoneDTO } from "@/lib/radar-scoring"
import { ZoneDetailSheet } from "./radar-zone-sheet"
import { SectionHeader } from "./radar-shared"
import {
  FORMAT_KEYS, FORMAT_META, FORMAT_RULE, FormatBadge, recommendFormat,
  type FormatKey, type FormatReco,
} from "./radar-formats-engine"

interface MatchRow {
  zone: RadarZoneDTO
  reco: FormatReco
}

type MatchFilter = "TOUS" | FormatKey

const FILTER_LABELS: Record<MatchFilter, string> = {
  TOUS: "Tous",
  CLASSIQUE: "Classique",
  EXPRESS: "Express",
  MOBILITY_HUB: "Hub",
}

/** Ordre d'affichage des groupes (vue nested) et des filtres. */
const FORMAT_RANK: Record<FormatKey, number> = { CLASSIQUE: 0, EXPRESS: 1, MOBILITY_HUB: 2 }

export function FormatsMatching({
  zones, onOpenApercu, onOpenRoi,
}: {
  zones: RadarZoneDTO[]
  onOpenApercu: (zone: RadarZoneDTO) => void
  onOpenRoi: (zone: RadarZoneDTO) => void
}) {
  const [filter, setFilter] = useState<MatchFilter>("TOUS")
  const [selected, setSelected] = useState<MatchRow | null>(null)

  // Recommandation calculée une fois pour les 24 zones (dérivable, transparent).
  const rows = useMemo<MatchRow[]>(
    () => zones.map(z => ({ zone: z, reco: recommendFormat(z) })),
    [zones],
  )

  const filtered = useMemo(
    () => (filter === "TOUS" ? rows : rows.filter(r => r.reco.format === filter)),
    [rows, filter],
  )

  // KPIs — répartition des 3 formats + zone la mieux scorée de chaque format.
  const byFormat = useMemo(() => {
    const out = {} as Record<FormatKey, MatchRow[]>
    for (const f of FORMAT_KEYS) out[f] = rows.filter(r => r.reco.format === f)
    return out
  }, [rows])

  const kpiTone = (f: FormatKey): "warning" | "success" | "info" =>
    f === "CLASSIQUE" ? "warning" : f === "EXPRESS" ? "success" : "info"

  const rankOf = (z: RadarZoneDTO): number => zones.findIndex(q => q.gouvernorat === z.gouvernorat) + 1

  // Bloc CTA du Sheet : recommandation du moteur + passerelles formats.
  const sheetActions = (row: MatchRow) => {
    const m = FORMAT_META[row.reco.format]
    const RecoIcon = m.icon
    return (
      <>
        {/* Bloc recommandation du moteur pour la zone ouverte */}
        <div className={`rounded-lg border p-3 ${m.card}`}>
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Format recommandé
            <FormatBadge format={row.reco.format} className="bg-background/80" />
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Règle V1 : {row.reco.rule}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {row.reco.reasons.map(reason => (
              <Badge key={reason} variant="outline" className="h-5 bg-background/70 px-1.5 text-[10px] font-normal">
                {reason}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between"
          onClick={() => { onOpenApercu(row.zone); setSelected(null) }}
        >
          <span className="flex items-center gap-2">
            <RecoIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Voir l&apos;aperçu de ce format
          </span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between"
          onClick={() => { onOpenRoi(row.zone); setSelected(null) }}
        >
          <span className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Comparatif ROI de cette zone
          </span>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </>
    )
  }

  /* ---------- Colonnes ---------- */
  const columns: DataViewColumn<MatchRow>[] = [
    {
      key: "gouvernorat", header: "Gouvernorat",
      sortValue: r => r.zone.gouvernorat,
      render: r => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.zone.gouvernorat}</p>
          <p className="text-[11px] text-muted-foreground">
            {num(r.zone.stationsTotal)} stations · {num(r.zone.delegations.length)} délégations
          </p>
        </div>
      ),
    },
    {
      key: "palier", header: "Palier",
      sortValue: r => r.zone.palier,
      render: r => <PalierBadge palier={r.zone.palier as PalierKey} />,
    },
    {
      key: "score", header: "Score", align: "right",
      sortValue: r => r.zone.score,
      render: r => (
        <span className="inline-flex w-24 justify-end gap-2">
          <ScoreBar value={r.zone.score} color="#059669" className="w-14" />
          <span className="tabular-nums text-xs font-semibold">{r.zone.score}</span>
        </span>
      ),
    },
    {
      key: "tmj", header: "TMJ", align: "right",
      sortValue: r => r.zone.tmj,
      render: r => (
        <span className="text-xs tabular-nums">
          {r.zone.tmj > 0 ? num(r.zone.tmj) : <span className="text-muted-foreground">hors axes</span>}
        </span>
      ),
    },
    {
      key: "ratio", header: "Véh./stat.", align: "right",
      sortValue: r => r.zone.ratio,
      render: r => <span className="text-sm font-bold tabular-nums">{num(r.zone.ratio)}</span>,
    },
    {
      key: "format", header: "Format",
      sortValue: r => FORMAT_RANK[r.reco.format],
      render: r => <FormatBadge format={r.reco.format} />,
    },
    {
      key: "justification", header: "Justification",
      sortValue: r => r.reco.reasons.join(" "),
      render: r => (
        <div className="flex min-w-[190px] flex-wrap gap-1">
          {r.reco.reasons.map(reason => (
            <Badge key={reason} variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
              {reason}
            </Badge>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Moteur de règles format ↔ zone"
        description="Pour chacun des 24 gouvernorats scorés, la règle V1 croise score d'opportunité, trafic quotidien (TMJ) et palier d'équipement pour recommander un format de point de service. La règle est volontairement simple et affichée : aucune boîte noire."
        icon={GitCompare}
        badge="Moteur V1 · transparent"
      />

      {/* KPIs — répartition des 3 formats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FORMAT_KEYS.map(f => {
          const pool = byFormat[f]
          const best = pool.length > 0
            ? pool.reduce((a, b) => (b.zone.score > a.zone.score ? b : a)).zone
            : null
          return (
            <KpiCard
              key={f}
              label={`Zones ${FORMAT_META[f].label}`}
              value={num(pool.length)}
              icon={FORMAT_META[f].icon}
              tone={kpiTone(f)}
              sub={best
                ? `meilleure zone : ${best.gouvernorat} (${best.score}/100)`
                : "aucune zone — seuils non atteints"}
            />
          )
        })}
      </div>

      {/* Règles du moteur (affichées telles quelles) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Règles appliquées (V1)</CardTitle>
          <CardDescription>Évaluées dans l&apos;ordre — la première condition remplie l&apos;emporte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { f: "CLASSIQUE" as FormatKey, texte: `score ≥ ${FORMAT_RULE.classiqueScore} et TMJ ≥ ${num(FORMAT_RULE.classiqueTmj)} (axe majeur) → station complète 4+ pistes, boutique et services.` },
            { f: "EXPRESS" as FormatKey, texte: `score ≥ ${FORMAT_RULE.expressScore} et (TMJ ≥ ${num(FORMAT_RULE.expressTmj)} ou zone blanche / sous-équipée) → micro-station 2 pistes et kiosque.` },
            { f: "MOBILITY_HUB" as FormatKey, texte: "sinon → Mobility Hub : atelier vidange / pneus / diagnostic sans carburant, investissement léger pour les zones blanches profondes." },
          ].map(r => (
            <p key={r.f} className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-muted-foreground">
              <FormatBadge format={r.f} />
              <span className="min-w-0 flex-1">{r.texte}</span>
            </p>
          ))}
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            V1 : recommandation moteur uniquement (pas de choix manuel par zone) — la pondération du score reste
            configurable dans la console Super Admin, et la recommandation se recalcule en direct.
          </p>
        </CardContent>
      </Card>

      {/* Table des 24 zones + filtre par format */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recommandation par gouvernorat</CardTitle>
          <CardDescription>
            24 zones triées par score décroissant · cliquez une ligne pour le détail complet (5 critères, enseignes,
            délégations) · vue arborescente groupée par format.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="radar-formats-matching"
            columns={columns}
            rows={filtered}
            rowKey={r => r.zone.gouvernorat}
            onRowClick={r => setSelected(r)}
            emptyMessage="Aucune zone dans ce format — ajustez le filtre."
            maxHeightClassName="max-h-[26rem]"
            toolbarExtra={
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par format">
                {(["TOUS", ...FORMAT_KEYS] as MatchFilter[]).map(f => {
                  const active = filter === f
                  const count = f === "TOUS" ? rows.length : byFormat[f].length
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      aria-pressed={active}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                        active
                          ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900 dark:text-emerald-200"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {f !== "TOUS" && (
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FORMAT_META[f].dot }} aria-hidden />
                      )}
                      {FILTER_LABELS[f]}
                      <span className="tabular-nums opacity-60">{count}</span>
                    </button>
                  )
                })}
              </div>
            }
            nested={{
              groupKey: r => r.reco.format,
              groupLabel: (gk, grows) => {
                const f = gk as FormatKey
                const best = grows.reduce((a, b) => (b.zone.score > a.zone.score ? b : a)).zone
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <FormatBadge format={f} />
                    <span className="text-[11px] font-normal text-primary/70">
                      — {grows.length} gouvernorat{grows.length > 1 ? "s" : ""} · meilleure zone {best.gouvernorat} ({best.score}/100)
                      {" · "}
                      {grows[0].reco.rule}
                    </span>
                  </span>
                )
              },
              groupSortValue: gk => FORMAT_RANK[gk as FormatKey],
              hideColumnKeyInGroups: "format",
              defaultOpen: "all",
            }}
            renderCard={r => (
              <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setSelected(r)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.zone.gouvernorat}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {num(r.zone.stationsTotal)} stations · TMJ {r.zone.tmj > 0 ? num(r.zone.tmj) : "—"} · ratio {num(r.zone.ratio)}
                      </p>
                    </div>
                    <FormatBadge format={r.reco.format} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <ScoreBar value={r.zone.score} color="#059669" className="flex-1" />
                    <span className="text-xs font-bold tabular-nums">{r.zone.score}/100</span>
                    <PalierBadge palier={r.zone.palier as PalierKey} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.reco.reasons.map(reason => (
                      <Badge key={reason} variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>

      {/* Détail d'une zone — Sheet réutilisé, avec CTA formats */}
      <ZoneDetailSheet
        zone={selected?.zone ?? null}
        rank={selected ? rankOf(selected.zone) : undefined}
        onClose={() => setSelected(null)}
        actions={selected ? sheetActions(selected) : undefined}
      />
    </div>
  )
}
