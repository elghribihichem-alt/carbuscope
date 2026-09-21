'use client'

// CarbuScope Mobile — Écran Comparateur : 2 à 3 stations épinglées comparées
// côte à côte sur des critères consommateurs (distance, note, avis, horaires,
// services, fraîcheur). Grille défilable horizontalement avec colonne de
// libellés sticky, badges « Top » par critère et meilleur profil global.

import { GitCompareArrows, Star, Trophy, X } from "lucide-react"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { BrandDot, ScreenHeader, driveMinutes, fmtKm, fmtNote } from "../shared"
import { MAX_MOBILE_COMPARE, useCompareStore } from "../compare-store"
import { SERVICE_LABELS } from "@/lib/types"
import { relativeDate } from "@/lib/i18n"

const SERVICE_SLUGS = Object.keys(SERVICE_LABELS)
const CRITERIA_COUNT = 6 // distance, note, avis, horaires, services, fraîcheur

export function CompareScreen({ api }: { api: AppApi }) {
  const { t, lang } = useI18n()
  const ids = useCompareStore(s => s.stationIds)
  const removeCompare = useCompareStore(s => s.removeCompare)
  const clear = useCompareStore(s => s.clear)

  const byId = new Map(api.allStations.map(s => [s.id, s]))
  const stations = ids.map(id => byId.get(id)).filter(Boolean) as typeof api.allStations
  const n = stations.length

  // ---- Meilleurs scores par critère (du point de vue consommateur) ----
  const minDist = Math.min(...stations.map(s => s.distanceKm))
  const bestRating = Math.max(...stations.map(s => s.rating))
  const bestReviews = Math.max(...stations.map(s => s.reviewsCount))
  const bestHours = Math.max(...stations.map(s => (s.open24 ? 2 : s.open7j ? 1 : 0)))
  const bestServices = Math.max(...stations.map(s => s.services.length))
  const bestVerified = Math.max(...stations.map(s => new Date(s.lastVerified).getTime()))

  const wins = stations.map(s => {
    let w = 0
    if (s.distanceKm === minDist) w += 1
    if (s.rating === bestRating) w += 1
    if (s.reviewsCount === bestReviews) w += 1
    if ((s.open24 ? 2 : s.open7j ? 1 : 0) === bestHours) w += 1
    if (s.services.length === bestServices) w += 1
    if (new Date(s.lastVerified).getTime() === bestVerified) w += 1
    return w
  })
  const maxWins = Math.max(...wins, 0)
  const championIdx = maxWins > 0 ? wins.indexOf(maxWins) : -1
  const champion = championIdx >= 0 ? stations[championIdx] : null

  const matrixServices = SERVICE_SLUGS.filter(slug => stations.some(s => s.services.includes(slug)))

  // ---- État vide ----
  if (n === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
        <ScreenHeader title={t("compare.title")} onBack={api.back} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600">
            <GitCompareArrows className="h-8 w-8" aria-hidden />
          </span>
          <p className="text-[15px] font-bold text-slate-800">{t("compare.emptyTitle")}</p>
          <p className="text-[12px] leading-relaxed text-slate-500">{t("compare.emptyDesc")}</p>
          <button
            type="button"
            onClick={() => api.go("map")}
            className="mt-2 rounded-full bg-emerald-600 px-5 py-2.5 text-[12.5px] font-bold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95"
          >
            {t("compare.emptyCta")}
          </button>
        </div>
      </div>
    )
  }

  const gridCols = {
    gridTemplateColumns: `88px repeat(${n}, minmax(148px, 1fr))`,
    minWidth: `${88 + n * 156}px`,
  }
  const labelCls = "sticky left-0 z-10 bg-[#f6f7f5] px-2 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"
  const cellCls = "border-b border-slate-100 px-2 py-2.5 align-middle"

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader
        title={t("compare.title")}
        subtitle={t("compare.subtitle", { n, max: MAX_MOBILE_COMPARE })}
        onBack={api.back}
        right={
          n > 0 && (
            <button
              type="button"
              onClick={() => { clear(); toast.info(t("compare.clearedToast")) }}
              className="me-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-600"
            >
              {t("compare.clearCta")}
            </button>
          )
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {n === 1 && (
          <p className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11.5px] font-medium leading-snug text-amber-800">
            {t("compare.needMore")}
          </p>
        )}

        {/* ---- En-têtes stations ---- */}
        <div className="overflow-x-auto">
          <div className="grid" style={gridCols} role="table" aria-label={t("compare.barAria")}>
            <div className={cn(labelCls, "flex items-center")}>{t("compare.criteria")}</div>
            {stations.map((s, i) => (
              <div key={s.id} className={cn(cellCls, "bg-white")}>
                <div className="flex items-start gap-1.5">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: s.brandColor }}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold leading-tight text-slate-800">{s.name}</p>
                    <p className="truncate text-[10px] leading-tight text-slate-400">{s.brandName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCompare(s.id)}
                    aria-label={t("compare.removeAria", { name: s.name })}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            ))}

            {/* Distance */}
            <div className={labelCls}>{t("compare.distance")}</div>
            {stations.map(s => (
              <div key={s.id} className={cellCls}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-emerald-700">{fmtKm(s.distanceKm)}</span>
                  {s.distanceKm === minDist && n > 1 && <TopMark label={t("compare.bestAria")} />}
                </div>
                <p className="text-[10.5px] text-slate-400">{driveMinutes(s.distanceKm)} {t("common.min")}</p>
              </div>
            ))}

            {/* Note */}
            <div className={labelCls}>{t("compare.rating")}</div>
            {stations.map(s => (
              <div key={s.id} className={cellCls}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-0.5 text-[12.5px] font-bold text-slate-800">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    {fmtNote(s.rating)}
                  </span>
                  {s.rating === bestRating && n > 1 && <TopMark label={t("compare.bestAria")} />}
                </div>
                <p className="text-[10.5px] text-slate-400">{t("compare.reviews", { n: s.reviewsCount })}</p>
              </div>
            ))}

            {/* Volume d'avis */}
            <div className={labelCls}>{t("compare.volume")}</div>
            {stations.map(s => (
              <div key={s.id} className={cellCls}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                    s.reviewsCount === bestReviews && n > 1 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {s.reviewsCount}
                  </span>
                  {s.reviewsCount === bestReviews && n > 1 && <TopMark label={t("compare.bestAria")} />}
                </div>
              </div>
            ))}

            {/* Horaires */}
            <div className={labelCls}>{t("compare.hours")}</div>
            {stations.map(s => (
              <div key={s.id} className={cn(cellCls, "space-x-1")}>
                {s.open24 ? (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">{t("common.open24h")}</span>
                ) : null}
                {s.open7j ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-700">{t("common.open7j")}</span>
                ) : null}
                {!s.open24 && !s.open7j && <span className="text-[11px] text-slate-400">{t("compare.classicHours")}</span>}
              </div>
            ))}

            {/* Services */}
            <div className={labelCls}>{t("compare.services")}</div>
            {stations.map(s => (
              <div key={s.id} className={cellCls}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                    s.services.length === bestServices && n > 1 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {s.services.length}
                  </span>
                  {s.services.length === bestServices && n > 1 && <TopMark label={t("compare.bestAria")} />}
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
                  {s.services.map(x => SERVICE_LABELS[x] ?? x).join(" · ") || "—"}
                </p>
              </div>
            ))}

            {/* Fraîcheur */}
            <div className={labelCls}>{t("compare.freshness")}</div>
            {stations.map(s => (
              <div key={s.id} className={cellCls}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] font-medium text-slate-700">{relativeDate(lang, s.lastVerified)}</span>
                  {new Date(s.lastVerified).getTime() === bestVerified && n > 1 && <TopMark label={t("compare.bestAria")} />}
                </div>
              </div>
            ))}

            {/* Score global + fiche */}
            <div className={labelCls}>{t("compare.score")}</div>
            {stations.map((s, i) => (
              <div key={s.id} className={cellCls}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold",
                    i === championIdx ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                  )}>
                    <Trophy className="h-3 w-3" aria-hidden />
                    {t("compare.wins", { wins: wins[i] ?? 0, total: CRITERIA_COUNT })}
                  </span>
                  {i === championIdx && (
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-amber-600">{t("compare.bestProfile")}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => api.openStation(s)}
                  className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-700"
                >
                  {t("compare.viewFiche")}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Matrice des services différenciants */}
        {matrixServices.length > 0 && (
          <section className="px-3 pb-2 pt-4" aria-label={t("compare.diffServices")}>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <BrandDot color="#f59e0b" />
              {t("compare.diffServices")}
            </p>
            <div className="overflow-x-auto">
              <div className="grid" style={gridCols}>
                {matrixServices.map(slug => {
                  const common = stations.every(s => s.services.includes(slug))
                  return (
                    <div key={slug} className="contents">
                      <div className={cn(labelCls, "flex items-center gap-1.5 font-medium normal-case tracking-normal")}>
                        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", common ? "bg-slate-300" : "bg-amber-500")} />
                        <span className="truncate text-[10.5px]">{SERVICE_LABELS[slug]}</span>
                      </div>
                      {stations.map(s => (
                        <div key={`${s.id}-${slug}`} className={cn(cellCls, "bg-white text-center")}>
                          {s.services.includes(slug) ? (
                            <span className="mx-auto block h-2 w-2 rounded-full bg-emerald-500" aria-label={t("compare.available")} />
                          ) : (
                            <span className="mx-auto block h-2 w-2 rounded-full bg-slate-200" aria-label={t("compare.unavailable")} />
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              {t("compare.diffLegend")}
            </p>
          </section>
        )}

        {/* Synthèse */}
        {champion && n > 1 && (
          <div className="mx-3 mb-4 mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-amber-800">
              <Trophy className="h-4 w-4 shrink-0" aria-hidden />
              {t("compare.bestProfile")} : {champion.name}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-800/80">
              {t("compare.synthesis", { name: champion.name, wins: wins[championIdx] ?? 0, total: CRITERIA_COUNT })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function TopMark({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700"
      title={label}
    >
      <Trophy className="h-2.5 w-2.5" aria-hidden />
      Top
    </span>
  )
}
