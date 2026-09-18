'use client'

// CarbuScope Mobile — Fiche station (B.2.3)
// Photo, identité, services, horaires, note + avis récents (lazy fetch),
// actions Itinéraire / Signaler / Avis, favori (B.2.7), stations à proximité.

import { BadgeCheck, Clock3, Flag, Heart, MapPin, Navigation, Share2, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/shell/badges"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { formatDate, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import {
  BrandDot, ScreenHeader, SectionTitle, StarRating, driveMinutes, fmtKm, fmtNote,
} from "../shared"
import { relativeDate } from "@/lib/i18n"
import { useFavoritesStore } from "../favorites-store"

export function StationScreen({ api }: { api: AppApi }) {
  const { t, lang, locale, svc } = useI18n()
  const s = api.selected
  const isFav = useFavoritesStore(st => (s ? st.stationIds.includes(s.id) : false))
  const toggleFavorite = useFavoritesStore(st => st.toggleFavorite)
  if (!s) return null

  const onToggleFav = () => {
    const next = !isFav
    toggleFavorite(s.id)
    if (next) {
      toast.success(t("station.favAdded"), { description: t("station.favAddedDesc") })
    } else {
      toast.info(t("station.favRemoved"))
    }
  }

  const reviews = (api.detail?.reviews ?? []).slice(0, 3)
  const nearbyChips = (api.detail?.nearby ?? []).slice(0, 6)
  const horaires = s.open24
    ? t("station.hours24")
    : s.open7j
      ? t("station.hours7j")
      : t("station.hoursDefault")

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader
        title={t("station.title")}
        subtitle={s.brandName}
        onBack={api.back}
        right={
          <span className="me-1 flex items-center">
            <button
              type="button"
              aria-label={isFav ? t("station.removeFavAria") : t("station.addFavAria")}
              aria-pressed={isFav}
              onClick={onToggleFav}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90",
                isFav ? "bg-amber-50 text-amber-500" : "text-slate-500 hover:bg-slate-100"
              )}
            >
              <Heart className={cn("h-[18px] w-[18px] transition-transform", isFav && "scale-110 fill-amber-400 text-amber-500")} />
            </button>
            <button
              type="button"
              aria-label={t("station.shareAria")}
              onClick={() => toast.success(t("station.shareToast"))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100"
            >
              <Share2 className="h-[18px] w-[18px]" />
            </button>
          </span>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* Photo + identité */}
        <div className="relative h-40 shrink-0">
          {s.photoUrl ? (
            <img src={s.photoUrl} alt={`Photo de la station ${s.name}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900">
              <svg viewBox="0 0 24 24" className="h-14 w-14 text-white/50" fill="currentColor" aria-hidden>
                <path d="M3 22V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M12 10h7a1 1 0 0 1 1 1v11M3 22h18M6 9h4M6 13h4M6 17h4M15.5 14h1M15.5 18h1M6 5V2h7v3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </svg>
          </div>
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute inset-x-3 bottom-2.5 text-white">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200">
              <BrandDot color={s.brandColor} />
              {s.brandName}
            </p>
            <h2 className="mt-0.5 truncate text-[17px] font-extrabold leading-tight drop-shadow-sm">{s.name}</h2>
          </div>
        </div>

        <div className="space-y-4 px-3 py-3">
          {/* Adresse + distance */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{s.address}</p>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700">
              {fmtKm(s.distanceKm)} · {driveMinutes(s.distanceKm)} {t("common.min")}
            </span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={s.status} />
            {s.open24 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <Clock3 className="h-3 w-3" /> {t("common.open24h")}
              </span>
            )}
            {s.open7j && !s.open24 && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{t("common.open7j")}</span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
              {fmtNote(s.rating)} · {t("station.reviewsUnit", { n: s.reviewsCount })}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {s.traffic > 0 ? t("station.trafficEst", { n: new Intl.NumberFormat(locale).format(s.traffic) }) : t("station.trafficNone")}
            </span>
          </div>

          {/* Services (B.2.3) */}
          <section>
            <SectionTitle>{t("station.services")}</SectionTitle>
            {s.services.length ? (
              <div className="grid grid-cols-3 gap-1.5">
                {s.services.map(slug => {
                  const Icon = SERVICE_ICONS[slug]
                  return (
                    <div key={slug} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-white p-2.5">
                      {Icon ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <Icon className="h-4 w-4" />
                        </span>
                      ) : null}
                      <span className="text-center text-[10px] font-medium leading-tight text-slate-600">{svc(slug)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-center text-[12px] text-slate-400">
                {t("station.noServices")}
              </p>
            )}
          </section>

          {/* Horaires + fraîcheur */}
          <section>
            <SectionTitle icon={Clock3}>{t("station.hoursTitle")}</SectionTitle>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
                <span className={cnDot(s.status)} aria-hidden />
                {horaires}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                {t("station.lastCheck", { date: formatDate(lang, s.lastVerified), by: s.verifiedBy })}
              </p>
            </div>
          </section>

          {/* Note + avis (B.2.6 lecture) */}
          <section>
            <SectionTitle>{t("station.reviewsTitle")}</SectionTitle>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-extrabold tabular-nums text-slate-800">{fmtNote(s.rating)}</span>
                <span className="flex-1">
                  <StarRating value={s.rating} size="md" />
                  <span className="mt-1 block text-[11px] text-slate-400">{t("station.reviewsVerified", { n: s.reviewsCount })}</span>
                </span>
              </div>

              <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
                {api.detailLoading && !api.detail && (
                  <>
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-14 w-full rounded-xl" />
                  </>
                )}
                {api.detail && reviews.length === 0 && (
                  <p className="py-2 text-center text-[12px] text-slate-400">{t("station.noReviews")}</p>
                )}
                {reviews.map(r => (
                  <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600">
                          {r.author.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-[12px] font-semibold text-slate-700">{r.author}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{relativeDate(lang, r.createdAt)}</span>
                    </div>
                    <div className="mt-1.5">
                      <StarRating value={r.rating} size="xs" />
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-slate-600">{r.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Stations à proximité */}
          {nearbyChips.length > 0 && (
            <section>
              <SectionTitle>{t("station.nearby")}</SectionTitle>
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                {nearbyChips.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => api.openStation(n)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-sm transition-colors hover:border-emerald-300"
                  >
                    <BrandDot color={n.brandColor} />
                    <span className="max-w-[110px] truncate font-medium text-slate-700">{n.name}</span>
                    <span className="font-semibold text-emerald-600">{fmtKm(n.distanceKm)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <p className="pb-2 text-center text-[10px] text-slate-400">
            {t("station.foot", { code: s.code, lat: s.lat.toFixed(3).replace(".", ","), lng: s.lng.toFixed(3).replace(".", ",") })}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-3 pb-3 pt-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <Button
          className="h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
          onClick={() => toast.success(t("station.routeToast"), { description: t("station.routeToastDesc", { name: s.name, km: fmtKm(s.distanceKm), min: driveMinutes(s.distanceKm) }) })}
        >
          <Navigation className="h-4 w-4" />
          {t("map.route")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl border-slate-300 text-[11.5px] font-semibold text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
            onClick={() => api.go("signalement")}
          >
            <Flag className="h-3.5 w-3.5" />
            {t("station.report")}
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-slate-300 text-[11.5px] font-semibold text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
            onClick={() => api.go("avis")}
          >
            <Star className="h-3.5 w-3.5" />
            {t("station.review")}
          </Button>
        </div>
      </div>
    </div>
  )
}

function cnDot(status: string) {
  return status === "ACTIVE" ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-amber-500"
}
