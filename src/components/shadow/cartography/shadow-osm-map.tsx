'use client'

// CarbuScope — T56 — Shadow Market « Carte OSM interactive » : fond carto
// réel OpenStreetMap (tuiles communautaires, sans clé API) monté UNIQUEMENT
// côté client via dynamic(..., { ssr: false }) depuis shadow-osm-tab.tsx
// (pattern hub-map / osm-map — aucun rendu serveur de Leaflet).
// Calques : points informels (CircleMarker ∝ volume, couleur typologie),
// stations menacées (halo contour par niveau de menace), zones rouges
// (cercles réels en mètres), heatmap gouvernorats (disques ∝ perte).
// Renderer canvas (preferCanvas) : ~1 200 marqueurs fluides au drag/zoom.
// Sélection externe (liste/filtres) → survol doux flyTo.

import { useEffect, useMemo } from "react"
import * as L from "leaflet"
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { ShadowGovLossDTO, ShadowMapResponse } from "@/lib/types"
import { haversineKm } from "@/lib/geo"
import { GOV_CENTERS } from "@/components/map/tunisia-geo"
import {
  formatTnd, formatLJ, formatMillimes, relDateFr, typologyLabel,
  LEVEL_COLORS, ShadowLevelBadge, ShadowStatusBadge,
} from "@/components/shadow/shadow-shared"

// Tunisie : lat 30.2→37.6, lng 7.5→11.9 (marges incluses — osm-map.tsx).
const TUNISIA_BOUNDS: L.LatLngBoundsExpression = [[30.1, 7.4], [37.7, 11.95]]
const MAX_BOUNDS: L.LatLngBoundsExpression = [[27.5, 4.5], [41.0, 15.0]]

export type OsmBasemap = "osm" | "street" | "satellite" | "noir"

const TILES: Record<OsmBasemap, { url: string; attribution: string; maxZoom: number }> = {
  // Plan communautaire OpenStreetMap — demandé explicitement (T56).
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
    maxZoom: 19,
  },
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tuiles &copy; Esri — Sources : Esri, HERE, Garmin, contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagerie &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  noir: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tuiles &copy; Esri, HERE, Garmin — fond minimal nuit",
    maxZoom: 16,
  },
}

/** Rayon ∝ volume journalier : 4 px à 0 → 10 px au plafond (600 L/j). */
function pointRadius(volumeLJ: number): number {
  const ratio = Math.max(0, Math.min(1, volumeLJ / 600))
  return 4 + 6 * ratio
}

/** Halo de station : rayon ∝ nombre de points informels autour (10 → 26 px). */
function stationRadius(points: number): number {
  const ratio = Math.max(0, Math.min(1, points / 25))
  return 10 + 16 * ratio
}

/** Heatmap gouvernorat : rayon ∝ perte mensuelle (14 → 34 px), cercle doux. */
function govRadius(lossTnd: number, maxLoss: number): number {
  const ratio = maxLoss > 0 ? Math.max(0, Math.min(1, lossTnd / maxLoss)) : 0
  return 14 + 20 * ratio
}

export interface ShadowLayers {
  points: boolean
  stations: boolean
  redZones: boolean
  heat: boolean
}

// T58 — Rayons de cannibalisation autour d'une station (cercles réels en
// mètres + points colorés par anneau — parité avec l'ancienne carte SVG).
export interface OsmStationRadii {
  lat: number
  lng: number
  radiiM: number[]
}

// T58 — tracé d'axe routier (segments [lng, lat] — parité RoadTrace).
export interface OsmRoadTrace {
  code: string
  type: string
  segments: [number, number][]
}

export interface ShadowOsmMapProps {
  /** Réponse carte (govHeat) — optionnelle si govHeat est fourni directement. */
  data?: ShadowMapResponse | { govHeat: ShadowMapResponse["govHeat"] } | null
  /** Jeux déjà filtrés par le panneau de filtres parent. */
  points: ShadowMapResponse["points"]
  stations: ShadowMapResponse["stations"]
  redZones: ShadowMapResponse["redZones"]
  layers: ShadowLayers
  basemap: OsmBasemap
  /** Couleur par code typologie (catalogue). */
  typoColors: Record<string, string>
  /** Cible de survol doux (clic liste / chip) — { lat, lng, zoom } ou
   *  { lat, lng, spanKm } pour un cadrage par emprise (T58). */
  focus: { lat: number; lng: number; zoom?: number; spanKm?: number } | null
  /** Clé incrémentée à chaque changement de taille (plein écran) → invalidateSize. */
  resizeKey: number
  /** T58 — heatmap fournie directement (sans réponse complète). */
  govHeat?: ShadowGovLossDTO[] | null
  /** T58 — cercles 500 m / 1 km / 2 km + points colorés par anneau. */
  stationRadii?: OsmStationRadii | null
  /** T58 — tracé d'axe routier (polyline couleur par type de voie). */
  roadTrace?: OsmRoadTrace | null
}

function MapEffects({ focus, resizeKey }: { focus: { lat: number; lng: number; zoom?: number; spanKm?: number } | null; resizeKey: number }) {
  const map = useMap()

  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft")
  }, [map])

  // Cadrage initial : toute la Tunisie.
  useEffect(() => {
    map.fitBounds(L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[]), { padding: [12, 12] })
  }, [map])

  // Survol doux vers la cible (liste latérale, chips…). Avec spanKm (T58) :
  // cadrage par emprise — la carte encadre la zone plutôt que de zoomer fixe.
  useEffect(() => {
    if (!focus) return
    if (focus.spanKm && focus.spanKm > 0) {
      const dLat = focus.spanKm / 111
      const dLng = focus.spanKm / (111 * Math.max(0.2, Math.cos((focus.lat * Math.PI) / 180)))
      map.flyToBounds(
        L.latLngBounds([
          [focus.lat - dLat, focus.lng - dLng],
          [focus.lat + dLat, focus.lng + dLng],
        ]),
        { padding: [14, 14], duration: 0.7 },
      )
      return
    }
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 11), { duration: 0.6 })
  }, [map, focus])

  // Plein écran entré/sorti → recalcul de la taille des tuiles.
  useEffect(() => {
    // Petit délai : le navigateur applique la taille avant l'appel.
    const t = setTimeout(() => { map.invalidateSize() }, 80)
    return () => clearTimeout(t)
  }, [map, resizeKey])

  return null
}

export function ShadowOsmMap({
  data, points, stations, redZones, layers, basemap, typoColors, focus, resizeKey,
  govHeat: govHeatOverride, stationRadii, roadTrace,
}: ShadowOsmMapProps) {
  // Le fond est un choix EXPLICITE de l'utilisateur (défaut : plan OSM
  // communautaire, demandé en T56) — il reste stable clair/sombre, comme
  // l'imagerie satellite (pattern hub-map : le fond suit le thème ; ici la
  // carte est une zone « Always Light » assumée, choisie dans le sélecteur).
  const tiles = TILES[basemap] ?? TILES.osm

  // Heatmap : centres des gouvernorats (lng,lat) → cercles ∝ perte.
  const heatSource = govHeatOverride ?? data?.govHeat ?? []
  const heatCircles = useMemo(() => {
    if (!layers.heat) return []
    const maxLoss = heatSource.reduce((m, g) => Math.max(m, g.lossTnd), 0) || 1
    return heatSource
      .map(g => {
        const c = GOV_CENTERS[g.gouvernorat]
        if (!c) return null
        return { gov: g.gouvernorat, lat: c[1], lng: c[0], loss: g.lossTnd, pts: g.points, level: g.level, r: govRadius(g.lossTnd, maxLoss) }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [heatSource, layers.heat])

  // T58 — anneaux de cannibalisation : couleur du point selon la distance à
  // la station (rouge ≤ 500 m, orange ≤ 1 km, ambre ≤ 2 km — hors rayon :
  // couleur typologie inchangée).
  const pointColor = useMemo(() => {
    const ringColors = ["#E53935", "#FF9800", "#FFC107"]
    return (p: ShadowMapResponse["points"][number]): string => {
      if (!stationRadii) return typoColors[p.typologyCode] ?? "#9E9E9E"
      const dM = haversineKm(stationRadii.lat, stationRadii.lng, p.lat, p.lng) * 1000
      for (let i = 0; i < stationRadii.radiiM.length; i++) {
        if (dM <= stationRadii.radiiM[i]) return ringColors[i] ?? "#9E9E9E"
      }
      return typoColors[p.typologyCode] ?? "#9E9E9E"
    }
  }, [stationRadii, typoColors])

  // T58 — couleur du tracé selon le type de voie (tons chauds/zinc).
  const roadStyle = useMemo(() => {
    switch (roadTrace?.type) {
      case "AUTOROUTE": return { color: "#d97706", label: "Autoroute" }
      case "RN": return { color: "#e07856", label: "Route nationale" }
      default: return { color: "#9ca3af", label: "Grand chemin" }
    }
  }, [roadTrace])

  return (
    <div className="relative h-full w-full" role="application" aria-label="Carte OpenStreetMap du marché parallèle">
      <MapContainer
        center={[34.2, 9.6]}
        zoom={7}
        minZoom={6}
        maxZoom={18}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.7}
        preferCanvas
        className="h-full w-full"
        style={{ background: "var(--background)" }}
      >
        <TileLayer key={basemap} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />

        {/* T58 — tracé d'axe routier sélectionné (polyline tons chauds). */}
        {roadTrace && roadTrace.segments.length > 0 && (
          <Polyline
            positions={roadTrace.segments.map(s => [s[1], s[0]] as L.LatLngTuple)}
            pathOptions={{ color: roadStyle.color, weight: 3.5, opacity: 0.9 }}
          >
            <Popup className="text-[13px]">
              <p className="m-0 font-semibold">{roadTrace.code} — {roadStyle.label}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-muted-foreground">Axe routier sélectionné · les points affichés sont à moins de 3 km.</p>
            </Popup>
          </Polyline>
        )}

        {/* T58 — anneaux de cannibalisation (cercles réels en mètres). */}
        {stationRadii && stationRadii.radiiM.map((r, i) => (
          <Circle
            key={`ring-${i}-${r}`}
            center={[stationRadii.lat, stationRadii.lng]}
            radius={r}
            pathOptions={{
              color: ["#E53935", "#FF9800", "#FFC107"][i] ?? "#FFC107",
              weight: 1.4,
              opacity: 0.75,
              fillColor: ["#E53935", "#FF9800", "#FFC107"][i] ?? "#FFC107",
              fillOpacity: 0.04,
              dashArray: "5 5",
            }}
          >
            <Popup className="text-[13px]">
              <p className="m-0 font-semibold">Anneau {i + 1} — ≤ {r >= 1000 ? `${r / 1000} km` : `${r} m`}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-muted-foreground">Rayon de cannibalisation autour de la station sélectionnée.</p>
            </Popup>
          </Circle>
        ))}

        {/* Heatmap gouvernorats — disques doux SOUS les marqueurs. */}
        {heatCircles.map(h => (
          <Circle
            key={`heat-${h.gov}`}
            center={[h.lat, h.lng]}
            radius={h.r * 1000}
            pathOptions={{
              color: LEVEL_COLORS[h.level] ?? "#FFC107",
              weight: 1,
              opacity: 0.35,
              fillColor: LEVEL_COLORS[h.level] ?? "#FFC107",
              fillOpacity: 0.08,
              dashArray: "2 6",
            }}
          >
            <Popup className="text-[13px]">
              <p className="m-0 font-semibold">{h.gov}</p>
              <p className="m-0 mt-1">{h.pts} points informels · perte {formatTnd(h.loss)}/mois</p>
            </Popup>
          </Circle>
        ))}

        {/* Zones rouges — cercles réels (rayon en mètres). */}
        {layers.redZones && redZones.map((z, i) => (
          <Circle
            key={`zone-${z.gouvernorat}-${z.label}-${i}`}
            center={[z.lat, z.lng]}
            radius={z.radiusM}
            pathOptions={{
              color: "#E53935",
              weight: 1.6,
              opacity: 0.8,
              fillColor: "#E53935",
              fillOpacity: 0.07,
              dashArray: "6 4",
            }}
          >
            <Popup className="text-[13px]">
              <p className="m-0 font-semibold text-[13px] leading-snug">⚠️ {z.label}</p>
              <p className="m-0 mt-1 leading-snug">{z.points} points · perte {formatTnd(z.lossTnd)}/mois</p>
              <p className="m-0 mt-0.5 leading-snug text-muted-foreground">Rayon de vigilance {(z.radiusM / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km</p>
            </Popup>
          </Circle>
        ))}

        {/* Stations menacées — halo contour par niveau (émeraude→terracotta). */}
        {layers.stations && stations.map(s => (
          <CircleMarker
            key={`sta-${s.code}`}
            center={[s.lat, s.lng]}
            radius={stationRadius(s.points)}
            pathOptions={{
              color: LEVEL_COLORS[s.level] ?? "#FFC107",
              weight: 2,
              opacity: 0.85,
              fillColor: LEVEL_COLORS[s.level] ?? "#FFC107",
              fillOpacity: 0.12,
              dashArray: "3 4",
            }}
          >
            <Popup className="text-[13px]">
              <p className="m-0 font-semibold text-[13px] leading-snug">{s.name}</p>
              <p className="m-0 mt-0.5 font-mono text-[11px] text-zinc-500">{s.code} · {s.brandName}</p>
              <p className="m-0 mt-1 leading-snug">
                <span className="font-medium">{s.points} points</span> autour · perte {formatTnd(s.lossTnd)}/mois
              </p>
              <p className="m-0 mt-1"><ShadowLevelBadge level={s.level} loss={s.lossTnd} /></p>
              <p className="m-0 mt-1 text-[11px] italic text-muted-foreground">{s.gouvernorat} · {s.delegation}</p>
            </Popup>
          </CircleMarker>
        ))}

        {/* Points informels — disque plein couleur typologie (ou anneau de
            cannibalisation T58), rayon ∝ volume. */}
        {layers.points && points.map(p => {
          const color = pointColor(p)
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={pointRadius(p.volumeLJ)}
              pathOptions={{ color, weight: 1.2, opacity: 0.95, fillColor: color, fillOpacity: 0.8 }}
            >
              <Popup className="text-[13px]">
                <p className="m-0 font-semibold text-[13px] leading-snug">
                  <span aria-hidden>🕳️</span> {typologyLabel(p.typologyCode, p.typologyCode)}
                </p>
                <p className="m-0 mt-0.5 font-mono text-[11px] text-zinc-500">{p.code} · {p.gouvernorat}</p>
                <p className="m-0 mt-1 leading-snug">
                  <span className="font-medium">{formatLJ(p.volumeLJ)}</span>
                  {p.priceMillimes != null ? ` · ${formatMillimes(p.priceMillimes)}/L` : ""}
                  {" "}· perte {formatTnd(p.lossTnd)}/mois
                </p>
                {p.nearestStation && (
                  <p className="m-0 mt-0.5 leading-snug text-[11px] text-muted-foreground">
                    Station la plus proche : {p.nearestStation.name} ({(p.nearestStation.distanceM / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km)
                  </p>
                )}
                <p className="m-0 mt-1"><ShadowStatusBadge status={p.status} /></p>
                {p.notes && <p className="m-0 mt-1 text-[11px] italic text-muted-foreground">{p.notes.slice(0, 140)}{p.notes.length > 140 ? "…" : ""}</p>}
                <p className="m-0 mt-1 text-[10px] text-muted-foreground">Vérifié {relDateFr(p.lastCheckAt)} · source {p.source}</p>
              </Popup>
            </CircleMarker>
          )
        })}

        <MapEffects focus={focus} resizeKey={resizeKey} />
      </MapContainer>
    </div>
  )
}
