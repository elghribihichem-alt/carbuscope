'use client'

// CarbuScope — Fond cartographique réel (Leaflet + tuiles OpenStreetMap / CARTO)
// Affiche les stations, axes routiers, heatmap trafic et projets sur un vrai fond de carte.
// Rendu canvas (preferCanvas) pour rester fluide avec 2 200 marqueurs.
// Fond commutable : Plan OSM / Clair (Positron) / Nuit (Dark Matter) / Automatique (thème).

import { useEffect, useMemo, useState } from "react"
import * as L from "leaflet"
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup, Tooltip, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "next-themes"
import {
  Gauge, Star, Clock, GitCompareArrows, Pin, MapPin, Navigation, ShieldCheck,
  History, ChevronDown, ChevronRight, Loader2, MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { StationDTO, StationDetail, RoadDTO, ProjectDTO } from "@/lib/types"
import { SERVICE_LABELS } from "@/lib/types"
import { SERVICE_ICONS } from "./tunisia-map"

export type OsmBackground = "auto" | "street" | "clair" | "noir" | "topo" | "osm"

export interface OsmMapProps {
  stations: StationDTO[]
  roads?: RoadDTO[]
  projects?: ProjectDTO[]
  layers?: { stations: boolean; roads: boolean; traffic: boolean; projects: boolean }
  ownBrandSlug?: string | null
  selectedCode?: string | null
  onSelect?: (s: StationDTO | null) => void
  onViewDetail?: (s: StationDTO) => void
  background?: OsmBackground
  focusCode?: string | null
  fitTo?: StationDTO[] | null
  /** Comparateur : épingle/déépingle une station (depuis la popup) */
  onCompare?: (s: StationDTO) => void
  /** Codes des stations actuellement épinglées dans le comparateur */
  compareCodes?: string[]
  /** Fiche détaillée (avis, historique, concurrents proches) — chargée par le wrapper au fil de la sélection */
  detail?: StationDetail | null
}

// Tunisie : lat 30.2→37.6, lng 7.5→11.9 (marges incluses)
const TUNISIA_BOUNDS: L.LatLngBoundsExpression = [[30.1, 7.4], [37.7, 11.95]]
const MAX_BOUNDS: L.LatLngBoundsExpression = [[27.5, 4.5], [41.0, 15.0]]

// Fournisseurs de tuiles sans clé API — ESRI et OpenTopoMap servent des tuiles
// propres depuis les IP datacenter ; le plan OSM communautaire peut être limité
// selon la politique d'usage (tuiles 403) : conservé comme option explicite.
const TILES: Record<Exclude<OsmBackground, "auto">, { url: string; attribution: string; maxZoom: number }> = {
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tuiles &copy; Esri — Sources : Esri, HERE, Garmin, contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxZoom: 19,
  },
  clair: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tuiles &copy; Esri, HERE, Garmin — fond minimal clair',
    maxZoom: 16,
  },
  noir: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tuiles &copy; Esri, HERE, Garmin — fond minimal nuit',
    maxZoom: 16,
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs, SRTM · style <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
    maxZoom: 19,
  },
}

const NUM = new Intl.NumberFormat("fr-FR")

// ---------- Décluttering : grappes aux zooms pays/région (T21) ----------
// Comme Waze / Google Maps : aux zooms 6-8, les stations voisines s'agrègent
// en un marqueur de grappe (taille ∝ effectif, couleur de l'enseigne dominante) ;
// un clic zoome vers la grappe ; dès le zoom 9 les stations individuelles
// reviennent. Désactivé sous 60 stations (inutile) et pour les fonds clairs/pays.
const CLUSTER_MAX_ZOOM = 8
const CLUSTER_MIN_STATIONS = 60

function clusterStations(stations: StationDTO[], cellDeg: number) {
  const cells = new Map<string, StationDTO[]>()
  for (const s of stations) {
    const key = `${Math.floor(s.lng / cellDeg)}:${Math.floor(s.lat / cellDeg)}`
    const arr = cells.get(key)
    if (arr) arr.push(s)
    else cells.set(key, [s])
  }
  const out: {
    lat: number; lng: number; count: number
    dominantName: string; dominantColor: string; dominantCount: number
  }[] = []
  for (const group of cells.values()) {
    const lat = group.reduce((a, s) => a + s.lat, 0) / group.length
    const lng = group.reduce((a, s) => a + s.lng, 0) / group.length
    const byBrand = new Map<string, { count: number; color: string }>()
    for (const s of group) {
      const cur = byBrand.get(s.brandName)
      if (cur) cur.count++
      else byBrand.set(s.brandName, { count: 1, color: s.brandColor })
    }
    const [dominantName, dom] = [...byBrand.entries()].sort((a, b) => b[1].count - a[1].count)[0]
    out.push({ lat, lng, count: group.length, dominantName, dominantColor: dom.color, dominantCount: dom.count })
  }
  return out
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ouverte", RENOVATION: "En rénovation", PROJECT: "Projet", CLOSED: "Fermée",
}

const ROAD_STYLE: Record<string, { color: string; weight: number }> = {
  AUTOROUTE: { color: "#d97706", weight: 3 },
  RN: { color: "#e07856", weight: 2 },
  GP: { color: "#9ca3af", weight: 1.4 },
}

function markerStyle(s: StationDTO, opts: { isOwn: boolean; isSel: boolean; isPinned?: boolean }) {
  if (s.status === "CLOSED") {
    return {
      radius: opts.isSel ? 7 : 5,
      color: opts.isPinned ? "#059669" : "#6b7280", weight: opts.isPinned ? 3 : 1.5,
      fillColor: "#9ca3af", fillOpacity: 0.55,
      dashArray: "3 2",
    } as const
  }
  if (s.status === "PROJECT") {
    return {
      radius: opts.isSel ? 8 : 6,
      color: opts.isPinned ? "#059669" : s.brandColor, weight: opts.isPinned ? 3 : 2,
      fillColor: s.brandColor, fillOpacity: 0.12,
      dashArray: "4 3",
    } as const
  }
  return {
    radius: (opts.isOwn ? 6 : 5) + Math.min(3.5, Math.sqrt(Math.max(s.traffic, 0)) / 30) + (opts.isSel ? 2.5 : 0) + (opts.isPinned ? 1 : 0),
    color: opts.isPinned ? "#059669"
      : s.status === "RENOVATION" ? "#d97706" : opts.isSel ? "#f8fafc" : "#ffffff",
    weight: opts.isPinned ? 3 : s.status === "RENOVATION" ? 2.5 : opts.isSel ? 2.5 : 1.3,
    fillColor: s.brandColor, fillOpacity: opts.isSel || opts.isOwn ? 0.95 : 0.8,
  } as const
}

/** Effets carte : attribution, fitBounds initial/fitTo, focus, sélection */
function MapEffects({ fitTo, focusStation, selectedStation, onSelect }: {
  fitTo?: StationDTO[] | null
  focusStation: StationDTO | null
  selectedStation: StationDTO | null
  onSelect?: (s: StationDTO | null) => void
}) {
  const map = useMap()

  // L'attribution passe en bas-gauche pour ne pas chevaucher la légende (bas-droite)
  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft")
  }, [map])

  // Cadrage : stations fournies (fitTo) sinon toute la Tunisie — montage + changement de fitTo
  useEffect(() => {
    const pts = fitTo && fitTo.length > 0 ? fitTo : null
    const bounds = pts
      ? L.latLngBounds(pts.map(s => [s.lat, s.lng] as [number, number]))
      : L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[])
    map.fitBounds(bounds, { padding: [14, 14] })
  }, [map, fitTo])

  // Focus « voir sur la carte » (flyTo) — déclenché par focusCode
  useEffect(() => {
    if (!focusStation) return
    map.flyTo([focusStation.lat, focusStation.lng], Math.max(map.getZoom(), 11), { duration: 0.7 })
  }, [map, focusStation])

  // Sélection (clic marqueur ou ligne de liste) → survol doux vers la station
  useEffect(() => {
    if (!selectedStation) return
    const z = map.getZoom()
    map.flyTo([selectedStation.lat, selectedStation.lng], Math.max(z, 10), { duration: 0.5 })
  }, [map, selectedStation])

  // Clic sur le fond → désélection (comportement homologue au mode schéma)
  useEffect(() => {
    const clear = () => onSelect?.(null)
    map.on("click", clear)
    return () => { map.off("click", clear) }
  }, [map, onSelect])

  return null
}

/** Stations avec décluttering progressif : grappes aux zooms 6-8, marqueurs individuels dès le zoom 9 */
function DeclutteredStations({
  stations, ownBrandSlug, selectedCode, onSelect, compareCodes,
}: {
  stations: StationDTO[]
  ownBrandSlug?: string | null
  selectedCode?: string | null
  onSelect?: (s: StationDTO | null) => void
  compareCodes: string[]
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom())
    map.on("zoomend", onZoom)
    return () => { map.off("zoomend", onZoom) }
  }, [map])

  const clusterMode = zoom <= CLUSTER_MAX_ZOOM && stations.length >= CLUSTER_MIN_STATIONS

  // Taille de cellule adaptée au zoom : grossière au niveau pays, fine avant le seuil.
  const clusters = useMemo(() => {
    if (!clusterMode) return []
    const cellDeg = 0.36 / Math.pow(2, zoom - 6)
    return clusterStations(stations, cellDeg)
  }, [clusterMode, zoom, stations])

  if (clusterMode) {
    return (
      <>
        {clusters.map(c => (
          <CircleMarker
            key={`${c.lat.toFixed(3)}:${c.lng.toFixed(3)}`}
            center={[c.lat, c.lng]}
            radius={6 + Math.min(13, Math.sqrt(c.count) * 1.35)}
            bubblingMouseEvents={false}
            pathOptions={{
              color: "#ffffff", weight: 1.6,
              fillColor: c.dominantColor, fillOpacity: 0.88,
            }}
            eventHandlers={{
              click: () => map.flyTo([c.lat, c.lng], Math.min(CLUSTER_MAX_ZOOM + 2, zoom + 2), { duration: 0.6 }),
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="text-xs font-semibold">{c.count} station{c.count > 1 ? "s" : ""}</span>
              <span className="ml-1 text-xs opacity-80">
                — surtout {c.dominantName} ({c.dominantCount}) · zoomer pour détailler
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </>
    )
  }

  return (
    <>
      {stations.map(s => {
        const isOwn = !!ownBrandSlug && s.brandSlug === ownBrandSlug
        const isSel = s.code === selectedCode
        const isPinned = compareCodes.includes(s.code)
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            bubblingMouseEvents={false}
            {...markerStyle(s, { isOwn, isSel, isPinned })}
            eventHandlers={{ click: () => onSelect?.(s.code === selectedCode ? null : s) }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="text-xs font-semibold">{s.name}</span>
              <span className="ml-1 text-xs opacity-80">
                — {s.traffic > 0 ? `${NUM.format(s.traffic)} véh/j` : s.status === "PROJECT" ? "Projet" : "—"}
              </span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}

/** Lien d'itinéraire réel (Google Maps Directions) vers la station */
export function stationDirectionsUrl(s: StationDTO) {
  return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
}

const DATE_FR = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d))

function Stars({ n, size = "h-3 w-3" }: { n: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} sur 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`${size} ${i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  )
}

/**
 * Fiche station riche rendue dans la popup Leaflet (parité avec l'ancienne fiche
 * « schéma », et au-delà) : photo, adresse/GPS/horaires, badges, services avec
 * libellés, certification terrain, concurrents proches avec distance, derniers
 * avis, historique repliable, actions Fiche complète / Comparer / Itinéraire.
 * Le détail (avis/historique/concurrents) arrive de façon asynchrone : squelette
 * pulsé en attendant.
 */
function StationRichCard({ s, detail, isOwn, onViewDetail, onCompare, isPinned }: {
  s: StationDTO
  detail?: StationDetail | null
  isOwn: boolean
  onViewDetail?: (s: StationDTO) => void
  onCompare?: (s: StationDTO) => void
  isPinned: boolean
}) {
  const [showHistory, setShowHistory] = useState(false)
  const nearby = detail?.nearby?.slice(0, 3) ?? []
  const reviews = detail?.reviews?.slice(0, 2) ?? []
  const history = detail?.history ?? []
  const hasDetail = !!detail
  return (
    <div className="w-[286px] sm:w-[312px]">
      {/* ---------- Corps scrollable ---------- */}
      <div className="cs-popup-scroll max-h-[min(58vh,430px)] overflow-y-auto">
        {/* En-tête enseigne */}
        <div className="sticky top-0 z-[1] flex items-start gap-2 border-b bg-muted/50 px-3 py-2 pr-8 backdrop-blur">
          <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-ring/20" style={{ background: s.brandColor }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{s.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {s.brandName}{isOwn ? " (moi)" : ""} · <span className="font-mono">{s.code}</span>
            </p>
          </div>
        </div>

        <div className="space-y-2.5 p-3">
          {s.photoUrl && (
            <img src={s.photoUrl} alt={`Photo ${s.name}`} className="h-28 w-full rounded-lg border object-cover" />
          )}

          {/* Localisation & horaires */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{s.address}</p>
            <p className="font-mono text-[10px]">GPS {s.lat.toFixed(4)}, {s.lng.toFixed(4)}</p>
            <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0" />
              {s.open24 ? "Ouverte 24h/24" : s.open7j ? "7j/7" : "Horaires de jour"}
              <span className="text-muted-foreground/60">· {s.delegation}, {s.gouvernorat}</span>
            </p>
          </div>

          {/* Badges indicateur */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={s.status === "ACTIVE" ? "default" : s.status === "RENOVATION" ? "secondary" : "outline"}
              className={`px-1.5 py-0 text-[10px] ${s.status === "RENOVATION" ? "border-amber-500 text-amber-600 dark:text-amber-400" : s.status === "PROJECT" ? "border-dashed" : ""}`}>
              {STATUS_LABEL[s.status] ?? s.status}
            </Badge>
            {s.traffic > 0 && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
                <Gauge className="h-3 w-3" />{NUM.format(s.traffic)} véh/j
              </Badge>
            )}
            {s.rating > 0 && (
              <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{s.rating.toFixed(1)}
                {s.reviewsCount > 0 && <span className="text-muted-foreground">({s.reviewsCount})</span>}
              </Badge>
            )}
            {isPinned && (
              <Badge variant="outline" className="gap-0.5 border-emerald-500/60 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <Pin className="h-2.5 w-2.5" aria-hidden />Comparateur
              </Badge>
            )}
          </div>

          {/* Services (libellés complets, comme l'ancienne fiche) */}
          {s.services.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
              <div className="flex flex-wrap gap-1">
                {s.services.slice(0, 9).map(key => {
                  const Icon = SERVICE_ICONS[key]
                  return (
                    <span key={key} title={SERVICE_LABELS[key] ?? key} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10px]">
                      {Icon && <Icon className="h-3 w-3" />}{SERVICE_LABELS[key] ?? key}
                    </span>
                  )
                })}
                {s.services.length > 9 && <span className="text-[10px] text-muted-foreground">+{s.services.length - 9}</span>}
              </div>
            </div>
          )}

          {/* Certification terrain (A.3.3) */}
          <div className="rounded-lg border bg-muted/30 p-2 text-[11px]">
            <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Dernière vérification : {DATE_FR(s.lastVerified)}
            </p>
            <p className="ml-5 text-muted-foreground">{s.verifiedBy} · {hasDetail ? "fiche certifiée" : "source terrain"}</p>
          </div>

          {/* Derniers avis (enrichissement : la fiche complète n'est plus nécessaire pour un aperçu réputation) */}
          {hasDetail ? (
            reviews.length > 0 ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />Derniers avis
                </p>
                <div className="space-y-1.5">
                  {reviews.map(r => (
                    <div key={r.id} className="rounded-lg border bg-muted/30 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Stars n={r.rating} />
                        <span className="shrink-0 text-[10px] text-muted-foreground">{DATE_FR(r.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug">{r.comment}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        — {r.author}
                        {r.replyText && <span className="ml-1 font-medium text-emerald-600 dark:text-emerald-400">· réponse enseigne ✓</span>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          ) : (
            <div className="space-y-1.5" aria-hidden>
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded-lg bg-muted" />
            </div>
          )}

          {/* Concurrents proches (espionnage terrain, ancienne fiche) */}
          {hasDetail && nearby.length > 0 && (
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

          {/* Historique repliable (traçabilité des modifications) */}
          {hasDetail && history.length > 0 && (
            <div className="rounded-lg border">
              <button className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium" onClick={() => setShowHistory(v => !v)}>
                <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Historique ({history.length})</span>
                {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showHistory && (
                <div className="cs-popup-scroll max-h-28 space-y-1 overflow-y-auto border-t px-2 py-1.5 text-[10px]">
                  {history.map(h => (
                    <p key={h.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{h.field}</span> : {h.oldValue} → {h.newValue}
                      <span className="ml-1">({h.author}, {DATE_FR(h.createdAt)})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chargement du détail */}
          {!hasDetail && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Chargement des détails (avis, historique, concurrents)…
            </p>
          )}
        </div>
      </div>

      {/* ---------- Actions ---------- */}
      <div className="flex gap-2 border-t p-2">
        {onViewDetail && (
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => onViewDetail(s)}>
            Fiche complète
          </Button>
        )}
        {onCompare ? (
          <Button
            size="sm" variant={isPinned ? "secondary" : "outline"}
            aria-pressed={isPinned}
            className={`h-7 flex-1 gap-1 text-xs ${isPinned ? "border border-emerald-500/50 text-emerald-700 dark:text-emerald-400" : ""}`}
            onClick={() => onCompare(s)}
          >
            <GitCompareArrows className="h-3.5 w-3.5" aria-hidden />
            {isPinned ? "Retirer" : "Comparer"}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs">
            <a href={stationDirectionsUrl(s)} target="_blank" rel="noreferrer">
              <Navigation className="h-3.5 w-3.5" aria-hidden />Itinéraire
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

export function OSMMap({
  stations, roads = [], projects = [],
  layers = { stations: true, roads: true, traffic: false, projects: false },
  ownBrandSlug, selectedCode, onSelect, onViewDetail,
  background = "auto", focusCode, fitTo,
  onCompare, compareCodes = [], detail = null,
}: OsmMapProps) {
  const { resolvedTheme } = useTheme()
  const tileKey: Exclude<OsmBackground, "auto"> =
    background === "auto" ? (resolvedTheme === "dark" ? "noir" : "street") : background
  const tiles = TILES[tileKey]

  const byCode = useMemo(() => new Map(stations.map(s => [s.code, s])), [stations])
  const selected = selectedCode ? byCode.get(selectedCode) ?? null : null
  const focusStation = focusCode ? byCode.get(focusCode) ?? null : null

  // Segments routiers [lng, lat] → Leaflet [lat, lng]
  const roadPaths = useMemo(() => {
    return roads.map(rd => ({
      rd,
      positions: rd.segments.map(([lng, lat]) => [lat, lng] as [number, number]),
    }))
  }, [roads])

  // Points de heatmap le long des axes (approx. halo de trafic)
  const heatPoints = useMemo(() => {
    if (!layers.traffic) return []
    const out: { pos: [number, number]; radius: number; color: string }[] = []
    for (const rd of roads) {
      for (let i = 0; i < rd.segments.length - 1; i++) {
        const a = rd.segments[i], b = rd.segments[i + 1]
        for (let t = 0.25; t < 1; t += 0.25) {
          const lng = a[0] + (b[0] - a[0]) * t
          const lat = a[1] + (b[1] - a[1]) * t
          out.push({
            pos: [lat, lng],
            radius: Math.min(22000, 5000 + rd.tmj * 0.9),
            color: rd.tmj > 15000 ? "#dc2626" : rd.tmj > 9000 ? "#ea580c" : "#d9a514",
          })
        }
      }
    }
    return out
  }, [layers.traffic, roads])

  return (
    <div className="absolute inset-0 z-0">
      <MapContainer
        center={[33.88, 9.6]}
        zoom={6}
        minZoom={6}
        maxZoom={17}
        zoomControl
        preferCanvas
        scrollWheelZoom
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.9}
        className="h-full w-full"
        style={{ background: "var(--secondary)" }}
      >
        <TileLayer key={tileKey} url={tiles.url} attribution={tiles.attribution} subdomains="abc" maxZoom={tiles.maxZoom} />

        <MapEffects fitTo={fitTo} focusStation={focusStation} selectedStation={selected} onSelect={onSelect} />

        {/* Axes routiers */}
        {layers.roads && roadPaths.map(({ rd, positions }) => {
          const st = ROAD_STYLE[rd.type] ?? ROAD_STYLE.GP
          return (
            <Polyline
              key={rd.id}
              positions={positions}
              pathOptions={{ color: st.color, weight: st.weight, opacity: 0.9, lineCap: "round" }}
            >
              <Tooltip sticky opacity={1}>
                <span className="text-xs font-semibold">{rd.code}</span>
                <span className="ml-1 text-xs opacity-80">— {rd.name} · {NUM.format(rd.tmj)} véh/j</span>
              </Tooltip>
            </Polyline>
          )
        })}

        {/* Heatmap trafic (halos non interactifs) */}
        {heatPoints.map((h, i) => (
          <Circle
            key={`heat-${i}`}
            center={h.pos}
            radius={h.radius}
            interactive={false}
            pathOptions={{ color: "transparent", weight: 0, fillColor: h.color, fillOpacity: 0.16 }}
          />
        ))}

        {/* Projets d'infrastructure */}
        {layers.projects && projects.map(pr => (
          <CircleMarker
            key={pr.id}
            center={[pr.lat, pr.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff", weight: 1.5,
              fillColor: pr.status === "CONSTRUCTION" ? "#059669" : "#9333ea",
              fillOpacity: 0.95,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="text-xs font-semibold">{pr.name}</span>
              <span className="ml-1 text-xs opacity-80">
                — {pr.status === "CONSTRUCTION" ? "En construction" : "Planifié"} · {pr.budget} · horizon {pr.targetDate}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Stations — décluttering progressif : grappes aux zooms pays/région
            (comme Waze), marqueurs individuels dès le zoom 9 ; le clic marqueur
            ne propage pas le clic carte (pas de désélection parasite) */}
        {layers.stations && (
          <DeclutteredStations
            stations={stations}
            ownBrandSlug={ownBrandSlug}
            selectedCode={selectedCode}
            onSelect={onSelect}
            compareCodes={compareCodes}
          />
        )}

        {/* Fiche popup riche de la station sélectionnée (photo, avis, historique,
            concurrents — parité avec l'ancienne fiche du mode schéma) */}
        {selected && (
          <Popup
            key={selected.code}
            position={[selected.lat, selected.lng]}
            autoPan={false}
            closeButton
            minWidth={286}
            maxWidth={316}
            className="cs-station-popup"
          >
            <StationRichCard
              s={selected}
              detail={detail && detail.station.code === selected.code ? detail : null}
              isOwn={!!ownBrandSlug && selected.brandSlug === ownBrandSlug}
              onViewDetail={onViewDetail}
              onCompare={onCompare}
              isPinned={compareCodes.includes(selected.code)}
            />
          </Popup>
        )}
      </MapContainer>
    </div>
  )
}
