"use client"

// Shadow Market (T44-c) — carte du marché parallèle : VRAI fond OpenStreetMap.
// Ce fichier est le portail public du composant : il conserve l'interface
// historique (mêmes props, mêmes types) et monte la carte Leaflet côté client
// uniquement via dynamic(..., { ssr: false }) — pattern tunisia-map → osm-map
// et hub-carte → hub-map. L'implémentation réelle est dans shadow-map-leaflet.

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

export type {
  ShadowFocusTarget, StationRadii, RoadTrace, ShadowMapProps,
} from "./shadow-map-leaflet"
import type { ShadowMapProps } from "./shadow-map-leaflet"

// Fond cartographique réel (Leaflet + tuiles OpenStreetMap) — chargé côté client uniquement.
const ShadowMapLeaflet = dynamic(() => import("./shadow-map-leaflet").then(m => m.ShadowMapLeaflet), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-secondary/30 backdrop-blur-[2px]">
      <span className="inline-flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement du fond cartographique…
      </span>
    </div>
  ),
})

export function ShadowMap({ height = "h-[520px]", className, ...props }: ShadowMapProps) {
  // Le cadre visuel (bordure, arrondi, dégradé, hauteur) vit ici : l'espace est
  // réservé dès le chargement du chunk Leaflet (pas de saut de mise en page).
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-stone-200 bg-[radial-gradient(ellipse_at_center,var(--secondary)_0%,var(--background)_78%)] dark:border-stone-800 ${height} ${className ?? ""}`}
      role="region"
      aria-label="Carte du marché parallèle (fond OpenStreetMap)"
    >
      <ShadowMapLeaflet height="h-full" {...props} />
    </div>
  )
}
