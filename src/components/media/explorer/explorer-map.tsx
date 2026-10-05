'use client'

// CarbuScope — T60-e — fond cartographique de l'explorateur de faces (pattern
// hub-map / osm-map : MapContainer + TileLayer, monté UNIQUEMENT côté client
// via dynamic(..., { ssr: false }) depuis media-explorer.tsx). Un CircleMarker
// par FACE : FULL (émeraude #059669, position du panneau parent — léger décalage
// en cercle pour distinguer les faces d'un même panneau), AGGREGE (ambre
// #d97706 semi-transparent, position approximative du DTO — le jitter ±500 m
// est calculé côté serveur, AUCUNE position exacte ne transite). Sélection =
// contour terracotta épais. Popup : code, ville, format, statut + bouton
// « sélectionner » (FULL seulement — clic marqueur = toggle sélection).
// Fond : OSM jour / Esri Dark Gray nuit (suit le thème). Cadrage Tunisie.

import { useEffect, useMemo } from "react"
import * as L from "leaflet"
import "@/lib/leaflet-canvas-guard"
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "next-themes"
import { Lock } from "lucide-react"
import { FACE_STATUS_META, useLocalT } from "@/components/media/media-shared"
import type { FaceAccess, PanelNestedDTO } from "@/lib/media/shared"
import { X_COLORS, X_DICT } from "./explorer-shared"

const TILES = {
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
    maxZoom: 19,
  },
  noir: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tuiles &copy; Esri, HERE, Garmin — fond minimal nuit",
    maxZoom: 16,
  },
} as const

/** Point marqué sur la carte : une face (position agrégée pour AGGREGE,
 *  position du panneau parent légèrement décalée pour FULL). */
interface MapFace {
  id: string
  code: string
  ville: string
  governorat: string
  format: string
  statut: string
  access: FaceAccess
  lat: number
  lng: number
}

/** Effets carte : attribution bas-gauche + survol doux vers la face ouverte
 *  en fiche détail (focusFaceId). */
function MapEffects({ focus }: { focus: MapFace | null }) {
  const map = useMap()
  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft")
  }, [map])
  useEffect(() => {
    if (!focus) return
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 12), { duration: 0.6 })
  }, [map, focus])
  return null
}

export interface ExplorerMapProps {
  panels: PanelNestedDTO[]
  selectedIds: string[]
  onToggleSelect: (faceId: string, access: FaceAccess) => void
  focusFaceId: string | null
}

export function ExplorerLeafletMap({ panels, selectedIds, onToggleSelect, focusFaceId }: ExplorerMapProps) {
  const { resolvedTheme } = useTheme()
  const { t } = useLocalT(X_DICT)
  const tiles = resolvedTheme === "dark" ? TILES.noir : TILES.street
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  // Décalage en cercle autour du panneau pour les faces FULL d'un même
  // panneau (≈120 m) : les marqueurs restent groupés mais cliquables.
  const faces = useMemo<MapFace[]>(() => {
    const out: MapFace[] = []
    for (const p of panels) {
      const n = Math.max(1, p.faces.length)
      p.faces.forEach((f, i) => {
        if (f.access === "FULL") {
          const a = (2 * Math.PI * i) / n + (p.id.charCodeAt(0) % 7) / 7
          out.push({
            id: f.id, code: f.code, ville: p.ville, governorat: p.governorat, format: p.format,
            statut: f.status, access: "FULL",
            lat: p.lat + 0.0012 * Math.sin(a), lng: p.lng + 0.0012 * Math.cos(a),
          })
        } else {
          out.push({
            id: f.id, code: f.code, ville: f.ville, governorat: f.governorat, format: f.format,
            statut: f.statut, access: "AGGREGE", lat: f.lat, lng: f.lng,
          })
        }
      })
    }
    return out
  }, [panels])

  const focus = useMemo(
    () => (focusFaceId ? faces.find(f => f.id === focusFaceId) ?? null : null),
    [faces, focusFaceId],
  )

  return (
    <div className="relative h-full w-full" role="application" aria-label="Carte des faces d'affichage">
      <MapContainer
        center={[34.5, 9.5]}
        zoom={6}
        minZoom={6}
        maxZoom={18}
        maxBounds={[[27.5, 4.5], [41.0, 15.0]]}
        maxBoundsViscosity={0.7}
        preferCanvas
        className="h-full w-full"
        style={{ background: "var(--background)" }}
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        {faces.map(f => {
          const isSel = selected.has(f.id)
          const isFull = f.access === "FULL"
          return (
            <CircleMarker
              key={f.id}
              center={[f.lat, f.lng]}
              radius={isSel ? 8 : isFull ? 6 : 7}
              pathOptions={{
                color: isSel ? X_COLORS.selected : isFull ? "#065f46" : "#92400e",
                weight: isSel ? 3.5 : isFull ? 1.6 : 1.8,
                fillColor: isSel ? X_COLORS.selected : isFull ? X_COLORS.full : X_COLORS.aggrege,
                fillOpacity: isSel ? 1 : isFull ? 0.88 : 0.55,
              }}
              eventHandlers={{ click: () => onToggleSelect(f.id, f.access) }}
            >
              <Popup className="text-[13px]">
                <p className="m-0 font-mono text-[11px] font-semibold">{f.code}</p>
                <p className="m-0 mt-0.5 leading-snug">{f.ville} · {f.governorat}</p>
                <p className="m-0 leading-snug text-zinc-600">{f.format}</p>
                <p className="m-0 leading-snug">
                  <span className="font-medium">{FACE_STATUS_META[f.statut]?.label ?? f.statut}</span>
                  {!isFull && (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                      <Lock className="h-2.5 w-2.5" aria-hidden /> {t("x.map.restricted")}
                    </span>
                  )}
                </p>
                {isFull ? (
                  <button
                    type="button"
                    className="mt-1.5 flex h-8 min-w-24 items-center justify-center gap-1 rounded-md border border-emerald-600 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    onClick={() => onToggleSelect(f.id, f.access)}
                  >
                    {isSel ? t("x.map.unselect") : t("x.map.select")}
                  </button>
                ) : (
                  <p className="m-0 mt-1 max-w-[170px] text-[10px] italic leading-snug text-zinc-500">
                    {t("x.map.restrictedHint")}
                  </p>
                )}
              </Popup>
            </CircleMarker>
          )
        })}
        <MapEffects focus={focus} />
      </MapContainer>

      {/* — Légende en cartouche (motif carte interactive) — */}
      <div
        className="pointer-events-none absolute right-2 top-2 z-[600] rounded-lg border bg-background/92 px-2.5 py-2 text-[11px] leading-tight shadow-md backdrop-blur"
        aria-hidden
      >
        <p className="m-0 mb-1 font-semibold uppercase tracking-wide text-muted-foreground">{t("x.map.legend")}</p>
        <p className="m-0 flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" /> {t("x.map.legend.full")}
        </p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/60" /> {t("x.map.legend.aggrege")}
        </p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-[2.5px] border-[#b0563b]" /> {t("x.map.legend.selected")}
        </p>
      </div>
    </div>
  )
}
