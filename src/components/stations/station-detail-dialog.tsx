'use client'

// CarbuScope — fiche station complète (A.4 / A.3.3) : identité, photo, services,
// avis récents, historique des modifications et concurrents à proximité.

import { useEffect, useState } from "react"
import {
  ArrowRight, Clock, Fuel, History, Loader2, MapPin, MessageSquare,
  Pencil, ShieldCheck, Star,
} from "lucide-react"
import type { ReviewDTO, StationDTO, StationDetail } from "@/lib/types"
import { useAppStore } from "@/store/app-store"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/shell/badges"
import { ServiceChips } from "./service-chip"
import { FIELD_LABELS, formatDateFr } from "./station-utils"

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

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </p>
  )
}

function ReviewRow({ review }: { review: ReviewDTO }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-xs font-semibold">{review.author}</p>
        <Stars rating={review.rating} />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{review.comment}</p>
      <p className="mt-1 text-[10px] text-muted-foreground/70">{formatDateFr(review.createdAt)}</p>
    </div>
  )
}

export function StationDetailDialog({
  stationId,
  onClose,
  onEdit,
  onLocate,
}: {
  stationId: string | null
  onClose: () => void
  onEdit: (station: StationDTO) => void
  onLocate: (code: string) => void
}) {
  const myBrand = useAppStore((s) => s.brandSlug)
  const [loaded, setLoaded] = useState<{ key: string; data: StationDetail } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)

  useEffect(() => {
    if (!stationId) return
    const ctrl = new AbortController()
    fetch(`/api/stations/${encodeURIComponent(stationId)}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<StationDetail>
      })
      .then((data) => {
        setLoaded({ key: stationId, data })
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setFailed({ key: stationId, message: e instanceof Error ? e.message : "Erreur inconnue" })
      })
    return () => ctrl.abort()
  }, [stationId])

  const open = stationId != null
  const detail = open && loaded?.key === stationId ? loaded.data : null
  const errorMsg = open && failed?.key === stationId ? failed.message : null
  const s = detail?.station ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        {errorMsg ? (
          <div className="py-8 text-center">
            <p className="font-semibold text-red-600 dark:text-red-400">Fiche indisponible</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
          </div>
        ) : !s ? (
          <div className="flex flex-col items-center gap-3 py-14 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <p className="text-sm">Chargement de la fiche station…</p>
          </div>
        ) : (
          <>
            <DialogHeader className="space-y-2">
              <DialogTitle asChild>
                <div className="flex items-center gap-2.5 pr-8 text-left">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                  <span className="truncate text-lg font-semibold leading-none">{s.name}</span>
                </div>
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{s.code}</span>
                <StatusBadge status={s.status} />
                <Badge variant="outline" className="tabular-nums">{num(s.traffic)} véh./jour</Badge>
                <Badge variant="outline" className="tabular-nums">
                  <Star className="mr-1 h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                  {s.rating.toFixed(1).replace(".", ",")} · {s.reviewsCount} avis
                </Badge>
                {s.open24 && (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                    24h/24
                  </Badge>
                )}
                {s.open7j && (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                    7j/7
                  </Badge>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Photo ou placeholder dégradé */}
              {s.photoUrl ? (
                <img src={s.photoUrl} alt={`Photo de la station ${s.name}`} className="h-44 w-full rounded-xl object-cover" />
              ) : (
                <div className="flex h-44 w-full items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 via-amber-50 to-orange-100 dark:from-emerald-950 dark:via-slate-900 dark:to-amber-950">
                  <Fuel className="h-10 w-10 text-muted-foreground/30" aria-hidden />
                </div>
              )}

              {/* Bloc d'informations */}
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl border p-3">
                  <SectionTitle icon={MapPin}>Coordonnées</SectionTitle>
                  <p className="text-sm font-medium">{s.address || "Adresse non renseignée"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.delegation} · {s.gouvernorat}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                    {s.lat.toFixed(4).replace(".", ",")}° N — {s.lng.toFixed(4).replace(".", ",")}° E
                  </p>
                </section>

                <section className="rounded-xl border p-3">
                  <SectionTitle icon={Clock}>Horaires</SectionTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={s.open24
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : "text-muted-foreground"}>
                      24h/24
                    </Badge>
                    <Badge variant="outline" className={s.open7j
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : "text-muted-foreground"}>
                      7j/7
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {s.open24 ? "service continu" : "horaires classiques"} · {s.open7j ? "ouverture 7 jours" : "fermeture hebdomadaire"}
                    </span>
                  </div>
                </section>

                <section className="rounded-xl border p-3">
                  <SectionTitle icon={Fuel}>Services ({s.services.length})</SectionTitle>
                  <ServiceChips services={s.services} max={99} showLabels className="max-w-72" />
                </section>

                <section className="rounded-xl border p-3">
                  <SectionTitle icon={ShieldCheck}>Vérification</SectionTitle>
                  <p className="text-sm font-medium">{formatDateFr(s.lastVerified)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Source : {s.verifiedBy || "—"}</p>
                </section>
              </div>

              {/* Avis récents + historique */}
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border p-3">
                  <SectionTitle icon={MessageSquare}>Avis récents</SectionTitle>
                  {detail && detail.reviews.length > 0 ? (
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {detail.reviews.slice(0, 3).map((r) => <ReviewRow key={r.id} review={r} />)}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">Aucun avis pour cette station.</p>
                  )}
                </section>

                <section className="rounded-xl border p-3">
                  <SectionTitle icon={History}>Historique des modifications</SectionTitle>
                  {detail && detail.history.length > 0 ? (
                    <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                      {detail.history.map((h) => (
                        <div key={h.id} className="text-xs">
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="font-semibold">{FIELD_LABELS[h.field] ?? h.field}</span>
                            <span className="text-muted-foreground/70 line-through">{h.oldValue || "—"}</span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
                            <span className="font-medium">{h.newValue || "—"}</span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {h.author || "—"} · {formatDateFr(h.createdAt)} {h.source ? `· ${h.source}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">Aucune modification enregistrée.</p>
                  )}
                </section>
              </div>

              {/* Concurrents à proximité */}
              <section className="rounded-xl border p-3">
                <SectionTitle icon={MapPin}>Stations à proximité</SectionTitle>
                {detail && detail.nearby.length > 0 ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {detail.nearby.slice(0, 10).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onLocate(n.code)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                        title={`Voir ${n.name} sur la carte`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: n.brandColor }} aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{n.name}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {n.brandName}
                              {n.brandSlug === myBrand ? " · mon réseau" : ""}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                          {n.distanceKm < 1
                            ? `${Math.round(n.distanceKm * 1000)} m`
                            : `${n.distanceKm.toFixed(1).replace(".", ",")} km`}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Aucune station recensée à proximité.</p>
                )}
              </section>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onLocate(s.code)}>
                <MapPin className="h-4 w-4" aria-hidden />
                Voir sur la carte
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => onEdit(s)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Modifier la fiche
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
