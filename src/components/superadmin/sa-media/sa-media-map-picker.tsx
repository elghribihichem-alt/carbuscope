'use client'

// CarbuScope — Module Média (T60-g) : mini-carte Leaflet de SÉLECTION DE
// COORDONNÉES pour le formulaire panneau (création/édition SA). Montée
// UNIQUEMENT côté client via dynamic(..., { ssr:false }) depuis
// sa-media-panel-form.tsx (pattern hub-carte → hub-map). Clic = choix du
// point (lat/lng), marqueur émeraude + cercle de 250 m, cadrage Tunisie.
// Tuiles Esri jour / nuit (suit le thème — même socle que hub-map).

import { useEffect, useMemo } from "react"
import * as L from "leaflet"
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "next-themes"

const TUNISIA_BOUNDS: L.LatLngBoundsExpression = [[30.1, 7.4], [37.7, 11.95]]
const MAX_BOUNDS: L.LatLngBoundsExpression = [[27.5, 4.5], [41.0, 15.0]]

const TILES = {
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tuiles &copy; Esri — Sources : Esri, HERE, Garmin, contributeurs <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    maxZoom: 19,
  },
  noir: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tuiles &copy; Esri, HERE, Garmin — fond minimal nuit",
    maxZoom: 16,
  },
} as const

export interface SaMediaMapPickerProps {
  lat: number
  lng: number
  onPick: (lat: number, lng: number) => void
}

/** Clic sur la carte → coordonnées (5 décimales). */
function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(
        Math.round(e.latlng.lat * 100000) / 100000,
        Math.round(e.latlng.lng * 100000) / 100000,
      )
    },
  })
  return null
}

/** Recentrage quand les coordonnées changent programmatiquement (édition). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001)) {
      map.setView([lat, lng], Math.max(map.getZoom(), 11))
    }
  }, [map, lat, lng])
  return null
}

export function SaMediaMapPicker({ lat, lng, onPick }: SaMediaMapPickerProps) {
  const { resolvedTheme } = useTheme()
  const tiles = resolvedTheme === "dark" ? TILES.noir : TILES.street
  const hasPoint = useMemo(() => Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001), [lat, lng])

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border" role="application" aria-label="Carte de sélection des coordonnées">
      <MapContainer
        center={[34.2, 9.6]}
        zoom={7}
        minZoom={6}
        maxZoom={17}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.7}
        preferCanvas
        className="h-full w-full"
        style={{ background: "var(--background)" }}
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        <ClickPicker onPick={onPick} />
        <Recenter lat={lat} lng={lng} />
        {hasPoint ? (
          <>
            <CircleMarker
              center={[lat, lng]}
              radius={10}
              pathOptions={{ color: "#ffffff", weight: 2.5, fillColor: "#059669", fillOpacity: 1 }}
            >
              <Tooltip className="text-[12px]" direction="top" offset={[0, -8]}>
                <span className="font-mono tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
              </Tooltip>
            </CircleMarker>
            <CircleMarker
              center={[lat, lng]}
              radius={32}
              pathOptions={{ color: "#059669", weight: 1.2, fillColor: "#059669", fillOpacity: 0.12, dashArray: "4 3" }}
              interactive={false}
            />
          </>
        ) : null}
      </MapContainer>
      <div
        className="pointer-events-none absolute inset-x-2 bottom-2 z-[600] rounded-md border bg-background/92 px-2 py-1 text-[11px] leading-tight shadow-sm backdrop-blur"
        aria-hidden
      >
        Clic sur la carte pour définir les coordonnées du panneau
        {hasPoint ? <span className="ml-1 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">· {lat.toFixed(5)}, {lng.toFixed(5)}</span> : null}
      </div>
    </div>
  )
}
