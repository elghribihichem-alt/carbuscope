'use client'

// CarbuScope — Comparateur de stations (extension A.4 « Mes stations »)
// Compare 2 à 3 stations côte à côte : trafic captif, note communautaire,
// horaires, services (matrice des différenciants), fraîcheur — avec mise en
// avant du meilleur profil et scores par critère.

import { Check, Crosshair, Eye, Minus, Star, Trophy } from "lucide-react"
import type { StationDTO } from "@/lib/types"
import { SERVICE_LABELS } from "@/lib/types"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusBadge } from "@/components/shell/badges"
import { formatDateFr } from "./station-utils"

const SERVICE_SLUGS = Object.keys(SERVICE_LABELS)
const CRITERIA_COUNT = 4 // trafic, note, services, fraîcheur

const cellCls = "border-b px-3 py-2.5 align-middle"
const labelCls = cn(cellCls, "bg-muted/40 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground")

function WinnerMark() {
  return (
    <span
      className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700"
      title="Meilleur score sur ce critère"
    >
      <Trophy className="h-2.5 w-2.5" aria-hidden />
      Top
    </span>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Note ${rating.toFixed(1).replace(".", ",")} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-3.5 w-3.5", i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
          aria-hidden
        />
      ))}
    </span>
  )
}

export const MAX_COMPARE_STATIONS = 4 // nombre maximal de stations comparables côte à côte

export function StationCompareDialog({
  open, stations, onClose, onOpenDetail, onLocate,
}: {
  open: boolean
  stations: StationDTO[]
  onClose: () => void
  onOpenDetail: (id: string) => void
  onLocate?: (code: string) => void
}) {
  const n = stations.length
  if (n === 0) return null

  // ---- Meilleurs scores par critère ----
  const bestTraffic = Math.max(...stations.map(s => s.traffic))
  const bestRating = Math.max(...stations.map(s => s.rating))
  const bestServices = Math.max(...stations.map(s => s.services.length))
  const bestVerified = Math.max(...stations.map(s => new Date(s.lastVerified).getTime()))
  const maxTraffic = bestTraffic || 1

  const wins = stations.map(s => {
    let w = 0
    if (s.traffic === bestTraffic) w += 1
    if (s.rating === bestRating) w += 1
    if (s.services.length === bestServices) w += 1
    if (new Date(s.lastVerified).getTime() === bestVerified) w += 1
    return w
  })
  const maxWins = Math.max(...wins)
  const championIdx = maxWins > 0 ? wins.indexOf(maxWins) : -1
  const champion = championIdx >= 0 ? stations[championIdx] : null

  // ---- Matrice des services (différenciants) ----
  const matrixServices = SERVICE_SLUGS.filter(slug => stations.some(s => s.services.includes(slug)))
  const gridCols = {
    gridTemplateColumns: `150px repeat(${n}, minmax(160px, 1fr))`,
    minWidth: `${Math.max(520, 160 + n * 180)}px`,
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="gap-0 p-0 sm:max-w-4xl max-w-[calc(100vw-2rem)]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            Comparateur de stations
            <Badge variant="secondary" className="font-mono text-[10px]">{n}/{MAX_COMPARE_STATIONS}</Badge>
          </DialogTitle>
          <DialogDescription>
            Comparaison côte à côte sur {CRITERIA_COUNT} critères — trafic captif, note communautaire, services et fraîcheur des données.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-5 py-4">
            {/* Défilement horizontal sur petits écrans */}
            <div className="overflow-x-auto">
              <div className="grid text-sm" style={gridCols} role="table" aria-label="Comparaison des stations">

                {/* En-têtes : identité des stations */}
                <div className={labelCls}>Station</div>
                {stations.map((s, i) => (
                  <div key={s.id} className={cn(cellCls, "min-w-0")}>
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: s.brandColor }}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold leading-tight">{s.name}</span>
                        <span className="block font-mono text-[10px] leading-tight text-muted-foreground">{s.code}</span>
                      </span>
                    </div>
                  </div>
                ))}

                {/* Statut */}
                <div className={labelCls}>Statut</div>
                {stations.map(s => (
                  <div key={s.id} className={cellCls}><StatusBadge status={s.status} /></div>
                ))}

                {/* Localisation */}
                <div className={labelCls}>Localisation</div>
                {stations.map(s => (
                  <div key={s.id} className={cellCls}>
                    <p className="text-[13px] font-medium leading-tight">{s.gouvernorat}</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">{s.delegation}</p>
                  </div>
                ))}

                {/* Trafic captif */}
                <div className={labelCls}>Trafic captif</div>
                {stations.map(s => (
                  <div key={s.id} className={cellCls}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold tabular-nums">{num(s.traffic)}</span>
                      <span className="text-[11px] text-muted-foreground">véh./j</span>
                      {s.traffic === bestTraffic && n > 1 && <WinnerMark />}
                    </div>
                    <div className="mt-1.5 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className={cn("h-full rounded-full", s.traffic === bestTraffic && n > 1 ? "bg-emerald-500" : "bg-muted-foreground/40")}
                        style={{ width: `${Math.min(100, Math.round((s.traffic / maxTraffic) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Note communautaire */}
                <div className={labelCls}>Note</div>
                {stations.map(s => (
                  <div key={s.id} className={cellCls}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Stars rating={s.rating} />
                      {s.rating === bestRating && n > 1 && <WinnerMark />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {s.rating.toFixed(1).replace(".", ",")}/5 · {s.reviewsCount} avis
                    </p>
                  </div>
                ))}

                {/* Horaires */}
                <div className={labelCls}>Horaires</div>
                {stations.map(s => (
                  <div key={s.id} className={cn(cellCls, "space-x-1.5")}>
                    {s.open24 ? (
                      <Badge className="bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">24h/24</Badge>
                    ) : null}
                    {s.open7j ? (
                      <Badge className="bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100">7j/7</Badge>
                    ) : null}
                    {!s.open24 && !s.open7j ? <span className="text-[12px] text-muted-foreground">Horaires classiques</span> : null}
                  </div>
                ))}

                {/* Services */}
                <div className={labelCls}>Services</div>
                {stations.map(s => (
                  <div key={s.id} className={cellCls}>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums", s.services.length === bestServices && n > 1 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                        {s.services.length}
                      </span>
                      {s.services.length === bestServices && n > 1 && <WinnerMark />}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {s.services.map(x => SERVICE_LABELS[x] ?? x).join(" · ") || "—"}
                    </p>
                  </div>
                ))}

                {/* Fraîcheur de la donnée */}
                <div className={labelCls}>Vérification</div>
                {stations.map(s => (
                  <div key={s.id} className={cellCls}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium">{formatDateFr(s.lastVerified)}</span>
                      {new Date(s.lastVerified).getTime() === bestVerified && n > 1 && <WinnerMark />}
                    </div>
                    <p className="max-w-[160px] truncate text-[11px] text-muted-foreground" title={s.verifiedBy}>
                      {s.verifiedBy || "—"}
                    </p>
                  </div>
                ))}

                {/* Score global + fiche */}
                <div className={labelCls}>Score comparatif</div>
                {stations.map((s, i) => (
                  <div key={s.id} className={cellCls}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          i === championIdx ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Trophy className="h-3 w-3" aria-hidden />
                        {wins[i]}/{CRITERIA_COUNT}
                      </span>
                      {i === championIdx && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Meilleur profil</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Button
                        variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                        onClick={() => onOpenDetail(s.id)}
                      >
                        <Eye className="h-3 w-3" aria-hidden />
                        Fiche
                      </Button>
                      {onLocate && (
                        <Button
                          variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
                          onClick={() => onLocate(s.code)}
                          title="Centrer la carte sur cette station"
                        >
                          <Crosshair className="h-3 w-3" aria-hidden />
                          Carte
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Matrice des services différenciants (A.5.3) */}
            {matrixServices.length > 0 && (
              <section className="mt-5" aria-label="Services différenciants">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Services différenciants
                </p>
                <div className="overflow-x-auto">
                  <div className="grid text-sm" style={gridCols} role="table" aria-label="Matrice des services">
                    {matrixServices.map(slug => {
                      const common = stations.every(s => s.services.includes(slug))
                      return (
                        <div key={slug} className="contents">
                          <div className={cn(labelCls, "flex items-center gap-1.5")}>
                            <span
                              aria-hidden
                              className={cn("h-1.5 w-1.5 rounded-full", common ? "bg-muted-foreground/40" : "bg-amber-500")}
                              title={common ? "Service commun" : "Service différenciant"}
                            />
                            {SERVICE_LABELS[slug]}
                          </div>
                          {stations.map(s => (
                            <div key={`${s.id}-${slug}`} className={cn(cellCls, "text-center")}>
                              {s.services.includes(slug) ? (
                                <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Disponible" />
                              ) : (
                                <Minus className="mx-auto h-4 w-4 text-muted-foreground/30" aria-label="Non disponible" />
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                  Point ambre = service différenciant (présent chez certains concurrents seulement) · coche = disponible.
                </p>
              </section>
            )}

            {/* Synthèse */}
            {champion && n > 1 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-amber-800">
                  <Trophy className="h-4 w-4" aria-hidden />
                  Analyse comparative — meilleur profil global : {champion.name}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-800/80">
                  {champion.name} domine {wins[championIdx] ?? 0} critère{((wins[championIdx] ?? 0) > 1) ? "s" : ""} sur {CRITERIA_COUNT}
                  {" "}({num(champion.traffic)} véh./j de trafic captif, note {champion.rating.toFixed(1).replace(".", ",")}/5,
                  {" "}{champion.services.length} services, fiche vérifiée le {formatDateFr(champion.lastVerified)}).
                  Les services différenciants ci-dessus signalent les axes d&apos;investissement pour combler l&apos;écart.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
