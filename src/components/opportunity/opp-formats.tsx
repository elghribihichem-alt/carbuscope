'use client'

// T51-b — Radar d'Opportunités / sous-module « 🏗️ Formats recommandés » :
// 1. Matching format ↔ zone (3 cartes récap + tableau des raisons)
// 2. Visualisation 3D (SVG isométrique dessiné main par format)
// 3. Plan d'implantation (timeline interactive terrain → recrutement)
// 4. Comparatif ROI par format (CA an 1 / an 5 / investissement / break-even)

import { useMemo, useState, type ReactNode } from "react"
import {
  Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  Boxes, Fuel, HardHat, LandPlot, LayoutGrid, Percent, Stamp, Timer, TrendingUp, Users, Warehouse, Zap,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { tooltipStyle } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { FORMAT_HINTS, FORMAT_LABELS, type OpportunityZoneDTO } from "@/lib/t51-dto"
import {
  FormatBadge, OppEmpty, ScoreBadge, oppDt, oppNum, oppScrollList, useEtude, type OppStats,
} from "./opp-shared"

export interface OppFormatsProps {
  zones: OpportunityZoneDTO[]
  stats: OppStats
  brandSlug: string
}

/** Formats gérés par le moteur de recommandation. */
export const FORMAT_KEYS = ["STATION", "MICRO_HUB_EXPRESS", "MOBILITY_HUB"] as const
export type FormatKey = (typeof FORMAT_KEYS)[number]

const FORMAT_META: Record<FormatKey, { icon: LucideIcon; investment: number; surfaceM2: number; months: number; capacity: string }> = {
  STATION: { icon: Fuel, investment: 2_850_000, surfaceM2: 3200, months: 14, capacity: "6 pistes carburant + boutique" },
  MICRO_HUB_EXPRESS: { icon: Zap, investment: 480_000, surfaceM2: 350, months: 7, capacity: "2 postes vidange express + pneus" },
  MOBILITY_HUB: { icon: Warehouse, investment: 890_000, surfaceM2: 850, months: 7, capacity: "3 baies de service + espace fidélité" },
}

/** Raison lisible du format recommandé pour une zone. */
export function formatReason(z: OpportunityZoneDTO): string {
  if (z.recommendedFormat === "STATION") {
    return `Trafic élevé (TMJ ${oppNum(z.trafficDaily)} véh/j) et parc de ${oppNum(z.vehicles)} véhicules — capacité carburant complète.`
  }
  if (z.recommendedFormat === "MOBILITY_HUB") {
    return `Fort potentiel de fidélisation (pouvoir d'achat ${z.scorePower}/100, foncier ${z.foncierDispo.toLowerCase()}) — hub multi-services franchisé.`
  }
  return `Trafic intermédiaire (TMJ ${oppNum(z.trafficDaily)} véh/j) avec ${z.competitorCount} concurrent(s) — format service rapide rentable.`
}

/* ======================= Onglet 1 — Matching format ↔ zone ======================= */

function MatchingTab({ zones, stats }: { zones: OpportunityZoneDTO[]; stats: OppStats }) {
  const [fmt, setFmt] = useState<string>("ALL")
  const rows = useMemo(
    () => (fmt === "ALL" ? zones : zones.filter(z => z.recommendedFormat === fmt)),
    [zones, fmt]
  )
  const sorted = useMemo(() => [...rows].sort((a, b) => b.scoreGlobal - a.scoreGlobal), [rows])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {FORMAT_KEYS.map(k => {
          const meta = FORMAT_META[k]
          const Icon = meta.icon
          return (
            <Card key={k} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary group-hover:bg-primary/10">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-bold">{FORMAT_LABELS[k]}</p>
                    <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
                      {stats.byFormat[k] ?? 0} zone{stats.byFormat[k] > 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{FORMAT_HINTS[k]}</p>
                  <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                    ~{oppDt(meta.investment)} · {oppNum(meta.surfaceM2)} m² · {meta.months} mois
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between space-y-0 gap-2">
          <div>
            <CardTitle className="text-sm">Zone → format optimal</CardTitle>
            <CardDescription>Format recommandé par le moteur de scoring et sa justification terrain.</CardDescription>
          </div>
          <Select value={fmt} onValueChange={setFmt}>
            <SelectTrigger className="w-[260px]" aria-label="Filtrer par format">
              <SelectValue placeholder="Format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les formats ({zones.length})</SelectItem>
              {FORMAT_KEYS.map(k => (
                <SelectItem key={k} value={k}>
                  {FORMAT_LABELS[k]} ({stats.byFormat[k] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className={cn(oppScrollList, "max-h-[28rem]")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead>Gouvernorat</TableHead>
                  <TableHead>Format recommandé</TableHead>
                  <TableHead className="min-w-[260px]">Raison</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(z => (
                  <TableRow key={z.id}>
                    <TableCell className="py-2">
                      <p className="text-sm font-medium">{z.zoneName}</p>
                      <p className="text-[11px] text-muted-foreground">{z.delegation}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{z.gouvernorat}</TableCell>
                    <TableCell><FormatBadge format={z.recommendedFormat} /></TableCell>
                    <TableCell className="text-xs leading-snug text-muted-foreground">{formatReason(z)}</TableCell>
                    <TableCell className="text-right"><ScoreBadge score={z.scoreGlobal} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucune zone pour ce format.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 2 — Visualisation 3D (SVG isométrique) ======================= */

const COS30 = Math.cos(Math.PI / 6)
const SIN30 = Math.sin(Math.PI / 6)

/** Projection isométrique (unités terrain → écran). */
function isoPt(x: number, y: number, z: number, ox: number, oy: number, s: number) {
  return { x: ox + (x - y) * COS30 * s, y: oy + (x + y) * SIN30 * s - z * s }
}

interface IsoSceneCtx {
  ox: number
  oy: number
  s: number
}

/** Boîte isométrique (3 faces visibles : dessus, droite, face avant-gauche). */
function IsoBox({
  x, y, z, w, d, h, ctx, top, right, front, stroke,
}: {
  x: number; y: number; z: number; w: number; d: number; h: number
  ctx: IsoSceneCtx
  top: string; right: string; front: string; stroke?: string
}) {
  const P = (dx: number, dy: number, dz: number) => isoPt(x + dx, y + dy, z + dz, ctx.ox, ctx.oy, ctx.s)
  const c = P(w, d, 0), e = P(0, d, 0), f = P(w, 0, 0)
  const a2 = P(0, 0, h), b2 = P(w, 0, h), c2 = P(w, d, h), d2 = P(0, d, h)
  const st = stroke ?? "rgba(120,113,108,0.35)"
  return (
    <g stroke={st} strokeWidth={0.8} strokeLinejoin="round">
      <path d={`M ${a2.x} ${a2.y} L ${b2.x} ${b2.y} L ${c2.x} ${c2.y} L ${d2.x} ${d2.y} Z`} fill={top} />
      <path d={`M ${b2.x} ${b2.y} L ${c2.x} ${c2.y} L ${c.x} ${c.y} L ${f.x} ${f.y} Z`} fill={right} />
      <path d={`M ${d2.x} ${d2.y} L ${c2.x} ${c2.y} L ${c.x} ${c.y} L ${e.x} ${e.y} Z`} fill={front} />
    </g>
  )
}

/** Sol trapézoïdal (parallelogramme iso). */
function IsoGround({ w, d, ctx }: { w: number; d: number; ctx: IsoSceneCtx }) {
  const p1 = isoPt(0, 0, 0, ctx.ox, ctx.oy, ctx.s)
  const p2 = isoPt(w, 0, 0, ctx.ox, ctx.oy, ctx.s)
  const p3 = isoPt(w, d, 0, ctx.ox, ctx.oy, ctx.s)
  const p4 = isoPt(0, d, 0, ctx.ox, ctx.oy, ctx.s)
  return (
    <path
      d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} Z`}
      className="fill-stone-100 stroke-stone-300 dark:fill-stone-800/60 dark:stroke-stone-600"
      strokeWidth={1.2}
    />
  )
}

/** Rectanle appliqué sur la face avant (plan y = d). */
function IsoFaceRect({
  x, yPlane, z, w, h, ctx, className,
}: { x: number; yPlane: number; z: number; w: number; h: number; ctx: IsoSceneCtx; className?: string }) {
  const P = (dx: number, dz: number) => isoPt(x + dx, yPlane, z + dz, ctx.ox, ctx.oy, ctx.s)
  const a = P(0, 0), b = P(w, 0), c = P(w, h), d = P(0, h)
  return <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} L ${d.x} ${d.y} Z`} className={className} strokeWidth={0.8} />
}

function SceneLabel({
  x, y, anchor = "middle", children,
}: {
  x: number; y: number; anchor?: "start" | "middle" | "end"; children: ReactNode
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="fill-stone-500 dark:fill-stone-400" fontSize={10} fontWeight={600}>
      {children}
    </text>
  )
}

/** Station classique : boutique + auvent sur pompes + totem enseigne. */
function StationScene({ brand }: { brand: string }) {
  const ctx: IsoSceneCtx = { ox: 190, oy: 118, s: 6 }
  const label = isoPt(14, 12, 0, ctx.ox, ctx.oy, ctx.s)
  return (
    <svg viewBox="0 0 420 320" className="h-auto w-full" role="img" aria-label={`Aperçu isométrique d'une station ${brand}`}>
      <IsoGround w={28} d={21} ctx={ctx} />
      {/* boutique */}
      <IsoBox x={3} y={1} z={0} w={9} d={6} h={5.2} ctx={ctx}
        top="#e7d7bd" right="#d9c3a0" front="#efe3cd" />
      <IsoFaceRect x={4} yPlane={7} z={2.2} w={7} h={2.2} ctx={ctx} className="fill-teal-200 stroke-teal-500/60 dark:fill-teal-900 dark:stroke-teal-700" />
      {/* poteaux + auvent */}
      <IsoBox x={4} y={10} z={0} w={0.6} d={0.6} h={6} ctx={ctx} top="#c8b8a0" right="#b8a58c" front="#d4c4ac" />
      <IsoBox x={21} y={10} z={0} w={0.6} d={0.6} h={6} ctx={ctx} top="#c8b8a0" right="#b8a58c" front="#d4c4ac" />
      <IsoBox x={4} y={9.5} z={6} w={18} d={7.5} h={0.9} ctx={ctx}
        top="#c9795b" right="#a85a40" front="#d98a6a" />
      {/* pompes (2 îlots) */}
      <IsoBox x={9} y={12} z={0} w={1.4} d={1.4} h={2.2} ctx={ctx} top="#f2c14e" right="#d9a437" front="#f5cd68" />
      <IsoBox x={15} y={12} z={0} w={1.4} d={1.4} h={2.2} ctx={ctx} top="#f2c14e" right="#d9a437" front="#f5cd68" />
      {/* totem enseigne */}
      <IsoBox x={24} y={3} z={0} w={1.2} d={1.2} h={7} ctx={ctx} top="#8a4b1f" right="#713a15" front="#9c5a28" />
      <IsoFaceRect x={23.7} yPlane={4.2} z={5.4} w={1.9} h={1.9} ctx={ctx} className="fill-amber-300 stroke-amber-600/70" />
      <SceneLabel
        x={isoPt(23.3, 4.2, 6.4, ctx.ox, ctx.oy, ctx.s).x}
        y={isoPt(23.3, 4.2, 6.4, ctx.ox, ctx.oy, ctx.s).y}
        anchor="end"
      >
        {brand.toUpperCase().slice(0, 8)}
      </SceneLabel>
      <SceneLabel x={label.x} y={label.y + 22}>6 pistes · boutique · 3 200 m²</SceneLabel>
    </svg>
  )
}

/** Micro-station express : kiosque + 2 postes + pneus. */
function MicroHubScene({ brand }: { brand: string }) {
  const ctx: IsoSceneCtx = { ox: 210, oy: 112, s: 9 }
  const label = isoPt(8, 8, 0, ctx.ox, ctx.oy, ctx.s)
  return (
    <svg viewBox="0 0 420 320" className="h-auto w-full" role="img" aria-label="Aperçu isométrique d'une micro-station express">
      <IsoGround w={16} d={13} ctx={ctx} />
      {/* kiosque */}
      <IsoBox x={2} y={1} z={0} w={7} d={5} h={3.4} ctx={ctx} top="#e7d7bd" right="#d9c3a0" front="#efe3cd" />
      <IsoBox x={1.6} y={0.8} z={3.4} w={7.8} d={5.4} h={0.6} ctx={ctx} top="#c9795b" right="#a85a40" front="#d98a6a" />
      <IsoFaceRect x={3} yPlane={6} z={1.2} w={5} h={1.6} ctx={ctx} className="fill-teal-200 stroke-teal-500/60 dark:fill-teal-900 dark:stroke-teal-700" />
      {/* postes vidange */}
      <IsoBox x={10} y={8} z={0} w={1.2} d={1.2} h={1.6} ctx={ctx} top="#f2c14e" right="#d9a437" front="#f5cd68" />
      <IsoBox x={13} y={8} z={0} w={1.2} d={1.2} h={1.6} ctx={ctx} top="#f2c14e" right="#d9a437" front="#f5cd68" />
      {/* pile de pneus */}
      <IsoBox x={10.5} y={2.5} z={0} w={1.4} d={1.4} h={1} ctx={ctx} top="#57534e" right="#44403c" front="#6b6660" />
      <IsoBox x={10.5} y={2.5} z={1} w={1.4} d={1.4} h={1} ctx={ctx} top="#57534e" right="#44403c" front="#6b6660" />
      {/* enseigne kiosque */}
      <IsoFaceRect x={2.2} yPlane={6} z={2.6} w={4} h={0.7} ctx={ctx} className="fill-amber-300 stroke-amber-600/70" />
      <SceneLabel
        x={isoPt(5.2, 3.9, 4.4, ctx.ox, ctx.oy, ctx.s).x}
        y={isoPt(5.2, 3.9, 4.4, ctx.ox, ctx.oy, ctx.s).y}
      >
        {brand.toUpperCase().slice(0, 8)}
      </SceneLabel>
      <SceneLabel x={label.x} y={label.y + 18}>2 postes express · 350 m²</SceneLabel>
    </svg>
  )
}

/** Mobility Hub : bâtiment 3 baies + piste + borne. */
function HubScene({ brand }: { brand: string }) {
  const ctx: IsoSceneCtx = { ox: 200, oy: 112, s: 8 }
  const label = isoPt(11, 9, 0, ctx.ox, ctx.oy, ctx.s)
  return (
    <svg viewBox="0 0 420 320" className="h-auto w-full" role="img" aria-label="Aperçu isométrique d'un Mobility Hub">
      <IsoGround w={22} d={16} ctx={ctx} />
      {/* bâtiment */}
      <IsoBox x={2} y={1} z={0} w={12} d={7} h={4.2} ctx={ctx} top="#e7d7bd" right="#d9c3a0" front="#efe3cd" />
      {/* 3 baies de service */}
      <IsoFaceRect x={3} yPlane={8} z={0.4} w={2.9} h={3} ctx={ctx} className="fill-teal-300 stroke-teal-600/70 dark:fill-teal-800 dark:stroke-teal-600" />
      <IsoFaceRect x={6.5} yPlane={8} z={0.4} w={2.9} h={3} ctx={ctx} className="fill-teal-300 stroke-teal-600/70 dark:fill-teal-800 dark:stroke-teal-600" />
      <IsoFaceRect x={10} yPlane={8} z={0.4} w={2.9} h={3} ctx={ctx} className="fill-teal-300 stroke-teal-600/70 dark:fill-teal-800 dark:stroke-teal-600" />
      {/* bandeau enseigne */}
      <IsoFaceRect x={2.4} yPlane={8} z={3.4} w={11.2} h={0.8} ctx={ctx} className="fill-amber-300 stroke-amber-600/70" />
      <SceneLabel
        x={isoPt(8, 4.5, 5.2, ctx.ox, ctx.oy, ctx.s).x}
        y={isoPt(8, 4.5, 5.2, ctx.ox, ctx.oy, ctx.s).y}
      >
        {brand.toUpperCase().slice(0, 10)} · TMP
      </SceneLabel>
      {/* espace fidélité / attente */}
      <IsoBox x={16} y={3} z={0} w={4} d={4} h={0.5} ctx={ctx} top="#c9795b" right="#a85a40" front="#d98a6a" />
      {/* borne de service */}
      <IsoBox x={17} y={10} z={0} w={0.9} d={0.9} h={1.8} ctx={ctx} top="#059669" right="#047857" front="#10b981" />
      <SceneLabel x={label.x} y={label.y + 20}>3 baies · fidélité · 850 m²</SceneLabel>
    </svg>
  )
}

function VisualizationTab({ zones, brandSlug }: { zones: OpportunityZoneDTO[]; brandSlug: string }) {
  const sorted = useMemo(() => [...zones].sort((a, b) => b.scoreGlobal - a.scoreGlobal), [zones])
  const [zoneId, setZoneId] = useState<string>("")
  const zone = zones.find(z => z.id === zoneId) ?? sorted[0]
  const [preview, setPreview] = useState<FormatKey | "AUTO">("AUTO")
  const format: FormatKey = preview === "AUTO" ? ((zone?.recommendedFormat as FormatKey) ?? "STATION") : preview

  if (sorted.length === 0) return <OppEmpty icon={LayoutGrid} title="Aucune zone à visualiser" />

  const meta = FORMAT_META[format]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Zone de référence</p>
            <Select value={zone?.id ?? ""} onValueChange={setZoneId}>
              <SelectTrigger className="w-[300px]" aria-label="Sélectionner la zone visualisée">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                {sorted.slice(0, 60).map(z => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.zoneName} — {z.gouvernorat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format à prévisualiser">
            <Button
              size="sm"
              variant={preview === "AUTO" ? "default" : "outline"}
              onClick={() => setPreview("AUTO")}
              aria-pressed={preview === "AUTO"}
            >
              Format recommandé
            </Button>
            {FORMAT_KEYS.map(k => (
              <Button
                key={k}
                size="sm"
                variant={preview === k ? "default" : "outline"}
                onClick={() => setPreview(k)}
                aria-pressed={preview === k}
                className="gap-1.5"
              >
                {(() => { const I = FORMAT_META[k].icon; return <I className="h-3.5 w-3.5" aria-hidden /> })()}
                {FORMAT_LABELS[k]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Boxes className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Aperçu isométrique — {FORMAT_LABELS[format]}
            </CardTitle>
            <CardDescription>
              {zone ? `Zone « ${zone.zoneName} » (${zone.gouvernorat}) · ${meta.capacity}` : "Vue 3D du point de service"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {format === "STATION" && <StationScene brand={brandSlug} />}
            {format === "MICRO_HUB_EXPRESS" && <MicroHubScene brand={brandSlug} />}
            {format === "MOBILITY_HUB" && <HubScene brand={brandSlug} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fiche technique du format</CardTitle>
            <CardDescription>Caractéristiques indicatives appliquées à la zone sélectionnée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Surface au sol", value: `${oppNum(meta.surfaceM2)} m²` },
              { label: "Capacité", value: meta.capacity },
              { label: "Investissement", value: `≈ ${oppDt(meta.investment)}` },
              { label: "Délai d'ouverture", value: `${meta.months} mois` },
              zone ? { label: "TMJ de la zone", value: `${oppNum(zone.trafficDaily)} véh/j` } : null,
              zone ? { label: "Foncier (prix m²)", value: `${oppNum(zone.foncierPriceM2)} DT/m² (${zone.foncierDispo.toLowerCase()})` } : null,
              zone ? { label: "Statut pipeline", value: zone.status } : null,
            ].filter((r): r is { label: string; value: string } => r !== null).map(r => (
              <div key={r.label} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-semibold tabular-nums">{r.value}</span>
              </div>
            ))}
            {zone && <FormatBadge format={zone.recommendedFormat} className="mt-2" />}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Le moteur recommande ce format pour {zone ? zone.zoneName : "cette zone"} sur la base du score global
              ({zone?.scoreGlobal ?? "—"}/100) et du trafic routier.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ======================= Onglet 3 — Plan d'implantation ======================= */

interface PlanStep {
  title: string
  months: number
  desc: string
  icon: LucideIcon
}

const PLAN_STEPS: Record<FormatKey, PlanStep[]> = {
  STATION: [
    { title: "Terrain & acquisition foncière", months: 3, desc: "Promesse de vente, étude géotechnique, APIC si parcelle proche du plan d'eau.", icon: LandPlot },
    { title: "Permis & autorisations", months: 4, desc: "Permis de bâtir, avis conforme CRDA, autorisation d'exploiter (Ministère du Commerce).", icon: Stamp },
    { title: "Construction & équipement", months: 5, desc: "Génie civil, cuves, pompes, boutique, bassin de récupération, séparateur hydrocarbures.", icon: HardHat },
    { title: "Recrutement & formation", months: 2, desc: "Chef de station + 6 pompistes + 2 magasiniers, formation enseigne 2 semaines.", icon: Users },
  ],
  MICRO_HUB_EXPRESS: [
    { title: "Terrain & acquisition foncière", months: 1, desc: "Bail ou achat d'une parcelle en angle, étude de sol rapide.", icon: LandPlot },
    { title: "Permis & autorisations", months: 2, desc: "Permis de bâtir léger, compatibilité CRDA, déclaration d'activité service rapide.", icon: Stamp },
    { title: "Construction & équipement", months: 3, desc: "Kiosque préfabriqué, 2 postes vidange, pont élévateur, stock pneus.", icon: HardHat },
    { title: "Recrutement & formation", months: 1, desc: "Chef de micro-hub + 2 mécaniciens + 1 technicien diagnostic.", icon: Users },
  ],
  MOBILITY_HUB: [
    { title: "Terrain & acquisition foncière", months: 1, desc: "Signature avec le franchisé candidat, bail emphytéotique de préférence.", icon: LandPlot },
    { title: "Permis & autorisations", months: 2, desc: "Permis de bâtir, avis CRDA, conformité cahier des charges TMP.", icon: Stamp },
    { title: "Construction & équipement", months: 3, desc: "Bâtiment 3 baies, banque de données logicielle, outillage référencé.", icon: HardHat },
    { title: "Recrutement & formation", months: 1, desc: "Équipe franchisée formée au savoir-faire enseigne (2 semaines).", icon: Users },
  ],
}

function PlanTab() {
  const [fmt, setFmt] = useState<FormatKey>("STATION")
  const [done, setDone] = useState<Record<string, boolean>>({})
  const steps = PLAN_STEPS[fmt]
  const total = steps.reduce((s, st) => s + st.months, 0)
  const doneCount = steps.filter((st, i) => done[`${fmt}-${i}`]).length

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format du plan d'implantation">
            {FORMAT_KEYS.map(k => (
              <Button
                key={k}
                size="sm"
                variant={fmt === k ? "default" : "outline"}
                onClick={() => setFmt(k)}
                aria-pressed={fmt === k}
                className="gap-1.5"
              >
                {(() => { const I = FORMAT_META[k].icon; return <I className="h-3.5 w-3.5" aria-hidden /> })()}
                {FORMAT_LABELS[k]}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="h-6 px-2.5 tabular-nums">
              {doneCount}/{steps.length} étapes validées
            </Badge>
            <Badge variant="outline" className="h-6 px-2.5 tabular-nums">
              <Timer className="mr-1 h-3 w-3" aria-hidden /> {total} mois
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Plan d&apos;implantation — {FORMAT_LABELS[fmt]}</CardTitle>
          <CardDescription>
            Cochez chaque étape pour suivre l&apos;avancement (suivi visuel local, ~{total} mois de terrain à l&apos;ouverture).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-3 border-l-2 border-dashed border-stone-300 pl-6 dark:border-stone-700">
            {steps.map((st, i) => {
              const key = `${fmt}-${i}`
              const checked = !!done[key]
              return (
                <li key={key} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[31px] top-3 flex h-5 w-5 items-center justify-center rounded-full border-2",
                      checked
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-stone-300 bg-background text-stone-400 dark:border-stone-600"
                    )}
                    aria-hidden
                  >
                    {checked ? "✓" : i + 1}
                  </span>
                  <div
                    className={cn(
                      "rounded-lg border p-4 transition-colors",
                      checked ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40" : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <st.icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{st.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{st.desc}</p>
                        </div>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={c => setDone(prev => ({ ...prev, [key]: c === true }))}
                          aria-label={`Valider l'étape ${st.title}`}
                        />
                        Validée
                      </label>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      Durée : {st.months} mois
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 4 — Comparatif ROI ======================= */

interface RoiRow {
  format: FormatKey
  label: string
  investment: number
  ca1: number
  ca5: number
  net5: number
  breakEven: number
  roiYear1: number
}

function computeRoi(z: OpportunityZoneDTO, simRealiste?: RentabilityLike): RoiRow[] {
  const rows: RoiRow[] = FORMAT_KEYS.map(f => {
    const meta = FORMAT_META[f]
    const factor = f === "STATION" ? 8.5 : f === "MOBILITY_HUB" ? 4.2 : 2.6
    let ca1 = Math.round((z.trafficDaily * 0.9 + z.vehicles * 0.02) * factor)
    let inv = meta.investment
    let growth = 0.06
    if (simRealiste && f === (z.recommendedFormat as FormatKey)) {
      ca1 = simRealiste.caYear1
      inv = simRealiste.investment
      growth = simRealiste.growthPct / 100
    }
    const charges = ca1 * 0.55
    const ca5 = ca1 * Math.pow(1 + growth, 4)
    const net5 = Math.round(ca5 - ca5 * 0.55)
    const marge1 = ca1 - charges
    const be = marge1 > 0 ? Math.max(6, Math.round(inv / marge1 * 12)) : 999
    return {
      format: f,
      label: FORMAT_LABELS[f],
      investment: inv,
      ca1,
      ca5: Math.round(ca5),
      net5,
      breakEven: be,
      roiYear1: inv > 0 ? Math.round((marge1 / inv) * 100) : 0,
    }
  })
  return rows
}

interface RentabilityLike {
  scenario: string
  investment: number
  caYear1: number
  growthPct: number
}

function RoiTab({ zones }: { zones: OpportunityZoneDTO[] }) {
  const sorted = useMemo(() => [...zones].sort((a, b) => b.scoreGlobal - a.scoreGlobal), [zones])
  const [zoneId, setZoneId] = useState<string>("")
  const zone = zones.find(z => z.id === zoneId) ?? sorted[0]
  const etude = useEtude(zone?.id ?? null)
  const palette = useChartPalette()

  if (sorted.length === 0) return <OppEmpty icon={TrendingUp} title="Aucune zone à comparer" />

  const sims = etude.data?.simulations ?? []
  const realiste = sims.find(s => s.scenario === "REALISTE")
  const rows = zone ? computeRoi(zone, realiste) : []
  const chartRows = rows.map(r => ({
    format: r.label,
    "CA an 1": r.ca1,
    "CA an 5": r.ca5,
    "Investissement": r.investment,
  }))

  const renderTip = (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
    if (!props.active || !props.payload?.length) return null
    const row = props.payload[0]?.payload as (typeof chartRows)[number] | undefined
    if (!row) return null
    return (
      <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
        <p className="mb-1 font-medium text-popover-foreground">{row.format}</p>
        <div className="space-y-0.5">
          <div className="flex justify-between gap-6"><span className="text-muted-foreground">CA an 1</span><span className="font-semibold tabular-nums">{oppDt(row["CA an 1"])}</span></div>
          <div className="flex justify-between gap-6"><span className="text-muted-foreground">CA an 5</span><span className="font-semibold tabular-nums">{oppDt(row["CA an 5"])}</span></div>
          <div className="flex justify-between gap-6"><span className="text-muted-foreground">Investissement</span><span className="font-semibold tabular-nums">{oppDt(row.Investissement)}</span></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Zone analysée</p>
            <Select value={zone?.id ?? ""} onValueChange={setZoneId}>
              <SelectTrigger className="w-[300px]" aria-label="Sélectionner la zone du comparatif">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                {sorted.slice(0, 60).map(z => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.zoneName} — {z.gouvernorat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {etude.error && <Badge variant="outline" className="border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400">simulations indisponibles — calcul indicatif</Badge>}
          {etude.data && sims.length === 0 && !etude.error && (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
              aucune simulation générée — constantes par format
            </Badge>
          )}
          {realiste && (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
              scénario réaliste appliqué au format recommandé
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {rows.map(r => {
          const be = r.breakEven >= 999 ? "> 5 ans" : `${r.breakEven} mois`
          const beTone = r.breakEven <= 36 ? "text-emerald-600 dark:text-emerald-400" : r.breakEven <= 60 ? "text-amber-600 dark:text-amber-400" : "text-orange-700 dark:text-orange-400"
          return (
            <Card key={r.format} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <FormatBadge format={r.format} />
                  <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-muted-foreground">
                    <Percent className="h-3 w-3" aria-hidden />
                    ROI an 1 : {r.roiYear1} %
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">CA an 1</p>
                    <p className="text-sm font-bold tabular-nums">{oppDt(r.ca1)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">CA an 5</p>
                    <p className="text-sm font-bold tabular-nums">{oppDt(r.ca5)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Investi.</p>
                    <p className="text-sm font-bold tabular-nums">{oppDt(r.investment)}</p>
                  </div>
                </div>
                <p className={cn("mt-2 text-center text-sm font-semibold tabular-nums", beTone)}>
                  <Timer className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  Break-even : {be}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comparatif des trois formats</CardTitle>
          <CardDescription>
            CA an 1 / CA an 5 / investissement (DT) — hypothèse réaliste, charges 55 % du CA.
            {realiste ? " Le format recommandé reprend la simulation générée." : " Aucune simulation générée pour cette zone : constantes par format."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]" role="img" aria-label="Comparatif CA et investissement par format">
            <ChartContainer config={{}} className="aspect-auto h-full w-full">
              <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="format" tick={{ fontSize: 10, fill: palette.axis }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: palette.axis }}
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("fr-FR")}M` : `${Math.round(v / 1000)}K`)}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={renderTip} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Bar dataKey="CA an 1" fill={palette.color(2)} radius={[3, 3, 0, 0]} maxBarSize={34} />
                <Bar dataKey="CA an 5" fill={palette.color(3)} radius={[3, 3, 0, 0]} maxBarSize={34} />
                <Bar dataKey="Investissement" fill={palette.color(5)} radius={[3, 3, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ChartContainer>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Calculs indicatifs côté client : CA an 1 = (TMJ × 0,9 + parc × 0,02) × facteur format
            (8,5 / 4,2 / 2,6), charges = 55 % du CA, croissance 6 %/an (scénario réaliste du moteur).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Sous-module Formats ======================= */

export function OppFormats({ zones, stats, brandSlug }: OppFormatsProps) {
  const [tab, setTab] = useState("matching")

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
        <TabsTrigger value="matching">Matching format ↔ zone</TabsTrigger>
        <TabsTrigger value="visu3d">Visualisation 3D</TabsTrigger>
        <TabsTrigger value="plan">Plan d&apos;implantation</TabsTrigger>
        <TabsTrigger value="roi">Comparatif ROI</TabsTrigger>
      </TabsList>
      <TabsContent value="matching" className="mt-0 space-y-4">
        <MatchingTab zones={zones} stats={stats} />
      </TabsContent>
      <TabsContent value="visu3d" className="mt-0 space-y-4">
        <VisualizationTab zones={zones} brandSlug={brandSlug} />
      </TabsContent>
      <TabsContent value="plan" className="mt-0 space-y-4">
        <PlanTab />
      </TabsContent>
      <TabsContent value="roi" className="mt-0 space-y-4">
        <RoiTab zones={zones} />
      </TabsContent>
    </Tabs>
  )
}
