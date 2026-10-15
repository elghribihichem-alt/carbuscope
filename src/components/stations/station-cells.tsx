'use client'

// CarbuScope — Module « Mes stations » : cellules partagées entre la vue tableau
// (stations-tab.tsx), la vue arborescence (stations-nested-view.tsx) et l'onglet
// « Concurrents ». Fichier sans dépendance circulaire (importé par les deux vues).

import { Bookmark, BookmarkCheck, Star } from "lucide-react"
import type { StationDTO } from "@/lib/types"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** Trafic captif (véh./j) sous lequel une station active est « sous tension ». */
export const TENSION_THRESHOLD = 1100

/** Cellule « Trafic captif » : valeur + mini-barre relative au maximum de la liste. */
export function TrafficCell({ station, maxTraffic }: { station: StationDTO; maxTraffic: number }) {
  const pct = maxTraffic > 0 ? Math.min(100, Math.round((station.traffic / maxTraffic) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right font-medium tabular-nums">{num(station.traffic)}</span>
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", station.status === "ACTIVE" && station.traffic < TENSION_THRESHOLD ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Bouton icône « Favoris » (étoile) — état actif rempli ambre. */
export function FavoriteButton({
  active, onClick, stationName, className,
}: {
  active: boolean
  onClick: () => void
  stationName: string
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", active && "text-amber-500 hover:text-amber-600", className)}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={active ? `Retirer ${stationName} des favoris` : `Ajouter ${stationName} aux favoris`}
      aria-label={active ? `Retirer ${stationName} des favoris` : `Ajouter ${stationName} aux favoris`}
      aria-pressed={active}
    >
      <Star className={cn("h-4 w-4", active && "fill-amber-400")} aria-hidden />
    </Button>
  )
}

/** Bouton icône « Suivre » (liste de veille des concurrents) — état actif terracotta. */
export function WatchButton({
  active, onClick, stationName, className,
}: {
  active: boolean
  onClick: () => void
  stationName: string
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", active && "text-[var(--c-terra)] hover:text-[var(--c-terra-ink)]", className)}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={active ? `Ne plus suivre ${stationName}` : `Suivre ${stationName} — veille concurrentielle`}
      aria-label={active ? `Ne plus suivre ${stationName}` : `Suivre ${stationName}`}
      aria-pressed={active}
    >
      {active ? <BookmarkCheck className="h-4 w-4 fill-[var(--a-rd-100)]" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
    </Button>
  )
}
