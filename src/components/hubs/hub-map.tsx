'use client'

// CarbuScope — T54-Ca — fond cartographique Leaflet des Terminaux
// Multi-Services (volet « Carte des TMP »). Monté UNIQUEMENT côté client via
// dynamic(..., { ssr: false }) depuis hub-carte.tsx (pattern tunisia-map →
// osm-map, même discipline : aucun rendu serveur de Leaflet).
// Réutilise le socle d'osm-map.tsx : tuiles Esri World Street (jour) et Esri
// Dark Gray (nuit, suit le thème via next-themes — même résolution « auto »),
// cadrage Tunisie [30.1, 7.4] → [37.7, 11.95], attribution en bas-gauche.
// Marqueurs : cercles colorés par statut — ACTIVE émeraude plein, CONSTRUCTION
// ambre, PLANNED zinc en contour (tirets) — rayon ∝ véhicules/j (8 → 22 px),
// popup FR (nom, statut, véh./j) et clic → sélection (côté hub-carte :
// survol doux + Sheet détail).

import { useEffect, useMemo } from "react"
import * as L from "leaflet"
import "@/lib/leaflet-canvas-guard"
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "next-themes"
import { num } from "@/lib/chart"
import { HUB_STATUS_META, type HubDTO } from "./hub-shared"

// Tunisie : lat 30.2→37.6, lng 7.5→11.9 (marges incluses — osm-map.tsx).
const TUNISIA_BOUNDS: L.LatLngBoundsExpression = [[30.1, 7.4], [37.7, 11.95]]
const MAX_BOUNDS: L.LatLngBoundsExpression = [[27.5, 4.5], [41.0, 15.0]]

// Tuiles sans clé API (extraites d'osm-map.tsx — Esri jour / Esri nuit).
const TILES = {
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tuiles &copy; Esri — Sources : Esri, HERE, Garmin, contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxZoom: 19,
  },
  noir: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tuiles &copy; Esri, HERE, Garmin — fond minimal nuit",
    maxZoom: 16,
  },
} as const

/** Style d'un marqueur selon le statut (émeraude plein / ambre / zinc contour). */
function markerStyle(hub: HubDTO, selected: boolean) {
  if (hub.status === "ACTIVE") {
    return {
      radius: radiusFor(hub.dailyVehicles) + (selected ? 2.5 : 0),
      color: selected ? "#ffffff" : "#065f46",
      weight: selected ? 3.5 : 1.6,
      fillColor: "#059669",
      fillOpacity: selected ? 1 : 0.88,
    } as const
  }
  if (hub.status === "CONSTRUCTION") {
    return {
      radius: radiusFor(hub.dailyVehicles) + (selected ? 2.5 : 0),
      color: selected ? "#ffffff" : "#92400e",
      weight: selected ? 3.5 : 1.8,
      fillColor: "#d97706",
      fillOpacity: selected ? 1 : 0.9,
    } as const
  }
  // PLANNED (et CLOSED) : cercle zinc en CONTOUR — remplissage quasi absent.
  return {
    radius: radiusFor(hub.dailyVehicles) + (selected ? 2.5 : 0),
    color: selected ? "#059669" : "#71717a",
    weight: selected ? 3.5 : 2.2,
    fillColor: "#a1a1aa",
    fillOpacity: 0.12,
    dashArray: "4 3",
  } as const
}

/** Rayon ∝ véhicules/j : 8 px à 0 → 22 px au maximum du réseau (2 560 véh./j). */
function radiusFor(dailyVehicles: number, maxDaily = 2560): number {
  const ratio = Math.max(0, Math.min(1, dailyVehicles / maxDaily))
  return 8 + 14 * ratio
}

/** Effets carte : cadrage initial Tunisie + survol doux vers la sélection. */
function MapEffects({ selectedHub }: { selectedHub: HubDTO | null }) {
  const map = useMap()

  // L'attribution passe en bas-gauche (ne pas chevaucher la légende).
  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft")
  }, [map])

  // Cadrage : toute la Tunisie au montage.
  useEffect(() => {
    map.fitBounds(L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[]), { padding: [12, 12] })
  }, [map])

  // Sélection (clic liste ou marqueur) → survol doux vers le hub.
  useEffect(() => {
    if (!selectedHub) return
    map.flyTo([selectedHub.lat, selectedHub.lng], Math.max(map.getZoom(), 9), {
      duration: 0.5,
    })
  }, [map, selectedHub])

  return null
}

export interface HubLeafletMapProps {
  hubs: HubDTO[]
  selectedId: string | null
  onSelect: (hub: HubDTO) => void
}

export function HubLeafletMap({ hubs, selectedId, onSelect }: HubLeafletMapProps) {
  const { resolvedTheme } = useTheme()
  const tiles = resolvedTheme === "dark" ? TILES.noir : TILES.street

  const selectedHub = useMemo(
    () => (selectedId ? hubs.find(h => h.id === selectedId) ?? null : null),
    [hubs, selectedId],
  )

  return (
    <div className="relative h-full w-full" role="application" aria-label="Carte des Terminaux Multi-Services">
      <MapContainer
        center={[34.2, 9.6]}
        zoom={7}
        minZoom={6}
        maxZoom={16}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.7}
        preferCanvas
        className="h-full w-full"
        style={{ background: "var(--background)" }}
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        {hubs.map(hub => {
          const style = markerStyle(hub, hub.id === selectedId)
          const statusLabel = HUB_STATUS_META[hub.status]?.label ?? hub.status
          return (
            <CircleMarker
              key={hub.id}
              center={[hub.lat, hub.lng]}
              radius={style.radius}
              pathOptions={{
                color: style.color,
                weight: style.weight,
                fillColor: style.fillColor,
                fillOpacity: style.fillOpacity,
                ...(style.dashArray ? { dashArray: style.dashArray } : {}),
              }}
              eventHandlers={{ click: () => onSelect(hub) }}
            >
              <Popup className="text-[13px]">
                <p className="m-0 font-semibold text-[13px] leading-snug">{hub.name}</p>
                <p className="m-0 mt-0.5 font-mono text-[11px] text-zinc-500">{hub.code}</p>
                <p className="m-0 mt-1 leading-snug">
                  <span className="font-medium">{statusLabel}</span>
                  {hub.dailyVehicles > 0 ? ` · ${num(hub.dailyVehicles)} véh./j` : ""}
                </p>
              </Popup>
            </CircleMarker>
          )
        })}
        <MapEffects selectedHub={selectedHub} />
      </MapContainer>

      {/* ---- Légende en cartouche (motif de la carte interactive) ---- */}
      <div
        className="pointer-events-none absolute right-2 top-2 z-[600] rounded-lg border bg-background/92 px-2.5 py-2 text-[11px] leading-tight shadow-md backdrop-blur"
        aria-hidden
      >
        <p className="m-0 mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
          Légende
        </p>
        <p className="m-0 flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Actif
        </p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          En construction
        </p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-zinc-500" />
          Planifié
        </p>
        <p className="m-0 mt-1.5 max-w-[150px] text-[10px] italic text-muted-foreground">
          Rayon ∝ véhicules/jour (capteurs)
        </p>
      </div>
    </div>
  )
}
