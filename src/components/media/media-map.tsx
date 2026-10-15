'use client'

// CarbuScope — T57 — Media Planner « carte des supports » : fond carto réel
// OpenStreetMap (convention T57 « toutes les cartes fond OSM » — plan
// communautaire PAR DÉFAUT, satellite/nuit en options explicites), monté
// UNIQUEMENT côté client via dynamic(..., { ssr: false }) depuis
// media-inventory.tsx (pattern hub-map / shadow-osm-map).
// Marqueurs : CircleMarker ∝ contacts/jour, couleur par TYPE de support
// (12 types — palette chaude émeraude/ambre/terracotta, jamais bleue),
// halo blanc sur les supports SÉLECTIONNÉS pour la simulation de campagne.
// Popup riche (toutes les données attributaires clés) + bouton
// Sélectionner/Retirer directement dans le popup.

import { useEffect, useMemo } from "react"
import * as L from "leaflet"
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import {
  supportMeta, supportLabel, formatTnd, formatNum,
  PANEL_STATUT_META, ENVIRONNEMENT_LABELS,
} from "./media-shared"
import type { MediaPanelDTO } from "./media-shared"

// Tunisie : lat 30.2→37.6, lng 7.5→11.9 (marges incluses — convention projet).
const TUNISIA_BOUNDS: L.LatLngBoundsExpression = [[30.1, 7.4], [37.7, 11.95]]
const MAX_BOUNDS: L.LatLngBoundsExpression = [[27.5, 4.5], [41.0, 15.0]]

export type MediaBasemap = "osm" | "satellite" | "noir"

const TILES: Record<MediaBasemap, { url: string; attribution: string; maxZoom: number }> = {
  // Plan communautaire OpenStreetMap — fond PAR DÉFAUT (demande T57).
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
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

/** Rayon ∝ contacts/jour : 5 px → 16 px (plafond 60 000 contacts/j). */
function panelRadius(contactsJ: number): number {
  const ratio = Math.max(0, Math.min(1, contactsJ / 60000))
  return 5 + 11 * ratio
}

function MapEffects({
  focus, resizeKey, fitSignature,
}: {
  focus: { lat: number; lng: number; zoom?: number } | null
  resizeKey: number
  fitSignature: string
}) {
  const map = useMap()

  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft")
  }, [map])

  // Cadrage initial + re-cadrage quand les FILTRES changent (signature des
  // identifiants visibles) — la carte suit la table, jamais l'inverse.
  useEffect(() => {
    map.fitBounds(L.latLngBounds(TUNISIA_BOUNDS as L.LatLngTuple[]), { padding: [12, 12] })
  }, [map, fitSignature])

  // Survol doux vers la cible (clic ligne de table / fiche).
  useEffect(() => {
    if (!focus) return
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 12), { duration: 0.6 })
  }, [map, focus])

  // Plein écran entré/sorti → recalcul de la taille des tuiles.
  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize() }, 80)
    return () => clearTimeout(t)
  }, [map, resizeKey])

  return null
}

export interface MediaMapProps {
  /** Supports déjà filtrés par le panneau de filtres parent. */
  panels: MediaPanelDTO[]
  /** Identifiants sélectionnés pour la simulation (halo blanc). */
  selectedIds: ReadonlySet<string>
  basemap: MediaBasemap
  /** Cible de survol doux (clic ligne de table) — { lat, lng, zoom? }. */
  focus: { lat: number; lng: number; zoom?: number } | null
  /** Clé incrémentée à chaque changement de taille (plein écran) → invalidateSize. */
  resizeKey: number
  /** Signature des supports visibles → re-cadrage à chaque changement de filtre. */
  fitSignature: string
  /** Sélection/déselection depuis le popup de la carte. */
  onToggleSelect: (p: MediaPanelDTO) => void
}

export function MediaMap({
  panels, selectedIds, basemap, focus, resizeKey, fitSignature, onToggleSelect,
}: MediaMapProps) {
  const tiles = TILES[basemap] ?? TILES.osm

  // Légende : une entrée par FAMILLE présente (≤ 5 — compact, jamais bleu).
  const legend = useMemo(() => {
    const familles = new Map<string, { label: string; color: string; count: number }>()
    for (const p of panels) {
      const meta = supportMeta(p.supportType)
      const cur = familles.get(meta.famille)
      if (cur) cur.count += 1
      else familles.set(meta.famille, { label: familleLabel(meta.famille), color: meta.color, count: 1 })
    }
    return [...familles.values()]
  }, [panels])

  return (
    <div className="relative h-full w-full" role="application" aria-label="Carte OpenStreetMap des supports média">
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
        <MapEffects focus={focus} resizeKey={resizeKey} fitSignature={fitSignature} />

        {panels.map(p => {
          const meta = supportMeta(p.supportType)
          const selected = selectedIds.has(p.id)
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={panelRadius(p.contactsJ) + (selected ? 2.5 : 0)}
              pathOptions={{
                color: selected ? "#ffffff" : meta.color,
                weight: selected ? 3.5 : 1.5,
                fillColor: meta.color,
                fillOpacity: selected ? 0.95 : 0.72,
              }}
            >
              <Popup className="text-[13px]">
                <div className="min-w-[230px] space-y-1.5">
                  <p className="m-0 text-[13px] font-semibold leading-snug">{p.name}</p>
                  <p className="m-0 text-[11.5px] text-zinc-500">
                    {p.code} · {supportLabel(p.supportType)} · {p.format}
                  </p>
                  <div className="space-y-0.5 text-[12px] leading-snug">
                    <p className="m-0">
                      <span className="font-medium">{p.gouvernorat}</span> — {p.delegation}
                      {p.ville ? ` (${p.ville})` : ""}
                    </p>
                    <p className="m-0">{p.axe}</p>
                    <p className="m-0">{ENVIRONNEMENT_LABELS[p.environnement] ?? p.environnement} · visibilité {p.visibilite}/100</p>
                    <p className="m-0">
                      {formatNum(p.traficVehJ)} véh./j · {formatNum(p.contactsJ)} contacts/j
                    </p>
                    <p className="m-0">
                      {formatTnd(p.coutMensuel)}/mois
                      {p.cpm !== null ? ` · CPM ${p.cpm.toLocaleString("fr-FR")} DT` : ""}
                    </p>
                    <p className="m-0 text-zinc-500">
                      {PANEL_STATUT_META[p.statut]?.label ?? p.statut} · {p.reseau === "PROPRIETAIRE" ? "média propriétaire" : (p.regie ?? "régie externe")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleSelect(p)}
                    className="mt-1 w-full rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[12px] font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                  >
                    {selected ? "Retirer de la sélection" : "Sélectionner pour la simulation"}
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* Légende flottante compacte (familles de supports). */}
      {legend.length > 0 && (
        <div
          className="pointer-events-none absolute bottom-2 right-2 z-[500] rounded-lg border bg-[var(--c-paper)]/95 px-2.5 py-2 text-[11px] shadow-md backdrop-blur-sm dark:bg-zinc-900/90"
          aria-hidden
        >
          {legend.map(f => (
            <p key={f.label} className="m-0 flex items-center gap-1.5 leading-5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />
              <span className="font-medium">{f.label}</span>
              <span className="text-zinc-500">({f.count})</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Libellé FR des familles de supports. */
function familleLabel(famille: string): string {
  switch (famille) {
    case "GRAND_FORMAT": return "Grand format"
    case "MOBILIER": return "Mobilier urbain"
    case "DIGITAL": return "Digital / DOOH"
    case "PROPRIETAIRE": return "Média station (propriétaire)"
    default: return "Enseigne"
  }
}
