"use client"

// Shadow Market (T44-c) — carte SVG Tunisie dédiée au marché parallèle.
// Pan/zoom (molette + drag + boutons), points colorés par typologie, stations
// menacées (losanges par niveau), heatmap gouvernorats, zones rouges, rayons de
// cannibalisation autour d'une station, tracé d'axe routier, fiche point au
// clic, filtre typologies en chips, export CSV des points affichés.
// Fond géométrique importé de map/tunisia-geo (jamais modifié), projection
// via lib/geo — inspirée de map/tunisia-map.tsx mais simplifiée pour le module.

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Minus, Maximize, FileDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ShadowGovLossDTO, ShadowMapStationDTO, ShadowPointDTO, ShadowRedZoneDTO } from "@/lib/types"
import { MAP_W, MAP_H, project, kmToSvgUnits, haversineKm } from "@/lib/geo"
import { TUNISIA_BORDER, DJERBA, KERKENNAH, CITIES, GOV_CENTERS } from "@/components/map/tunisia-geo"
import {
  formatTnd, formatLJ, formatMillimes, relDateFr, typologyLabel,
  SHADOW_COLORS, LEVEL_COLORS, ShadowPhoto, ShadowStatusBadge,
} from "@/components/shadow/shadow-shared"
import { downloadPointsCsv } from "./shadow-cart-utils"

// ---------------------------------------------------------------------------
// Géométrie statique (module : calculée une seule fois)
// ---------------------------------------------------------------------------

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function borderToPath(pts: readonly [number, number][]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${project(p[0], p[1]).x.toFixed(1)} ${project(p[0], p[1]).y.toFixed(1)}`).join(" ") + " Z"
}

const BORDER_PATH = borderToPath(TUNISIA_BORDER as [number, number][])
const DJERBA_PATH = borderToPath(DJERBA as [number, number][])
const KERKENNAH_PATH = borderToPath(KERKENNAH as [number, number][])
const CITY_POINTS = CITIES.map(([name, lng, lat, major]) => ({ name, major, ...project(lng, lat) }))
const GOV_POINTS = Object.entries(GOV_CENTERS).map(([name, [lng, lat]]) => ({ name, ...project(lng, lat) }))

/** Couleurs typologies de repli (miroir du catalogue seedé). */
const TYPO_FALLBACK: Record<string, string> = {
  BIDONS: "#FF9800", KIOSQUE: "#FFC107", CAMION_CITERNE: "#E53935",
  STATION_PIRATE: "#B71C1C", GARAGE: "#FF7043", EPICERIE: "#9E9E9E",
}

const ROAD_STYLES: Record<string, { color: string; width: number }> = {
  AUTOROUTE: { color: "#d97706", width: 2.4 },
  RN: { color: "#e07856", width: 1.7 },
  GP: { color: "#9ca3af", width: 1.2 },
}

// Rayon des points par bande de zoom (unités SVG — évite un re-rendu à chaque
// cran de molette : la bande change seulement au franchissement d'un seuil).
const POINT_BANDS = [1.6, 3, 6]
const POINT_RADII = [3, 2.2, 1.6, 1.15]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ShadowFocusTarget {
  lat: number
  lng: number
  /** Emprise souhaitée en km (demi-largeur) autour de la cible. */
  km: number
}

export interface StationRadii {
  lat: number
  lng: number
  radiiM: number[]
}

export interface RoadTrace {
  code: string
  type: string
  segments: [number, number][]
}

export interface ShadowMapProps {
  points: ShadowPointDTO[]
  /** Stations menacées (losanges colorés par niveau). */
  stations?: ShadowMapStationDTO[]
  redZones?: ShadowRedZoneDTO[]
  govHeat?: ShadowGovLossDTO[]
  showGovHeat?: boolean
  /** Couleurs typologies (légende + points) — accepte tout DTO avec code/color. */
  typologies?: Array<{ code: string; color?: string }>
  /** Centre la carte (pan + zoom) sur la cible. Référence stable recommandée. */
  focusOn?: ShadowFocusTarget | null
  /** Trace les cercles 500 m / 1 km / 2 km autour d'une station + colore les points par anneau. */
  stationRadii?: StationRadii | null
  /** Tracé d'axe routier (points < 3 km filtrés par le parent). */
  roadTrace?: RoadTrace | null
  /** Mode compact : décor réduit (heatmap de la vue d'ensemble). */
  compact?: boolean
  height?: string
  className?: string
  onSelectPoint?: (p: ShadowPointDTO | null) => void
  onSelectStation?: (s: ShadowMapStationDTO | null) => void
  /** Contexte (nom de fichier) de l'export CSV des points affichés. */
  csvContext?: string
}

const RING_COLORS = [SHADOW_COLORS.red, SHADOW_COLORS.orange, SHADOW_COLORS.yellow]

export function ShadowMap({
  points, stations, redZones, govHeat, showGovHeat, typologies,
  focusOn, stationRadii, roadTrace, compact = false,
  height = "h-[520px]", className, onSelectPoint, onSelectStation, csvContext,
}: ShadowMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const movedRef = useRef(0)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [selPointId, setSelPointId] = useState<string | null>(null)
  const [selStationCode, setSelStationCode] = useState<string | null>(null)
  const [offTypo, setOffTypo] = useState<string[]>([])

  // ---------- Conversions écran ↔ SVG (letterbox-safe, lecture DOM à la demande) ----------
  const metrics = useCallback(() => {
    const el = svgRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const scale = Math.min(r.width / MAP_W, r.height / MAP_H)
    return { scale, offX: (r.width - MAP_W * scale) / 2, offY: (r.height - MAP_H * scale) / 2, rect: r }
  }, [])

  const svgPointFromEvent = useCallback((e: { clientX: number; clientY: number }): [number, number] | null => {
    const m = metrics()
    if (!m) return null
    const sx = (e.clientX - m.rect.left - m.offX) / m.scale
    const sy = (e.clientY - m.rect.top - m.offY) / m.scale
    return [sx, sy]
  }, [metrics])

  // ---------- Zoom molette / boutons / pan ----------
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const pt = svgPointFromEvent(e)
      if (!pt) return
      setView(v => {
        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
        const k = clamp(v.k * factor, 1, 14)
        const mx = (pt[0] - v.x) / v.k
        const my = (pt[1] - v.y) / v.k
        return { k, x: pt[0] - mx * k, y: pt[1] - my * k }
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [svgPointFromEvent])

  const zoomBy = (factor: number) => setView(v => {
    const k = clamp(v.k * factor, 1, 14)
    const cx = MAP_W / 2, cy = MAP_H / 2
    const mx = (cx - v.x) / v.k, my = (cy - v.y) / v.k
    return { k, x: cx - mx * k, y: cy - my * k }
  })
  const resetView = () => setView({ k: 1, x: 0, y: 0 })

  const dragRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    movedRef.current = 0
    dragRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const m = metrics()
    if (!m) return
    const dx = (e.clientX - d.sx) / m.scale
    const dy = (e.clientY - d.sy) / m.scale
    movedRef.current = Math.max(movedRef.current, Math.abs(dx) + Math.abs(dy))
    if (movedRef.current > 3) setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onPointerUp = () => { dragRef.current = null }

  const onBackgroundClick = () => {
    if (movedRef.current > 3) return
    setSelPointId(null)
    setSelStationCode(null)
    onSelectPoint?.(null)
    onSelectStation?.(null)
  }

  // ---------- Focus externe (gouvernorat, station, zone…) ----------
  useEffect(() => {
    // null = retour à la vue nationale demandé par le parent
    const raf = requestAnimationFrame(() => {
      if (!focusOn) {
        setView({ k: 1, x: 0, y: 0 })
        return
      }
      const p = project(focusOn.lng, focusOn.lat)
      const k = clamp(234 / Math.max(kmToSvgUnits(focusOn.km), 0.9), 1, 14)
      setView({ k, x: MAP_W / 2 - p.x * k, y: MAP_H / 2 - p.y * k })
    })
    return () => cancelAnimationFrame(raf)
  }, [focusOn])

  // ---------- Sélections dérivées (jamais de setState synchrone en effet) ----------
  const selPoint = selPointId ? points.find(p => p.id === selPointId) ?? null : null
  const selStation = selStationCode && stations ? stations.find(s => s.code === selStationCode) ?? null : null

  // ---------- Typologies : couleurs + filtre chips ----------
  const typoColors = useMemo(() => {
    const m: Record<string, string> = { ...TYPO_FALLBACK }
    if (typologies) for (const t of typologies) if (t.color) m[t.code] = t.color
    return m
  }, [typologies])

  const typoLegend = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of points) if (!seen.has(p.typologyCode)) seen.set(p.typologyCode, typoColors[p.typologyCode] ?? SHADOW_COLORS.gray)
    if (typologies) {
      for (const t of typologies) if (!seen.has(t.code) && t.color) seen.set(t.code, t.color)
    }
    return [...seen.entries()].map(([code, color]) => ({ code, color, label: typologyLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"))
  }, [points, typoColors, typologies])

  const offSet = useMemo(() => new Set(offTypo), [offTypo])
  const visiblePoints = useMemo(
    () => (offSet.size === 0 ? points : points.filter(p => !offSet.has(p.typologyCode))),
    [points, offSet]
  )
  const toggleTypo = (code: string) =>
    setOffTypo(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]))

  // ---------- Rayons de cannibalisation : points colorés par anneau ----------
  const ringInfo = useMemo(() => {
    if (!stationRadii) return null
    const radii = stationRadii.radiiM
    const assign = new Map<string, number>()
    const stats = radii.map(() => ({ count: 0, loss: 0, volume: 0 }))
    for (const p of points) {
      const dM = haversineKm(stationRadii.lat, stationRadii.lng, p.lat, p.lng) * 1000
      let ring = -1
      for (let i = 0; i < radii.length; i++) {
        if (dM <= radii[i]) { ring = i; break }
      }
      assign.set(p.id, ring)
      if (ring >= 0 && ring < stats.length) {
        stats[ring].count++
        stats[ring].loss += p.lossTnd
        stats[ring].volume += p.volumeLJ
      }
    }
    return { assign, stats }
  }, [stationRadii, points])
  const ringAssign = ringInfo?.assign ?? null
  const ringStats = ringInfo?.stats ?? null

  // ---------- Couches mémoïsées ----------
  const band = POINT_BANDS.findIndex(t => view.k < t)
  const pr = POINT_RADII[band === -1 ? POINT_RADII.length - 1 : band]

  const pointsLayer = useMemo(() => {
    return visiblePoints.map(p => {
      const p0 = project(p.lng, p.lat)
      const ring = ringAssign?.get(p.id) ?? -1
      const color = ring >= 0 && ring < 3 ? RING_COLORS[ring] : typoColors[p.typologyCode] ?? SHADOW_COLORS.gray
      const isSel = p.id === selPointId
      const volLabel = `${p.code} · ${typologyLabel(p.typologyCode)} · ${formatLJ(p.volumeLJ)}`
      return (
        <g
          key={p.id}
          className="shadow-pt cursor-pointer"
          onClick={e => {
            e.stopPropagation()
            if (movedRef.current > 3) return
            setSelPointId(p.id)
            setSelStationCode(null)
            onSelectPoint?.(p)
          }}
        >
          <title>{volLabel}</title>
          {isSel && <circle cx={p0.x} cy={p0.y} r={pr + 6} fill="none" stroke={SHADOW_COLORS.blue} strokeWidth={1.4} className="animate-ping-slow" />}
          {isSel && <circle cx={p0.x} cy={p0.y} r={pr + 3} fill="none" stroke={SHADOW_COLORS.blue} strokeWidth={1.2} />}
          <circle cx={p0.x} cy={p0.y} r={pr} fill={color} opacity={ring >= 0 ? 1 : 0.82} stroke="#ffffff" strokeWidth={0.55} />
        </g>
      )
    })
  }, [visiblePoints, typoColors, ringAssign, selPointId, pr, onSelectPoint])

  const stationsLayer = useMemo(() => {
    if (!stations) return null
    const s = 4.6
    return stations.map(st => {
      const p = project(st.lng, st.lat)
      const color = LEVEL_COLORS[st.level]
      const isSel = st.code === selStationCode
      return (
        <g
          key={st.code}
          className="cursor-pointer"
          onClick={e => {
            e.stopPropagation()
            if (movedRef.current > 3) return
            setSelStationCode(st.code)
            setSelPointId(null)
            onSelectStation?.(st)
          }}
        >
          <title>{`${st.name} · ${st.brandName} · ${st.points} point(s) · ${formatTnd(st.lossTnd)}/mois`}</title>
          {isSel && <circle cx={p.x} cy={p.y} r={s + 3.5} fill="none" stroke={SHADOW_COLORS.blue} strokeWidth={1.2} strokeDasharray="3 2" />}
          <rect x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} transform={`rotate(45 ${p.x} ${p.y})`}
            fill={color} stroke="#ffffff" strokeWidth={0.6} opacity={st.level === "YELLOW" && !compact ? 0.85 : 1} />
        </g>
      )
    })
  }, [stations, selStationCode, onSelectStation, compact])

  const govHeatLayer = useMemo(() => {
    if (!showGovHeat || !govHeat?.length) return null
    const byName = new Map(govHeat.map(g => [g.gouvernorat, g]))
    return GOV_POINTS.map(gp => {
      const g = byName.get(gp.name)
      if (!g || g.points === 0) return null
      const color = LEVEL_COLORS[g.level]
      const r = 9 + Math.sqrt(g.lossTnd) * 0.085 // rayon ∝ perte
      return (
        <circle key={gp.name} cx={gp.x} cy={gp.y} r={r} fill={color} opacity={0.16} stroke={color} strokeWidth={0.7} strokeOpacity={0.5} className="pointer-events-none">
          <title>{`${gp.name} · ${g.points} points · ${formatTnd(g.lossTnd)}/mois · ${g.stationsThreatened} station(s) menacée(s)`}</title>
        </circle>
      )
    })
  }, [showGovHeat, govHeat])

  const redZonesLayer = useMemo(() => {
    if (!redZones?.length) return null
    return redZones.map((z, i) => {
      const p = project(z.lng, z.lat)
      const r = Math.max(kmToSvgUnits(z.radiusM / 1000), 3.5)
      return (
        <g key={`${z.label}-${i}`} className="pointer-events-none">
          <circle cx={p.x} cy={p.y} r={r} fill={SHADOW_COLORS.red} opacity={0.13} />
          <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={SHADOW_COLORS.red} strokeWidth={1.1} strokeDasharray="5 3" opacity={0.75} />
          <circle cx={p.x} cy={p.y} r={1.6} fill={SHADOW_COLORS.red} />
          <title>{`${z.label} (${z.gouvernorat}) · ${z.points} points · ${formatTnd(z.lossTnd)}/mois · rayon ${Math.round(z.radiusM)} m`}</title>
        </g>
      )
    })
  }, [redZones])

  const roadLayer = useMemo(() => {
    if (!roadTrace) return null
    const pts = roadTrace.segments.map(s => project(s[0], s[1]))
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
    const style = ROAD_STYLES[roadTrace.type] ?? ROAD_STYLES.RN
    const mid = pts[Math.floor(pts.length / 2)]
    return (
      <g className="pointer-events-none">
        <path d={d} fill="none" stroke={style.color} strokeWidth={style.width} strokeLinecap="round" opacity={0.9} />
        <path d={d} fill="none" stroke="#ffffff" strokeWidth={style.width * 0.35} strokeLinecap="round" opacity={0.55} />
        <text x={mid.x + 4} y={mid.y - 4} fontSize={8.5 / view.k} fontWeight={700} fill={style.color}
          style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 2 / view.k, strokeLinejoin: "round" }}>
          {roadTrace.code}
        </text>
      </g>
    )
  }, [roadTrace, view.k])

  // ---------- Rayons autour d'une station ----------
  const radiiLayer = useMemo(() => {
    if (!stationRadii) return null
    const p = project(stationRadii.lng, stationRadii.lat)
    return stationRadii.radiiM.map((m, i) => {
      const r = kmToSvgUnits(m / 1000)
      const label = m >= 1000 ? `${m / 1000} km` : `${m} m`
      return (
        <g key={m} className="pointer-events-none">
          <circle cx={p.x} cy={p.y} r={r} fill={RING_COLORS[i % 3]} opacity={0.05} />
          <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={RING_COLORS[i % 3]} strokeWidth={1.1} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
          <text x={p.x + r * 0.72} y={p.y - r * 0.72} fontSize={9 / view.k} fontWeight={700} fill={RING_COLORS[i % 3]}
            style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 2.2 / view.k, strokeLinejoin: "round" }}>
            {label}{ringStats?.[i] ? ` · ${ringStats[i].count} pts` : ""}
          </text>
        </g>
      )
    })
  }, [stationRadii, view.k, ringStats])

  const transform = `translate(${view.x} ${view.y}) scale(${view.k})`

  return (
    <div className={`relative overflow-hidden rounded-xl border border-stone-200 bg-[radial-gradient(ellipse_at_center,var(--secondary)_0%,var(--background)_78%)] dark:border-stone-800 ${height} ${className ?? ""}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onBackgroundClick}
        role="img"
        aria-label="Cartographie des points de vente informels de carburant en Tunisie"
      >
        <defs>
          <filter id="shadow-heat-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g transform={transform}>
          {/* Pays + îles */}
          <path d={BORDER_PATH} className="map-land" stroke="var(--border)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={DJERBA_PATH} className="map-land" stroke="var(--border)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <path d={KERKENNAH_PATH} className="map-land" stroke="var(--border)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />

          {/* Villes (repères) */}
          <g>
            {CITY_POINTS.map(c => (
              <g key={c.name} style={{ display: view.k > 1.35 || c.major ? undefined : "none" }} className="pointer-events-none">
                <circle cx={c.x} cy={c.y} r={c.major ? 2.2 : 1.5} className="map-city" />
                {(c.major || view.k > 2) && (
                  <text x={c.x + 4} y={c.y + 3} fontSize={c.major ? 10 : 8.5} className="map-city-label" fontWeight={c.major ? 600 : 400}>{c.name}</text>
                )}
              </g>
            ))}
          </g>

          {/* Heatmap gouvernorats (sous les points) */}
          {govHeatLayer && <g filter="url(#shadow-heat-blur)">{govHeatLayer}</g>}

          {/* Zones rouges */}
          {redZonesLayer}

          {/* Tracé d'axe routier */}
          {roadLayer}

          {/* Rayons de cannibalisation + station sélectionnée */}
          {radiiLayer}

          {/* Stations menacées (losanges par niveau) */}
          {stationsLayer}

          {/* Points informels */}
          {pointsLayer}
        </g>
      </svg>

      {/* ---------- Contrôles zoom / reset / export ---------- */}
      <div className="absolute right-2 top-2 z-20 flex flex-col gap-1.5">
        <Button size="icon" variant="outline" className="h-8 w-8 bg-background/90 backdrop-blur" aria-label="Zoomer" onClick={() => zoomBy(1.45)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8 bg-background/90 backdrop-blur" aria-label="Dézoomer" onClick={() => zoomBy(1 / 1.45)}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8 bg-background/90 backdrop-blur" aria-label="Vue nationale (reset)" onClick={resetView}>
          <Maximize className="h-4 w-4" />
        </Button>
        {csvContext && (
          <Button
            size="icon"
            className="h-8 w-8"
            style={{ backgroundColor: SHADOW_COLORS.red, borderColor: SHADOW_COLORS.red }}
            aria-label="Exporter les points affichés en CSV"
            title="Export CSV des points affichés"
            onClick={() => downloadPointsCsv(visiblePoints, csvContext)}
            disabled={!visiblePoints.length}
          >
            <FileDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* ---------- Légende compacte + filtre typologies ---------- */}
      <div className="absolute bottom-2 left-2 z-20 max-w-[85%] rounded-lg border border-stone-200 bg-background/90 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur dark:border-stone-700">
        <p className="mb-1 font-semibold text-muted-foreground">Typologies {offTypo.length > 0 && <span className="font-normal">({visiblePoints.length}/{points.length} pts)</span>}</p>
        <div className="flex flex-wrap gap-1">
          {typoLegend.map(t => {
            const off = offSet.has(t.code)
            return (
              <button
                key={t.code}
                type="button"
                onClick={() => toggleTypo(t.code)}
                aria-pressed={!off}
                title={off ? "Afficher cette typologie" : "Masquer cette typologie"}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors ${off ? "border-stone-200 opacity-45 dark:border-stone-700" : "border-stone-300 font-medium hover:bg-accent dark:border-stone-600"}`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-200 pt-1.5 text-[10px] text-muted-foreground dark:border-stone-700">
          {showGovHeat && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#E53935] opacity-40" aria-hidden />Heatmap perte / gouvernorat</span>}
          {stations && (
            <>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45 bg-[#E53935]" aria-hidden />Station critique</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45 bg-[#FF9800]" aria-hidden />Modérée</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45 bg-[#FFC107]" aria-hidden />Vigilance</span>
            </>
          )}
          {redZones && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-dashed border-[#E53935] bg-[#E53935]/15" aria-hidden />Zone rouge</span>}
        </div>
      </div>

      {/* ---------- Fiche point (clic) ---------- */}
      {selPoint && (
        <div className="absolute left-2 top-2 z-30 w-64 overflow-hidden rounded-lg border border-stone-200 bg-background/97 shadow-lg backdrop-blur dark:border-stone-700" role="dialog" aria-label={`Fiche du point ${selPoint.code}`}>
          <div className="flex items-start justify-between gap-2 border-b border-stone-100 px-3 py-2 dark:border-stone-800">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-stone-900 dark:text-stone-50">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: typoColors[selPoint.typologyCode] ?? SHADOW_COLORS.gray }} aria-hidden />
                {selPoint.code}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{typologyLabel(selPoint.typologyCode)}</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Fermer la fiche"
              onClick={e => { e.stopPropagation(); setSelPointId(null); onSelectPoint?.(null) }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ShadowPhoto url={selPoint.photoUrl} alt={`Photo terrain — ${selPoint.code}`} typology={selPoint.typologyCode} className="h-24 w-full object-cover" />
          <div className="space-y-1.5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <ShadowStatusBadge status={selPoint.status} />
              <span className="tabular-nums">{formatLJ(selPoint.volumeLJ)}</span>
            </div>
            <p className="flex items-center justify-between gap-2">
              <span>Prix constaté</span>
              <span className="font-medium tabular-nums text-foreground">{formatMillimes(selPoint.priceMillimes)}</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span>Perte estimée</span>
              <span className="font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(selPoint.lossTnd)}/mois</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span>Localisation</span>
              <span className="text-right font-medium text-foreground">{selPoint.delegation} · {selPoint.gouvernorat}</span>
            </p>
            {selPoint.nearestStation && (
              <p className="flex items-center justify-between gap-2">
                <span>Station la + proche</span>
                <span className="text-right font-medium text-foreground">
                  {selPoint.nearestStation.name}
                  <span className="ml-1 tabular-nums text-muted-foreground">({Math.round(selPoint.nearestStation.distanceM)} m)</span>
                </span>
              </p>
            )}
            {selPoint.notes && <p className="line-clamp-2 border-t border-stone-100 pt-1.5 italic dark:border-stone-800">« {selPoint.notes} »</p>}
            <p className="text-[10px]">
              Contrôlé {relDateFr(selPoint.lastCheckAt)} · source {selPoint.source === "AGENT" ? "agent terrain" : selPoint.source === "CONTROLEUR" ? "contrôleur" : selPoint.source === "AUDIT" ? "audit" : "citoyen"} · {selPoint.reporter}
            </p>
          </div>
        </div>
      )}

      {/* ---------- Fiche station sélectionnée ---------- */}
      {selStation && !selPoint && (
        <div className="absolute left-2 top-2 z-30 w-56 rounded-lg border border-stone-200 bg-background/97 px-3 py-2 text-[11px] shadow-lg backdrop-blur dark:border-stone-700" role="status">
          <p className="flex items-center gap-1.5 text-sm font-bold text-stone-900 dark:text-stone-50">
            <span className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ backgroundColor: LEVEL_COLORS[selStation.level] }} aria-hidden />
            {selStation.name}
          </p>
          <p className="mt-0.5 text-muted-foreground">{selStation.brandName} · {selStation.gouvernorat}</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{selStation.points} point(s) proche(s)</span>
            <span className="font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(selStation.lossTnd)}/mois</span>
          </p>
        </div>
      )}

      {/* Aide interaction */}
      <p className="pointer-events-none absolute bottom-2 right-2 z-10 hidden rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur sm:block">
        molette = zoom · glisser = déplacer · clic = fiche
      </p>
    </div>
  )
}
