"use client"

// Shadow Market — fond cartographique RÉEL (Leaflet + tuiles OpenStreetMap).
// Remplace l'ancienne carte SVG géométrique : mêmes couches, mêmes props, mais
// affichées sur un vrai fond de plan OSM (commutateur : plan OSM, nuit, clair,
// plan détaillé Esri, relief OpenTopoMap — suit le thème en « auto »).
//   • points informels colorés par typologie (cercles canvas, rayon par zoom)
//   • stations menacées = losanges par niveau (divIcon)
//   • heatmap perte / gouvernorat (halos proportionnels)
//   • zones rouges, rayons de cannibalisation (cercles en mètres + libellés)
//   • tracé d'axe routier (polyligne + code)
//   • fiche point / station au clic, filtre typologies en chips, export CSV
// Monté UNIQUEMENT côté client via dynamic(..., { ssr: false }) depuis
// shadow-map.tsx (pattern tunisia-map → osm-map / hub-carte → hub-map).

import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import * as L from "leaflet"
import "@/lib/leaflet-canvas-guard"
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Tooltip, Marker, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "next-themes"
import { Plus, Minus, Maximize, FileDown, X, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ShadowGovLossDTO, ShadowMapStationDTO, ShadowPointDTO, ShadowRedZoneDTO } from "@/lib/types"
import { haversineKm, kmToSvgUnits } from "@/lib/geo"
import { GOV_CENTERS } from "@/components/map/tunisia-geo"
import {
  formatTnd, formatLJ, formatMillimes, relDateFr, typologyLabel,
  SHADOW_COLORS, LEVEL_COLORS, ShadowPhoto, ShadowStatusBadge,
} from "@/components/shadow/shadow-shared"
import { downloadPointsCsv } from "./shadow-cart-utils"

// ---------------------------------------------------------------------------
// Props (interface publique re-exportée par shadow-map.tsx)
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
  /** Centre la carte (vol) sur la cible. Référence stable recommandée. */
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

// ---------------------------------------------------------------------------
// Constantes cartographiques
// ---------------------------------------------------------------------------

// Tunisie : lat 30.2→37.6, lng 7.5→11.9 (marges incluses — osm-map.tsx).
const TUNISIA_BOUNDS: L.LatLngBoundsExpression = [[30.1, 7.4], [37.7, 11.95]]
const MAX_BOUNDS: L.LatLngBoundsExpression = [[27.5, 4.5], [41.0, 15.0]]

export type ShadowBackground = "auto" | "osm" | "nuit" | "clair" | "street" | "topo"

const TILES: Record<Exclude<ShadowBackground, "auto">, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  // Plan communautaire OSM — le fond « réel » demandé.
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
    maxZoom: 19,
  },
  // Nuit : Dark Matter (CARTO) — données OpenStreetMap, style sombre.
  nuit: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    maxZoom: 20,
    subdomains: "abcd",
  },
  // Clair : Positron (CARTO) — données OpenStreetMap, style minimal clair.
  clair: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
    maxZoom: 20,
    subdomains: "abcd",
  },
  // Plan détaillé (Esri) — fond riche, sources Esri/HERE/Garmin + OSM.
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tuiles &copy; Esri — Sources : Esri, HERE, Garmin, contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxZoom: 19,
  },
  // Relief : OpenTopoMap (SRTM + OSM).
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs, SRTM · style <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
    subdomains: "abc",
  },
}

const BG_LABELS: [ShadowBackground, string][] = [
  ["auto", "Automatique (suit le thème)"],
  ["osm", "Plan OSM (communautaire)"],
  ["street", "Plan détaillé (Esri)"],
  ["clair", "Clair minimal (CARTO)"],
  ["nuit", "Nuit (CARTO)"],
  ["topo", "Relief (OpenTopoMap)"],
]

const RING_COLORS = [SHADOW_COLORS.red, SHADOW_COLORS.orange, SHADOW_COLORS.yellow]

const ROAD_STYLES: Record<string, { color: string; weight: number }> = {
  AUTOROUTE: { color: "#d97706", weight: 3.2 },
  RN: { color: "#e07856", weight: 2.2 },
  GP: { color: "#9ca3af", weight: 1.5 },
}

/** Couleurs typologies de repli (miroir du catalogue seedé). */
const TYPO_FALLBACK: Record<string, string> = {
  BIDONS: "#FF9800", KIOSQUE: "#FFC107", CAMION_CITERNE: "#E53935",
  STATION_PIRATE: "#B71C1C", GARAGE: "#FF7043", EPICERIE: "#9E9E9E",
}

/** Conversion unités SVG (ancienne carte géométrique) → mètres réels. */
const SVG_KM = kmToSvgUnits(1) // unités SVG par km
const svgUnitsToMeters = (units: number) => (units / SVG_KM) * 1000

/** Degrés ↔ mètres (approximation locale Tunisie, lat ≈ 34°). */
const M_PER_DEG_LAT = 111_320
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

/** Libellé permanent sur la carte (Marker + divIcon non interactif).
 *  react-leaflet exige un calque parent pour Tooltip : les libellés fixes
 *  passent donc par un marqueur texte stylé (pointer-events none). */
function MapLabel({ position, text, color, bold = true }: {
  position: [number, number]
  text: string
  color: string
  bold?: boolean
}) {
  const icon = useMemo(
    () => L.divIcon({
      className: "shadow-map-label",
      html: `<span style="color:${color};${bold ? "font-weight:700;" : ""}">${text}</span>`,
    }),
    [text, color, bold]
  )
  return <Marker position={position} icon={icon} interactive={false} keyboard={false} />
}

/** Rayon des points par cran de zoom Leaflet (6 = Tunisie entière). */
function pointRadiusFor(zoom: number, selected: boolean): number {
  const base = zoom <= 6 ? 3.2 : zoom <= 8 ? 4 : zoom <= 10 ? 5 : zoom <= 12 ? 5.5 : 6.5
  return base + (selected ? 2.5 : 0)
}

/** Losange HTML (station menacée) — divIcon, taille en px, niveau coloré. */
function stationDiamond(color: string, selected: boolean, dim: boolean): L.DivIcon {
  const box = selected ? 26 : 18
  const diamond = 9
  const ring = selected
    ? `<div style="position:absolute;inset:0;border-radius:9999px;border:1.5px dashed ${SHADOW_COLORS.blue};"></div>`
    : ""
  return L.divIcon({
    className: "shadow-station-diamond", // sans le style par défaut de Leaflet
    html: `<div style="position:relative;width:${box}px;height:${box}px;opacity:${dim ? 0.85 : 1}">
      ${ring}
      <div style="position:absolute;left:50%;top:50%;width:${diamond}px;height:${diamond}px;transform:translate(-50%,-50%) rotate(45deg);background:${color};border:1px solid #ffffff;box-shadow:0 0 2px rgba(0,0,0,.35);"></div>
    </div>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  })
}

// ---------------------------------------------------------------------------
// Effets carte : cadrage, focus, zoom suivi, désélection au clic fond
// ---------------------------------------------------------------------------

function ShadowMapEffects({
  focusOn, onSelectPoint, onSelectStation, onZoom,
}: {
  focusOn: ShadowFocusTarget | null
  onSelectPoint?: (p: ShadowPointDTO | null) => void
  onSelectStation?: (s: ShadowMapStationDTO | null) => void
  onZoom: (z: number) => void
}) {
  const map = useMap()
  const firstRun = useRef(true)

  // L'attribution passe en bas-droite (la légende occupe le bas-gauche).
  useEffect(() => {
    map.attributionControl?.setPosition("bottomright")
  }, [map])

  // Cadrage initial : toute la Tunisie.
  useEffect(() => {
    map.fitBounds(L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[]), { padding: [12, 12] })
    onZoom(map.getZoom())
    // onZoom (setZoom) est stable — déclencheurs voulus : montage uniquement.
  }, [map])

  // Suivi du zoom (rayon des points adapté au cran — pas à chaque pixel).
  useEffect(() => {
    const onZoomEnd = () => onZoom(map.getZoom())
    map.on("zoomend", onZoomEnd)
    return () => { map.off("zoomend", onZoomEnd) }
  }, [map, onZoom])

  // Focus externe (gouvernorat, station, zone…) : vol vers l'emprise demandée.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      if (!focusOn) return // le cadrage national initial suffit
    }
    if (!focusOn) {
      map.flyToBounds(L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[]), { padding: [12, 12], duration: 0.8 })
      return
    }
    const halfLat = focusOn.km * 1000 / M_PER_DEG_LAT
    const halfLng = (focusOn.km * 1000) / mPerDegLng(focusOn.lat)
    const bounds = L.latLngBounds(
      [focusOn.lat - halfLat, focusOn.lng - halfLng],
      [focusOn.lat + halfLat, focusOn.lng + halfLng],
    )
    map.flyToBounds(bounds, { padding: [46, 46], duration: 0.8 })
  }, [map, focusOn])

  // Clic sur le fond (hors marqueur) → désélection.
  useEffect(() => {
    const clear = () => { onSelectPoint?.(null); onSelectStation?.(null) }
    map.on("click", clear)
    return () => { map.off("click", clear) }
  }, [map, onSelectPoint, onSelectStation])

  return null
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function ShadowMapLeaflet({
  points, stations, redZones, govHeat, showGovHeat, typologies,
  focusOn, stationRadii, roadTrace, compact = false,
  className, onSelectPoint, onSelectStation, csvContext,
}: ShadowMapProps) {
  const { resolvedTheme } = useTheme()
  const mapRef = useRef<L.Map | null>(null)
  const [zoom, setZoom] = useState(6)
  const [selPointId, setSelPointId] = useState<string | null>(null)
  const [selStationCode, setSelStationCode] = useState<string | null>(null)
  const [offTypo, setOffTypo] = useState<string[]>([])
  const [bg, setBg] = useState<ShadowBackground>("auto")

  // ---------- Fond : « auto » suit le thème (OSM jour / nuit CARTO) ----------
  const bgKey: Exclude<ShadowBackground, "auto"> =
    bg === "auto" ? (resolvedTheme === "dark" ? "nuit" : "osm") : bg
  const tiles = TILES[bgKey]

  // ---------- Sélections dérivées ----------
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

  // ---------- Couches ----------
  const pr = pointRadiusFor(zoom, false)
  const prSel = pointRadiusFor(zoom, true)

  const pointsLayer = useMemo(() => {
    return visiblePoints.map(p => {
      const ring = ringAssign?.get(p.id) ?? -1
      const color = ring >= 0 && ring < 3 ? RING_COLORS[ring] : typoColors[p.typologyCode] ?? SHADOW_COLORS.gray
      const isSel = p.id === selPointId
      return (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={isSel ? prSel : pr}
          bubblingMouseEvents={false}
          pathOptions={{
            color: isSel ? SHADOW_COLORS.blue : "#ffffff",
            weight: isSel ? 3 : 1.2,
            fillColor: color,
            fillOpacity: ring >= 0 ? 1 : 0.85,
          }}
          eventHandlers={{
            click: () => {
              setSelPointId(p.id)
              setSelStationCode(null)
              onSelectPoint?.(p)
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -5]} opacity={1}>
            <span className="text-xs font-semibold">{p.code}</span>
            <span className="ml-1 text-xs opacity-80">· {typologyLabel(p.typologyCode)} · {formatLJ(p.volumeLJ)}</span>
          </Tooltip>
        </CircleMarker>
      )
    })
  }, [visiblePoints, typoColors, ringAssign, selPointId, pr, prSel, onSelectPoint])

  // Halo de sélection du point (anneau bleu pulsé en DOM au-dessus du canvas).
  const selHalo = useMemo(() => {
    if (!selPoint) return null
    return (
      <CircleMarker
        center={[selPoint.lat, selPoint.lng]}
        radius={prSel + 5}
        interactive={false}
        pathOptions={{ color: SHADOW_COLORS.blue, weight: 2, fillColor: SHADOW_COLORS.blue, fillOpacity: 0.12 }}
      />
    )
  }, [selPoint, prSel])

  const stationsLayer = useMemo(() => {
    if (!stations) return null
    return stations.map(st => {
      const color = LEVEL_COLORS[st.level]
      const isSel = st.code === selStationCode
      return (
        <Marker
          key={st.code}
          position={[st.lat, st.lng]}
          icon={stationDiamond(color, isSel, st.level === "YELLOW" && !compact)}
          bubblingMouseEvents={false}
          eventHandlers={{
            click: () => {
              setSelStationCode(st.code)
              setSelPointId(null)
              onSelectStation?.(st)
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            <span className="text-xs font-semibold">{st.name}</span>
            <span className="ml-1 text-xs opacity-80">· {st.brandName} · {st.points} point(s) · {formatTnd(st.lossTnd)}/mois</span>
          </Tooltip>
        </Marker>
      )
    })
  }, [stations, selStationCode, onSelectStation, compact])

  const govHeatLayer = useMemo(() => {
    if (!showGovHeat || !govHeat?.length) return null
    const byName = new Map(govHeat.map(g => [g.gouvernorat, g]))
    const out: React.ReactNode[] = []
    for (const [name, [lng, lat]] of Object.entries(GOV_CENTERS)) {
      const g = byName.get(name)
      if (!g || g.points === 0) continue
      const color = LEVEL_COLORS[g.level]
      const rM = Math.max(svgUnitsToMeters(9 + Math.sqrt(g.lossTnd) * 0.085), 6000)
      out.push(
        <Circle
          key={`gov-${name}`}
          center={[lat, lng]}
          radius={rM}
          interactive
          pathOptions={{ color, weight: 1.2, opacity: 0.55, fillColor: color, fillOpacity: 0.16 }}
        >
          <Tooltip direction="top" opacity={1}>
            <span className="text-xs font-semibold">{name}</span>
            <span className="ml-1 text-xs opacity-80">· {g.points} points · {formatTnd(g.lossTnd)}/mois · {g.stationsThreatened} station(s) menacée(s)</span>
          </Tooltip>
        </Circle>
      )
    }
    return out
  }, [showGovHeat, govHeat])

  const redZonesLayer = useMemo(() => {
    if (!redZones?.length) return null
    return redZones.map((z, i) => {
      const dLat = (z.radiusM * 0.75) / M_PER_DEG_LAT
      return (
        <React.Fragment key={`rz-${z.label}-${i}`}>
          <Circle
            center={[z.lat, z.lng]}
            radius={Math.max(z.radiusM, 60)}
            interactive
            pathOptions={{
              color: SHADOW_COLORS.red, weight: 1.6, opacity: 0.8,
              fillColor: SHADOW_COLORS.red, fillOpacity: 0.13,
              dashArray: "6 4",
            }}
          >
            <Tooltip direction="top" opacity={1}>
              <span className="text-xs font-semibold">{z.label}</span>
              <span className="ml-1 text-xs opacity-80">({z.gouvernorat}) · {z.points} points · {formatTnd(z.lossTnd)}/mois · rayon {Math.round(z.radiusM)} m</span>
            </Tooltip>
          </Circle>
          {/* Libellé permanent (marqueur texte — un seul tooltip lié par calque) */}
          <MapLabel position={[z.lat + dLat, z.lng]} text={z.label} color={SHADOW_COLORS.red} />
        </React.Fragment>
      )
    })
  }, [redZones])

  const roadLayer = useMemo(() => {
    if (!roadTrace) return null
    const positions = roadTrace.segments.map(s => [s[1], s[0]] as [number, number]) // [lng, lat] → [lat, lng]
    const st = ROAD_STYLES[roadTrace.type] ?? ROAD_STYLES.RN
    const mid = positions[Math.floor(positions.length / 2)]
    return (
      <>
        <Polyline
          positions={positions}
          pathOptions={{ color: st.color, weight: st.weight, opacity: 0.95, lineCap: "round" }}
        >
          <Tooltip sticky opacity={1}>
            <span className="text-xs font-semibold">{roadTrace.code}</span>
            <span className="ml-1 text-xs opacity-80">— axe {roadTrace.type === "AUTOROUTE" ? "autoroutier" : roadTrace.type === "RN" ? "route nationale" : "route régionale"} · {roadTrace.segments.length} tronçons</span>
          </Tooltip>
        </Polyline>
        {mid && <MapLabel position={mid} text={roadTrace.code} color={st.color} />}
      </>
    )
  }, [roadTrace])

  const radiiLayer = useMemo(() => {
    if (!stationRadii) return null
    const labelPos = (rM: number) => {
      const dLat = (rM / Math.SQRT2) / M_PER_DEG_LAT
      const dLng = (rM / Math.SQRT2) / mPerDegLng(stationRadii.lat)
      return [stationRadii.lat + dLat, stationRadii.lng + dLng] as [number, number]
    }
    return stationRadii.radiiM.map((m, i) => {
      const label = m >= 1000 ? `${m / 1000} km` : `${m} m`
      const stats = ringStats?.[i]
      return (
        <React.Fragment key={`radius-${m}`}>
          <Circle
            center={[stationRadii.lat, stationRadii.lng]}
            radius={m}
            interactive={false}
            pathOptions={{ color: RING_COLORS[i % 3], weight: 1.4, fillColor: RING_COLORS[i % 3], fillOpacity: 0.05, dashArray: "6 4" }}
          />
          <MapLabel
            position={labelPos(m)}
            text={`${label}${stats ? ` · ${stats.count} pts` : ""}`}
            color={RING_COLORS[i % 3]}
          />
        </React.Fragment>
      )
    })
  }, [stationRadii, ringStats])

  // ---------- Contrôles ----------
  const zoomIn = () => mapRef.current?.zoomIn()
  const zoomOut = () => mapRef.current?.zoomOut()
  const resetView = () => mapRef.current?.flyToBounds(L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[]), { padding: [12, 12], duration: 0.7 })

  return (
    <div className={`relative h-full w-full ${className ?? ""}`} role="application" aria-label="Cartographie des points de vente informels de carburant en Tunisie (fond OpenStreetMap)">
      <MapContainer
        ref={(m: L.Map | null) => { mapRef.current = m }}
        center={[33.88, 9.6]}
        zoom={6}
        minZoom={6}
        maxZoom={17}
        zoomControl={false}
        preferCanvas
        scrollWheelZoom
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.9}
        className="h-full w-full"
        style={{ background: "var(--secondary)" }}
      >
        <TileLayer
          key={bgKey}
          url={tiles.url}
          attribution={tiles.attribution}
          subdomains={tiles.subdomains ?? "abc"}
          maxZoom={tiles.maxZoom}
        />

        <ShadowMapEffects focusOn={focusOn} onSelectPoint={onSelectPoint} onSelectStation={onSelectStation} onZoom={setZoom} />

        {/* Heatmap gouvernorats (sous les points) */}
        {govHeatLayer}

        {/* Zones rouges */}
        {redZonesLayer}

        {/* Tracé d'axe routier */}
        {roadLayer}

        {/* Rayons de cannibalisation */}
        {radiiLayer}

        {/* Stations menacées (losanges par niveau) */}
        {stationsLayer}

        {/* Points informels + halo de sélection */}
        {selHalo}
        {pointsLayer}
      </MapContainer>

      {/* ---------- Contrôles zoom / reset / fond / export ---------- */}
      <div className="absolute right-2 top-2 z-[1001] flex flex-col gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon" variant="outline" className="h-8 w-8 bg-background/90 backdrop-blur" aria-label="Changer le fond de carte" title="Fond de carte">
              <Layers className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1.5" side="left">
            <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fond cartographique</p>
            {BG_LABELS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBg(key)}
                aria-pressed={bg === key}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${bg === key ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-accent"}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${bg === key ? "bg-primary" : "bg-transparent ring-1 ring-muted-foreground/40"}`} aria-hidden />
                {label}
              </button>
            ))}
            <p className="px-2 pb-1.5 pt-1.5 text-[10px] leading-snug text-muted-foreground">
              Tous les fonds reposent sur les données OpenStreetMap.
            </p>
          </PopoverContent>
        </Popover>
        <Button size="icon" variant="outline" className="h-8 w-8 bg-background/90 backdrop-blur" aria-label="Zoomer" onClick={zoomIn}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8 bg-background/90 backdrop-blur" aria-label="Dézoomer" onClick={zoomOut}>
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
      <div className="absolute bottom-2 left-2 z-[1001] max-w-[85%] rounded-lg border border-stone-200 bg-background/90 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur dark:border-stone-700">
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
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-full border border-dashed" style={{ borderColor: RING_COLORS[0] }} aria-hidden />Cannibalisation</span>
        </div>
      </div>

      {/* ---------- Fiche point (clic) ---------- */}
      {selPoint && (
        <div className="absolute left-2 top-2 z-[1002] w-64 overflow-hidden rounded-lg border border-stone-200 bg-background/97 shadow-lg backdrop-blur dark:border-stone-700" role="dialog" aria-label={`Fiche du point ${selPoint.code}`}>
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
        <div className="absolute left-2 top-2 z-[1002] w-56 rounded-lg border border-stone-200 bg-background/97 px-3 py-2 text-[11px] shadow-lg backdrop-blur dark:border-stone-700" role="status">
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
      {!compact && (
        <p className="pointer-events-none absolute bottom-7 right-2 z-[1000] hidden rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur sm:block">
          molette = zoom · glisser = déplacer · clic = fiche · fond OpenStreetMap
        </p>
      )}
    </div>
  )
}
