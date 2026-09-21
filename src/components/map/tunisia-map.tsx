'use client'

// CarbuScope — Carte de Tunisie interactive (SVG multi-couches)
// Fonctionnalités : pan/zoom, couches (stations, routes, trafic, zones, projets, parc auto),
// fiche station au clic, outils : mesure de distance, rayon de chalandise, sélection polygone + export.

import * as React from "react"
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import {
  Store, Wind, DoorOpen, CreditCard, Coffee, Droplets, Wrench, Cog, Zap,
  MapPin, Navigation, X, Ruler, Hexagon, Circle as CircleIcon, Trash2, Plus, Minus,
  Maximize, Layers, FileDown, ChevronDown, ChevronRight, Star, Gauge, Clock, ShieldCheck, History, Globe, Loader2, GitCompareArrows,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import type { StationDTO, StationDetail, RoadDTO, ProjectDTO, GovernoratRow, ServiceDTO } from "@/lib/types"
import { SERVICE_LABELS } from "@/lib/types"
import { MAP_W, MAP_H, project, unproject, haversineKm, kmToSvgUnits, svgUnitsToKm, pointInPolygon } from "@/lib/geo"
import { TUNISIA_BORDER, DJERBA, KERKENNAH, CITIES, GOV_CENTERS } from "./tunisia-geo"
import type { OsmBackground } from "./osm-map"

// Fond cartographique réel (Leaflet + tuiles OSM/CARTO) — chargé côté client uniquement
const OSMMap = dynamic(() => import("./osm-map").then(m => m.OSMMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 z-0 flex items-center justify-center bg-secondary/30 backdrop-blur-[2px]">
      <span className="inline-flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du fond cartographique…
      </span>
    </div>
  ),
})

const OSM_BG_LABELS: [OsmBackground, string][] = [
  ["auto", "Automatique (suit le thème)"],
  ["street", "Plan détaillé (Esri)"],
  ["clair", "Clair minimal (Esri)"],
  ["noir", "Nuit (Esri)"],
  ["topo", "Relief (OpenTopoMap)"],
  ["osm", "Plan communautaire OSM"],
]

const OSM_BG_KEYS = new Set<string>(["auto", "street", "clair", "noir", "topo", "osm"])

export const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  boutique: Store, gonflage: Wind, toilettes: DoorOpen, atm: CreditCard, cafe: Coffee,
  lavage: Droplets, vidange: Wrench, atelier: Cog, recharge: Zap,
}

export interface MapLayers {
  stations: boolean
  roads: boolean
  traffic: boolean
  zones: boolean
  projects: boolean
  fleet: boolean
}

export interface TunisiaMapProps {
  stations: StationDTO[]
  ownBrandSlug?: string | null
  selectedCode?: string | null
  onSelect?: (s: StationDTO | null) => void
  onViewDetail?: (s: StationDTO) => void
  layers?: Partial<MapLayers>
  showLayerControl?: boolean
  tools?: boolean
  showLegend?: boolean
  className?: string
  focusCode?: string | null
  fitTo?: StationDTO[] | null
  autoFitOnLoad?: boolean
  govStationCounts?: Record<string, number> | null
  /** Comparateur : épingle/déépingle une station (popup réelle ou schéma) */
  onCompare?: (s: StationDTO) => void
  /** Codes des stations épinglées dans le comparateur */
  compareCodes?: string[]
}

type Tool = "measure" | "radius" | "polygon" | null

interface StaticLayers {
  roads: RoadDTO[]
  projects: ProjectDTO[]
  governorats: GovernoratRow[]
  services: ServiceDTO[]
}

let staticPromise: Promise<StaticLayers> | null = null
function loadStatic(): Promise<StaticLayers> {
  if (!staticPromise) {
    staticPromise = (async () => {
      const safe = async (url: string, key: string) => {
        try {
          const r = await fetch(url)
          if (!r.ok) return []
          const j = await r.json()
          return j[key] ?? []
        } catch { return [] }
      }
      const [roads, projects, governorats, services] = await Promise.all([
        safe("/api/roads", "roads"),
        safe("/api/projects", "projects"),
        safe("/api/governorats", "governorats"),
        safe("/api/services", "services"),
      ])
      return { roads, projects, governorats, services }
    })()
  }
  return staticPromise
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function borderToPath(pts: [number, number][]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${project(p[0], p[1]).x.toFixed(1)} ${project(p[0], p[1]).y.toFixed(1)}`).join(" ") + " Z"
}

const DATE_FR = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d))

export function TunisiaMap({
  stations, ownBrandSlug, selectedCode, onSelect, onViewDetail,
  layers, showLayerControl = true, tools = false, showLegend = true,
  className = "h-[560px]", focusCode, fitTo, autoFitOnLoad = false, govStationCounts,
  onCompare, compareCodes,
}: TunisiaMapProps) {
  const compareSet = useMemo(() => new Set(compareCodes ?? []), [compareCodes])
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const movedRef = useRef(0)

  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [hoverCode, setHoverCode] = useState<string | null>(null)
  const [selCode, setSelCode] = useState<string | null>(selectedCode ?? null)
  const [layerState, setLayerState] = useState<MapLayers>({
    stations: true, roads: true, traffic: false, zones: false, projects: false, fleet: false,
    ...(layers ?? {}),
  })
  const [staticData, setStaticData] = useState<StaticLayers | null>(null)
  const [detail, setDetail] = useState<StationDetail | null>(null)
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Fond cartographique réel (OSM) vs schéma vectoriel — persisté par visiteur.
  // Lecture différée (setTimeout 0) : évite tout écart d'hydratation SSR et les setState synchrones en effet.
  // La persistance n'écrit qu'après la lecture initiale (sinon la valeur par défaut écraserait le choix stocké).
  const [realMap, setRealMap] = useState(true)
  const [osmBg, setOsmBg] = useState<OsmBackground>("auto")
  const [bgPrefsLoaded, setBgPrefsLoaded] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const stored = localStorage.getItem("carbuscope-map-bg")
        setRealMap(stored ? stored === "real" : true) // fond réel activé par défaut
      } catch { /* ignore */ }
      try {
        const b = localStorage.getItem("carbuscope-map-osmbg")
        if (b && OSM_BG_KEYS.has(b)) setOsmBg(b as OsmBackground)
      } catch { /* ignore */ }
      setBgPrefsLoaded(true)
    }, 0)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!bgPrefsLoaded) return
    try { localStorage.setItem("carbuscope-map-bg", realMap ? "real" : "schema") } catch { /* ignore */ }
  }, [realMap, bgPrefsLoaded])
  useEffect(() => {
    if (!bgPrefsLoaded) return
    try { localStorage.setItem("carbuscope-map-osmbg", osmBg) } catch { /* ignore */ }
  }, [osmBg, bgPrefsLoaded])

  // outils
  const [tool, setTool] = useState<Tool>(null)
  const [measurePts, setMeasurePts] = useState<[number, number][]>([])
  const [radiusCenter, setRadiusCenter] = useState<[number, number] | null>(null)
  const [radiusKm, setRadiusKm] = useState(10)
  const [polygonPts, setPolygonPts] = useState<[number, number][]>([])
  const [polygonClosed, setPolygonClosed] = useState(false)

  useEffect(() => { loadStatic().then(setStaticData).catch(() => {}) }, [])

  // ---------- Conversions écran ↔ SVG (letterbox-safe) ----------
  // métriques de conteneur suivies par ResizeObserver (accessibles au rendu)
  const [mstate, setMstate] = useState<{ scale: number; offX: number; offY: number; w: number; h: number }>({
    scale: 0.5, offX: 0, offY: 0, w: 520, h: 1000,
  })

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      const scale = Math.min(r.width / MAP_W, r.height / MAP_H) || 0.5
      setMstate({
        scale,
        offX: (r.width - MAP_W * scale) / 2,
        offY: (r.height - MAP_H * scale) / 2,
        w: r.width,
        h: r.height,
      })
    }
    const raf = requestAnimationFrame(update)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const metrics = useCallback(() => {
    const el = svgRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const scale = Math.min(r.width / MAP_W, r.height / MAP_H)
    const offX = (r.width - MAP_W * scale) / 2
    const offY = (r.height - MAP_H * scale) / 2
    return { scale, offX, offY, rect: r }
  }, [])

  const svgPointFromEvent = useCallback((e: { clientX: number; clientY: number }): [number, number] | null => {
    const m = metrics()
    if (!m) return null
    const sx = (e.clientX - m.rect.left - m.offX) / m.scale
    const sy = (e.clientY - m.rect.top - m.offY) / m.scale
    return [sx, sy]
  }, [metrics])

  const toScreen = useCallback((p: { x: number; y: number }) => ({
    left: mstate.offX + (p.x * view.k + view.x) * mstate.scale,
    top: mstate.offY + (p.y * view.k + view.y) * mstate.scale,
  }), [mstate, view])

  // ---------- Zoom / pan ----------
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

  const fitBounds = useCallback((sts: StationDTO[]) => {
    if (!sts.length) { resetView(); return }
    const pts = sts.map(s => project(s.lng, s.lat))
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
    const bw = Math.max(maxX - minX, 10), bh = Math.max(maxY - minY, 10)
    const k = clamp(Math.min((MAP_W - 80) / bw, (MAP_H - 80) / bh), 1, 6)
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setView({ k, x: MAP_W / 2 - cx * k, y: MAP_H / 2 - cy * k })
  }, [])

  useEffect(() => {
    if (!(autoFitOnLoad && stations.length)) return
    const raf = requestAnimationFrame(() => fitBounds(stations))
    return () => cancelAnimationFrame(raf)
  }, [autoFitOnLoad, stations, fitBounds])

  useEffect(() => {
    if (!fitTo) return
    const raf = requestAnimationFrame(() => fitBounds(fitTo))
    return () => cancelAnimationFrame(raf)
  }, [fitTo, fitBounds])

  const selectStation = useCallback((s: StationDTO | null) => {
    setSelCode(s ? s.code : null)
    setShowHistory(false)
    onSelect?.(s)
  }, [onSelect])

  // ---------- Focus « voir sur la carte » ----------
  useEffect(() => {
    if (!focusCode) return
    const raf = requestAnimationFrame(() => {
      const st = stations.find(s => s.code === focusCode)
      if (st) {
        selectStation(st)
        const p = project(st.lng, st.lat)
        setView({ k: 6, x: MAP_W / 2 - p.x * 6, y: MAP_H / 2 - p.y * 6 })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [focusCode, stations, selectStation])

  // ---------- Détail fiche (dérivé : actif seulement si cohérent avec la sélection) ----------
  const activeDetail = selCode && detailCode === selCode ? detail : null
  useEffect(() => {
    if (!selCode) return
    const st = stations.find(s => s.code === selCode)
    if (!st) return
    if (detailCode === selCode) return
    const ctrl = new AbortController()
    fetch(`/api/stations/${st.id}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: StationDetail | null) => { if (d) { setDetail(d); setDetailCode(selCode) } })
      .catch(() => {})
    return () => ctrl.abort()
  }, [selCode, stations, detailCode])

  // ---------- Drag pan ----------
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
    if (movedRef.current > 3) {
      setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
    }
  }
  const onPointerUp = () => { dragRef.current = null }

  // ---------- Clic fond de carte ----------
  const onBackgroundClick = (e: React.MouseEvent) => {
    if (movedRef.current > 3) return
    const pt = svgPointFromEvent(e)
    if (!pt) return
    if (tool === "measure") { setMeasurePts(p => [...p, pt]); return }
    if (tool === "radius") { setRadiusCenter(pt); return }
    if (tool === "polygon" && !polygonClosed) { setPolygonPts(p => [...p, pt]); return }
    selectStation(null)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === "polygon" && polygonPts.length >= 3) { setPolygonClosed(true); return }
    const pt = svgPointFromEvent(e)
    if (!pt) return
    setView(v => {
      const k = clamp(v.k * 1.7, 1, 14)
      const mx = (pt[0] - v.x) / v.k, my = (pt[1] - v.y) / v.k
      return { k, x: pt[0] - mx * k, y: pt[1] - my * k }
    })
  }

  // ---------- Sélections par outil ----------
  const insideRadius = useMemo(() => {
    if (!radiusCenter || tool !== "radius") return null
    const c = unproject(radiusCenter[0], radiusCenter[1])
    const set = new Set<string>()
    for (const s of stations) {
      if (haversineKm(c.lat, c.lng, s.lat, s.lng) <= radiusKm) set.add(s.code)
    }
    return set
  }, [radiusCenter, radiusKm, stations, tool])

  const insidePolygon = useMemo(() => {
    if (tool !== "polygon" || polygonPts.length < 3 || !polygonClosed) return null
    const poly = polygonPts.map(p => { const u = unproject(p[0], p[1]); return [u.lng, u.lat] as [number, number] })
    const set = new Set<string>()
    for (const s of stations) if (pointInPolygon(s.lng, s.lat, poly)) set.add(s.code)
    return set
  }, [polygonPts, polygonClosed, stations, tool])

  const exportSelection = (format: "csv" | "geojson") => {
    const set = tool === "polygon" ? insidePolygon : insideRadius
    if (!set) return
    const selected = stations.filter(s => set.has(s.code))
    if (!selected.length) { toast.info("Aucune station dans la sélection."); return }
    let blob: Blob
    let ext: string
    if (format === "csv") {
      const header = "code;nom;enseigne;gouvernorat;delegation;statut;trafic;lat;lng;services\n"
      const rows = selected.map(s =>
        [s.code, s.name, s.brandName, s.gouvernorat, s.delegation, s.status, s.traffic, s.lat, s.lng, s.services.join("|")].join(";")
      ).join("\n")
      blob = new Blob(["\ufeff" + header + rows], { type: "text/csv;charset=utf-8" })
      ext = "csv"
    } else {
      const fc = {
        type: "FeatureCollection",
        features: selected.map(s => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: { code: s.code, nom: s.name, enseigne: s.brandName, gouvernorat: s.gouvernorat, statut: s.status, trafic: s.traffic, services: s.services },
        })),
      }
      blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" })
      ext = "geojson"
    }
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `carbuscope-selection.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(`${selected.length} stations exportées (${ext.toUpperCase()})`)
  }

  const clearTools = () => {
    setTool(null); setMeasurePts([]); setRadiusCenter(null); setPolygonPts([]); setPolygonClosed(false)
  }

  const measureTotal = useMemo(() => {
    if (measurePts.length < 2) return 0
    let t = 0
    for (let i = 1; i < measurePts.length; i++) {
      const a = unproject(measurePts[i - 1][0], measurePts[i - 1][1])
      const b = unproject(measurePts[i][0], measurePts[i][1])
      t += haversineKm(a.lat, a.lng, b.lat, b.lng)
    }
    return t
  }, [measurePts])

  // ---------- Rendu stations (mémoïsé) ----------
  const stationNodes = useMemo(() => {
    return stations.map(s => {
      const p = project(s.lng, s.lat)
      const isOwn = ownBrandSlug && s.brandSlug === ownBrandSlug
      const isSel = s.code === selCode
      const isHover = s.code === hoverCode
      const inRad = insideRadius?.has(s.code)
      const inPoly = insidePolygon?.has(s.code)
      const isPinned = compareSet.has(s.code)
      const highlighted = isOwn || isSel || isHover || inRad || inPoly || isPinned
      const r = isOwn ? 3.6 : 2.7
      if (s.status === "CLOSED") {
        return (
          <g key={s.id} onClick={(e) => { e.stopPropagation(); if (movedRef.current <= 3) selectStation(s) }}
             onMouseEnter={() => setHoverCode(s.code)} onMouseLeave={() => setHoverCode(null)} className="cursor-pointer">
            {isPinned && <circle cx={p.x} cy={p.y} r={6.4} fill="none" stroke="#059669" strokeWidth={1.5} className="pointer-events-none" />}
            <circle cx={p.x} cy={p.y} r={3.4} fill="#9ca3af" stroke={isPinned ? "#059669" : "#6b7280"} strokeWidth={isPinned ? 2 : 1} />
            <line x1={p.x - 2} y1={p.y - 2} x2={p.x + 2} y2={p.y + 2} stroke="#f8fafc" strokeWidth={0.9} />
            <line x1={p.x - 2} y1={p.y + 2} x2={p.x + 2} y2={p.y - 2} stroke="#f8fafc" strokeWidth={0.9} />
          </g>
        )
      }
      return (
        <g key={s.id} onClick={(e) => { e.stopPropagation(); if (movedRef.current <= 3) selectStation(s) }}
           onMouseEnter={() => setHoverCode(s.code)} onMouseLeave={() => setHoverCode(null)} className="cursor-pointer">
          {isSel && <circle cx={p.x} cy={p.y} r={8} fill={s.brandColor} opacity={0.25} className="animate-ping-slow" />}
          {isPinned && <circle cx={p.x} cy={p.y} r={r + 3.4} fill="none" stroke="#059669" strokeWidth={1.5} className="pointer-events-none" />}
          {s.status === "PROJECT" ? (
            <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={isPinned ? "#059669" : s.brandColor} strokeWidth={isPinned ? 2.2 : 1.6} strokeDasharray="2 1.6" />
          ) : (
            <circle cx={p.x} cy={p.y} r={r} fill={s.brandColor} opacity={highlighted ? 1 : 0.72}
              stroke={isPinned ? "#059669" : s.status === "RENOVATION" ? "#d97706" : "white"} strokeWidth={isPinned ? 2.2 : s.status === "RENOVATION" ? 1.6 : isSel ? 1.8 : 0.7} />
          )}
        </g>
      )
    })
  }, [stations, ownBrandSlug, selCode, hoverCode, insideRadius, insidePolygon, selectStation, compareSet])

  // ---------- Popup position ----------
  const selectedStation = stations.find(s => s.code === selCode) ?? null
  const popupPos = useMemo(() => {
    if (!selectedStation) return null
    const p = project(selectedStation.lng, selectedStation.lat)
    return toScreen(p)
  }, [selectedStation, toScreen])

  const roads = staticData?.roads ?? []
  const projects = staticData?.projects ?? []
  const governorats = staticData?.governorats ?? []
  const govCountFallback = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of stations) m[s.gouvernorat] = (m[s.gouvernorat] ?? 0) + 1
    return m
  }, [stations])
  const govCountMap = govStationCounts ?? govCountFallback

  const transform = `translate(${view.x} ${view.y}) scale(${view.k})`
  const invK = 1 / view.k

  return (
    <div ref={wrapRef} className={`relative overflow-hidden rounded-xl border bg-[radial-gradient(ellipse_at_center,var(--secondary)_0%,var(--background)_75%)] ${className}`}>
      {realMap ? (
        <OSMMap
          stations={stations}
          roads={roads}
          projects={projects}
          layers={{ stations: layerState.stations, roads: layerState.roads, traffic: layerState.traffic, projects: layerState.projects }}
          ownBrandSlug={ownBrandSlug}
          selectedCode={selCode}
          onSelect={selectStation}
          onViewDetail={(s) => onViewDetail?.(s)}
          background={osmBg}
          focusCode={focusCode}
          fitTo={fitTo}
          onCompare={onCompare}
          compareCodes={compareCodes}
          detail={activeDetail}
        />
      ) : (
      <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onClick={onBackgroundClick} onDoubleClick={onDoubleClick}
        role="img" aria-label="Carte des stations-service de Tunisie">

        <defs>
          <filter id="heat-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <g transform={transform}>
          {/* Pays */}
          <path d={borderToPath(TUNISIA_BORDER)} className="map-land" stroke="var(--border)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={borderToPath(DJERBA)} className="map-land" stroke="var(--border)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <path d={borderToPath(KERKENNAH)} className="map-land" stroke="var(--border)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />

          {/* Villes */}
          <g>
            {CITIES.map(([name, lng, lat, major]) => {
              const p = project(lng, lat)
              return (
                <g key={name} style={{ display: view.k > 1.35 || major ? undefined : "none" }}>
                  <circle cx={p.x} cy={p.y} r={major ? 2.4 : 1.6} className="map-city" />
                  <text x={p.x + 4} y={p.y + 3} fontSize={major ? 10 : 8.5} className="map-city-label" fontWeight={major ? 600 : 400}>{name}</text>
                </g>
              )
            })}
          </g>

          {/* Couche : zones administratives */}
          {layerState.zones && (
            <g>
              {governorats.map(g => {
                const c = GOV_CENTERS[g.name]
                if (!c) return null
                const p = project(c[0], c[1])
                const n = govCountMap[g.name] ?? g.stations ?? 0
                const w = 8 + Math.max(g.name.length, String(n).length) * 4.6
                return (
                  <g key={g.name}>
                    <rect x={p.x - w / 2} y={p.y - 9} width={w} height={17} rx={8.5} className="map-zone-badge" />
                    <text x={p.x} y={p.y + 2.5} textAnchor="middle" fontSize={8.5} className="map-zone-label">{g.name} · {n}</text>
                  </g>
                )
              })}
            </g>
          )}

          {/* Couche : densité parc automobile */}
          {layerState.fleet && (
            <g>
              {governorats.map(g => {
                const c = GOV_CENTERS[g.name]
                if (!c) return null
                const p = project(c[0], c[1])
                const r = Math.sqrt(g.vehicles) / 28
                return <circle key={g.name} cx={p.x} cy={p.y} r={r} fill="#d97706" opacity={0.14} stroke="#d97706" strokeWidth={0.6} strokeOpacity={0.4} />
              })}
            </g>
          )}

          {/* Couche : axes routiers */}
          {layerState.roads && roads.map(rd => {
            const pts = rd.segments.map(s => project(s[0], s[1]))
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
            const mid = pts[Math.floor(pts.length / 2)]
            const color = rd.type === "AUTOROUTE" ? "#d97706" : rd.type === "RN" ? "#e07856" : "#9ca3af"
            const w = rd.type === "AUTOROUTE" ? 2.6 : rd.type === "RN" ? 1.7 : 1.2
            return (
              <g key={rd.id}>
                <path d={d} fill="none" stroke={color} strokeWidth={w} opacity={0.85} strokeLinecap="round" />
                <text x={mid.x + 3} y={mid.y - 3} fontSize={8.5} fontWeight={700} fill={color} opacity={0.95}>{rd.code}</text>
              </g>
            )
          })}

          {/* Couche : heatmap trafic */}
          {layerState.traffic && roads.map(rd => {
            const circles: React.ReactNode[] = []
            rd.segments.slice(0, -1).forEach((s, i) => {
              const n = rd.segments[i + 1]
              for (let t = 0.25; t < 1; t += 0.25) {
                const lng = s[0] + (n[0] - s[0]) * t, lat = s[1] + (n[1] - s[1]) * t
                const p = project(lng, lat)
                circles.push(<circle key={`${rd.id}-${i}-${t}`} cx={p.x} cy={p.y} r={(rd.tmj / 1400) * 2.6} fill={rd.tmj > 15000 ? "#dc2626" : rd.tmj > 9000 ? "#ea580c" : "#d9a514"} opacity={0.3} filter="url(#heat-blur)" />)
              }
            })
            return <g key={`t-${rd.id}`}>{circles}</g>
          })}

          {/* Couche : projets d'infrastructure */}
          {layerState.projects && projects.map(pr => {
            const p = project(pr.lng, pr.lat)
            const color = pr.status === "CONSTRUCTION" ? "#059669" : "#9333ea"
            return (
              <g key={pr.id} className="cursor-pointer">
                <rect x={p.x - 3.4} y={p.y - 3.4} width={6.8} height={6.8} transform={`rotate(45 ${p.x} ${p.y})`} fill={color} opacity={0.9} stroke="white" strokeWidth={0.7} />
                <title>{`${pr.name} — ${pr.status === "CONSTRUCTION" ? "En construction" : "Planifié"} — ${pr.budget} — horizon ${pr.targetDate}`}</title>
              </g>
            )
          })}

          {/* Outil : rayon de chalandise */}
          {tool === "radius" && radiusCenter && (
            <g>
              <circle cx={radiusCenter[0]} cy={radiusCenter[1]} r={kmToSvgUnits(radiusKm)} fill="#d97706" opacity={0.07} stroke="#d97706" strokeWidth={1.4 / view.k} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <circle cx={radiusCenter[0]} cy={radiusCenter[1]} r={3} fill="#d97706" />
              <text x={radiusCenter[0] + 5} y={radiusCenter[1] - 5} fontSize={11 * invK} fontWeight={600} fill="#d97706">
                {radiusKm} km
              </text>
            </g>
          )}

          {/* Outil : mesure de distance */}
          {measurePts.length > 0 && (
            <g>
              <path d={measurePts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ")}
                fill="none" stroke="#dc2626" strokeWidth={1.4} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              {measurePts.map((p, i) => (
                <g key={i}>
                  <circle cx={p[0]} cy={p[1]} r={2.6} fill="#dc2626" stroke="white" strokeWidth={0.8} />
                  {i > 0 && (() => {
                    const a = unproject(measurePts[i - 1][0], measurePts[i - 1][1])
                    const b = unproject(p[0], p[1])
                    const km = haversineKm(a.lat, a.lng, b.lat, b.lng)
                    return (
                      <text x={(measurePts[i - 1][0] + p[0]) / 2 + 4 * invK} y={(measurePts[i - 1][1] + p[1]) / 2 - 4 * invK}
                        fontSize={9 * invK} fontWeight={600} fill="#dc2626" className="map-tool-label">
                        {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
                      </text>
                    )
                  })()}
                </g>
              ))}
            </g>
          )}

          {/* Outil : polygone */}
          {tool === "polygon" && polygonPts.length > 0 && (
            <g>
              <path d={polygonPts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]} ${p[1]}`).join(" ") + (polygonClosed ? " Z" : "")}
                fill={polygonClosed ? "#059669" : "none"} fillOpacity={0.08} stroke="#059669" strokeWidth={1.5}
                strokeDasharray={polygonClosed ? undefined : "5 4"} vectorEffect="non-scaling-stroke" />
              {polygonPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill="#059669" stroke="white" strokeWidth={0.8} />)}
            </g>
          )}

          {/* Couche : stations */}
          {layerState.stations && <g>{stationNodes}</g>}
        </g>
      </svg>
      )}

      {/* ---------- Overlays HTML ---------- */}

      {/* Popup fiche station (mode schéma) */}
      {!realMap && selectedStation && popupPos && (
        <StationPopup
          station={selectedStation}
          detail={activeDetail}
          left={popupPos.left}
          top={popupPos.top}
          wrapW={mstate.w}
          onClose={() => selectStation(null)}
          onViewDetail={() => onViewDetail?.(selectedStation)}
          onCompare={onCompare ? () => onCompare(selectedStation) : undefined}
          isPinned={compareSet.has(selectedStation.code)}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
        />
      )}

      {/* Tooltip survol (mode schéma) */}
      {!realMap && hoverCode && hoverCode !== selCode && (() => {
        const st = stations.find(s => s.code === hoverCode)
        if (!st) return null
        const p = project(st.lng, st.lat)
        const sp = toScreen(p)
        return (
          <div className="pointer-events-none absolute z-20 -translate-y-full rounded-md border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground shadow-lg"
            style={{ left: clamp(sp.left, 8, mstate.w - 180), top: Math.max(sp.top - 8, 18) }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: st.brandColor }} />
              {st.name}
            </span>
            <span className="ml-2 text-muted-foreground">{st.traffic > 0 ? `${new Intl.NumberFormat("fr-FR").format(st.traffic)} véh/j` : st.status === "PROJECT" ? "Projet" : "—"}</span>
          </div>
        )
      })()}

      {/* Contrôles zoom + bascule fond réel */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        {!realMap && (
          <div className="flex flex-col rounded-lg border bg-background/85 p-0.5 shadow-sm backdrop-blur">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomBy(1.35)} aria-label="Zoom avant"><Plus className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom arrière"><Minus className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetView} aria-label="Réinitialiser la vue"><Maximize className="h-4 w-4" /></Button>
          </div>
        )}
        <Button
          variant={realMap ? "secondary" : "outline"}
          size="icon"
          className="h-8 w-8 rounded-lg shadow-sm"
          onClick={() => { setRealMap(v => !v); toast(realMap ? "Fond schéma vectoriel activé" : "Fond cartographique réel OpenStreetMap activé") }}
          aria-pressed={realMap}
          aria-label="Basculer entre fond cartographique réel et schéma"
          title={realMap ? "Revenir au schéma vectoriel" : "Afficher le fond cartographique réel (OSM)"}>
          <Globe className="h-4 w-4" />
        </Button>
        {showLayerControl && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg shadow-sm" aria-label="Couches cartographiques"><Layers className="h-4 w-4" /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Couches cartographiques</p>
              {([
                ["stations", "Stations-service"],
                ["roads", "Axes routiers (A1–A4, RN, GP)"],
                ["traffic", "Densité de trafic (heatmap)"],
                ["zones", "Zones administratives"],
                ["projects", "Projets d'infrastructure"],
                ["fleet", "Parc automobile par zone"],
              ] as [keyof MapLayers, string][]).map(([key, label]) => {
                const svgOnly = realMap && (key === "zones" || key === "fleet")
                return (
                  <label key={key}
                    className={`flex items-center justify-between rounded px-1 py-1.5 text-sm ${svgOnly ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-accent"}`}
                    title={svgOnly ? "Disponible en mode schéma" : undefined}>
                    {label}
                    <Switch checked={layerState[key]} disabled={svgOnly} onCheckedChange={v => setLayerState(s => ({ ...s, [key]: v }))} />
                  </label>
                )
              })}
              {realMap && (
                <div className="mt-2 space-y-1 border-t pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fond cartographique</p>
                  {OSM_BG_LABELS.map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                    <span
                      role="radio"
                      aria-checked={osmBg === key}
                      tabIndex={0}
                      onClick={() => setOsmBg(key)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOsmBg(key) } }}
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${osmBg === key ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                    <span onClick={() => setOsmBg(key)}>{label}</span>
                  </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Barre d'outils d'analyse spatiale (mode schéma) */}
      {tools && !realMap && (
        <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5">
          <div className="flex gap-1 rounded-lg border bg-background/85 p-1 shadow-sm backdrop-blur">
            <Button variant={tool === "measure" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" title="Mesure de distance"
              onClick={() => { setTool(tool === "measure" ? null : "measure"); setMeasurePts([]) }} aria-label="Mesure de distance">
              <Ruler className="h-4 w-4" />
            </Button>
            <Button variant={tool === "radius" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" title="Rayon de chalandise"
              onClick={() => { setTool(tool === "radius" ? null : "radius"); setRadiusCenter(null) }} aria-label="Rayon de chalandise">
              <CircleIcon className="h-4 w-4" />
            </Button>
            <Button variant={tool === "polygon" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" title="Sélection par polygone"
              onClick={() => { setTool(tool === "polygon" ? null : "polygon"); setPolygonPts([]); setPolygonClosed(false) }} aria-label="Sélection par polygone">
              <Hexagon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Effacer" onClick={clearTools} aria-label="Effacer les outils">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {tool === "measure" && (
            <div className="rounded-lg border bg-background/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
              <span className="font-medium">Cliquez pour ajouter des points</span>
              {measurePts.length >= 2 && <span className="ml-2 font-bold text-destructive">{measureTotal < 1 ? `${Math.round(measureTotal * 1000)} m` : `${measureTotal.toFixed(1)} km`}</span>}
            </div>
          )}
          {tool === "radius" && (
            <div className="flex items-center gap-2 rounded-lg border bg-background/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
              <span className="font-medium whitespace-nowrap">Rayon {radiusKm} km</span>
              <Slider value={[radiusKm]} min={2} max={60} step={1} onValueChange={v => setRadiusKm(v[0])} className="w-28" />
              {insideRadius && <Badge variant="secondary">{insideRadius.size} st.</Badge>}
              {insideRadius && insideRadius.size > 0 && (
                <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => exportSelection("csv")}>
                  <FileDown className="mr-1 h-3 w-3" /> CSV
                </Button>
              )}
            </div>
          )}
          {tool === "polygon" && (
            <div className="flex items-center gap-2 rounded-lg border bg-background/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
              {!polygonClosed ? (
                <>
                  <span className="font-medium">Cliquez les sommets, double-clic pour fermer</span>
                  {polygonPts.length >= 3 && (
                    <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setPolygonClosed(true)}>Fermer</Button>
                  )}
                </>
              ) : (
                <>
                  <Badge variant="secondary">{insidePolygon?.size ?? 0} stations</Badge>
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => exportSelection("csv")}><FileDown className="mr-1 h-3 w-3" />CSV</Button>
                  <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => exportSelection("geojson")}><FileDown className="mr-1 h-3 w-3" />GeoJSON</Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Légende */}
      {showLegend && (
        <div className="absolute bottom-3 right-3 z-10 w-[196px] rounded-lg border bg-background/90 p-2.5 text-[10px] shadow-md backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b pb-1">
            <p className="font-semibold uppercase tracking-wide text-muted-foreground">Enseignes</p>
            <p className="shrink-0 tabular-nums text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(stations.length)} st.</p>
          </div>
          <div className="grid grid-cols-1 gap-x-2 gap-y-0.5">
            {brandLegend(stations, ownBrandSlug).map(([name, color, count]) => (
              <span key={name} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>
              </span>
            ))}
          </div>
          <div className="mt-1.5 space-y-0.5 border-t pt-1 text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full border border-amber-500 bg-transparent" /> Rénovation</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full border border-dashed" /> Projet</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> Fermée</span>
          </div>
        </div>
      )}
    </div>
  )
}

function brandLegend(stations: StationDTO[], ownSlug?: string | null): [string, string, number][] {
  const m = new Map<string, [string, number]>()
  for (const s of stations) {
    const cur = m.get(s.brandName)
    m.set(s.brandName, [s.brandColor, (cur?.[1] ?? 0) + 1])
  }
  return [...m.entries()]
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(0, 8)
    .map(([name, [color, count]]) => [ownSlug && stations.find(s => s.brandName === name)?.brandSlug === ownSlug ? `${name} (moi)` : name, color, count])
}

// ---------------- Popup fiche station (A.3.3) ----------------

function StationPopup({
  station, detail, left, top, wrapW, onClose, onViewDetail, onCompare, isPinned, showHistory, setShowHistory,
}: {
  station: StationDTO
  detail: StationDetail | null
  left: number
  top: number
  wrapW: number
  onClose: () => void
  onViewDetail: () => void
  onCompare?: () => void
  isPinned: boolean
  showHistory: boolean
  setShowHistory: (v: boolean) => void
}) {
  const W = 320
  const flip = left + W + 24 > wrapW
  const x = flip ? left - W - 16 : left + 16
  const y = clamp(top - 140, 8, 10000)
  const nearby = detail?.nearby?.slice(0, 3) ?? []

  return (
    <div className="absolute z-30 max-h-[92%] w-80 overflow-hidden rounded-xl border bg-background shadow-2xl"
      style={{ left: x, top: y }} role="dialog" aria-label={`Fiche station ${station.name}`}>
      <div className="flex items-start justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: station.brandColor }} />
            <p className="truncate text-sm font-semibold">{station.name}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">{station.brandName} · {station.code}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose} aria-label="Fermer"><X className="h-3.5 w-3.5" /></Button>
      </div>

      <ScrollArea className="max-h-[380px]">
        <div className="space-y-2.5 p-3">
          {station.photoUrl && (
            <img src={station.photoUrl} alt={`Photo ${station.name}`} className="h-28 w-full rounded-lg border object-cover" />
          )}

          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{station.address}</p>
            <p className="font-mono text-[10px]">GPS {station.lat.toFixed(4)}, {station.lng.toFixed(4)}</p>
            <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0" />
              {station.open24 ? "Ouverte 24h/24" : station.open7j ? "7j/7" : "Horaires de jour"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={station.status === "ACTIVE" ? "default" : station.status === "RENOVATION" ? "secondary" : "outline"}
              className={station.status === "RENOVATION" ? "border-amber-500 text-amber-600" : station.status === "PROJECT" ? "border-dashed" : ""}>
              {station.status === "ACTIVE" ? "Active" : station.status === "RENOVATION" ? "Rénovation" : station.status === "PROJECT" ? "Projet" : "Fermée"}
            </Badge>
            {station.traffic > 0 && (
              <Badge variant="outline" className="gap-1"><Gauge className="h-3 w-3" />{new Intl.NumberFormat("fr-FR").format(station.traffic)} véh/j</Badge>
            )}
            {station.rating > 0 && (
              <Badge variant="outline" className="gap-1"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />{station.rating.toFixed(1)} ({station.reviewsCount})</Badge>
            )}
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
            <div className="flex flex-wrap gap-1">
              {station.services.map(sl => {
                const Icon = SERVICE_ICONS[sl]
                return (
                  <span key={sl} title={SERVICE_LABELS[sl] ?? sl} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10px]">
                    {Icon && <Icon className="h-3 w-3" />}{SERVICE_LABELS[sl] ?? sl}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-2 text-[11px]">
            <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Dernière vérification : {DATE_FR(station.lastVerified)}
            </p>
            <p className="ml-5 text-muted-foreground">{station.verifiedBy} · {detail ? "fiche certifiée" : "source terrain"}</p>
          </div>

          {detail && detail.nearby.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Concurrents proches</p>
              <div className="space-y-1">
                {nearby.map(n => (
                  <div key={n.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: n.brandColor }} />
                      <span className="truncate">{n.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{n.distanceKm.toFixed(1)} km</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail && detail.history.length > 0 && (
            <div className="rounded-lg border">
              <button className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium" onClick={() => setShowHistory(!showHistory)}>
                <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Historique ({detail.history.length})</span>
                {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showHistory && (
                <div className="max-h-28 space-y-1 overflow-y-auto border-t px-2 py-1.5 text-[10px]">
                  {detail.history.map(h => (
                    <p key={h.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{h.field}</span> : {h.oldValue} → {h.newValue}
                      <span className="ml-1">({h.author}, {DATE_FR(h.createdAt)})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t p-2">
        <Button size="sm" className="h-7 flex-1 text-xs" onClick={onViewDetail}>Fiche complète</Button>
        {onCompare ? (
          <Button
            size="sm" variant={isPinned ? "secondary" : "outline"}
            aria-pressed={isPinned}
            className={`h-7 flex-1 gap-1 text-xs ${isPinned ? "border border-emerald-500/50 text-emerald-700 dark:text-emerald-400" : ""}`}
            onClick={onCompare}
          >
            <GitCompareArrows className="h-3 w-3" aria-hidden />
            {isPinned ? "Retirer du comparateur" : "Comparer"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => toast.info("Itinéraire lancé (démo)", { description: "Intégration Google Maps / Waze sur l'app mobile B2C." })}>
            <Navigation className="mr-1 h-3 w-3" />Itinéraire
          </Button>
        )}
      </div>
    </div>
  )
}
