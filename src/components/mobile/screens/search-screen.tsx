'use client'

// CarbuScope Mobile — Écran Recherche (B.2.2)
// Filtres enseigne / service / horaires / note minimum, tri distance ou note,
// résultats complets (les 1 500 fiches actives sont déjà chargées, filtrage local).

import { useMemo, useState } from "react"
import { ChevronDown, Heart, MapPin, RotateCcw, Search, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { StarRating, StationRow, toggleIn } from "../shared"
import { useFavoritesStore } from "../favorites-store"
import { CompareBar } from "../compare-bar"

const SERVICES = ["boutique", "gonflage", "toilettes", "atm", "cafe", "lavage", "vidange", "atelier", "recharge"]
const HOURS_IDS = ["24h", "7j"] as const

export function SearchScreen({ api }: { api: AppApi }) {
  const { t, svc } = useI18n()
  const [brandSel, setBrandSel] = useState<Set<string>>(new Set())
  const [serviceSel, setServiceSel] = useState<Set<string>>(new Set())
  const [hours, setHours] = useState<string | null>(null)
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState<"distance" | "rating">("distance")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [favOnly, setFavOnly] = useState(false)
  const favIds = useFavoritesStore(st => st.stationIds)

  const activeFilters = brandSel.size + serviceSel.size + (hours ? 1 : 0) + (minRating > 0 ? 1 : 0) + (favOnly ? 1 : 0)

  const results = useMemo(() => {
    const q = api.searchQuery.trim().toLowerCase()
    const list = api.allStations.filter(s => {
      if (q) {
        const haystack = [s.name, s.address, s.brandName, s.delegation, s.gouvernorat, s.code].join(" ").toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (favOnly && !favIds.includes(s.id)) return false
      if (brandSel.size && !brandSel.has(s.brandSlug ?? "")) return false
      if (serviceSel.size && !Array.from(serviceSel).every(sv => s.services.includes(sv))) return false
      if (hours === "24h" && !s.open24) return false
      if (hours === "7j" && !s.open7j) return false
      if (minRating > 0 && s.rating < minRating) return false
      return true
    })
    return list.sort((a, b) => (sort === "rating" ? b.rating - a.rating : a.distanceKm - b.distanceKm))
  }, [api.allStations, api.searchQuery, brandSel, serviceSel, hours, minRating, sort, favOnly, favIds])

  const reset = () => {
    setBrandSel(new Set())
    setServiceSel(new Set())
    setHours(null)
    setMinRating(0)
    setFavOnly(false)
    api.setSearchQuery("")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre de recherche + tri */}
      <div className="z-20 shrink-0 border-b border-slate-200/70 bg-white px-3 pb-2 pt-1.5">
        <div className="relative" role="search">
          <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={api.searchQuery}
            onChange={e => api.setSearchQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.aria")}
            enterKeyHint="search"
            className="h-10 rounded-full border-slate-200 bg-slate-50 ps-10 pe-4 text-[13px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFavOnly(v => !v)}
            aria-pressed={favOnly}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition-all active:scale-95",
              favOnly
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-amber-200"
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", favOnly && "fill-amber-400 text-amber-500")} />
            {t("search.favorites")}
            {favIds.length > 0 && (
              <span className={cn(
                "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                favOnly ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"
              )}>
                {favIds.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold shadow-sm transition-colors",
              activeFilters > (favOnly ? 1 : 0) ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t("search.filters")}
            {activeFilters > (favOnly ? 1 : 0) && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white">
                {activeFilters - (favOnly ? 1 : 0)}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", filtersOpen && "rotate-180")} />
          </button>
          <span className="ms-auto flex items-center gap-1.5 text-[10px] text-slate-400">
            {t("search.sort")}
            <Select value={sort} onValueChange={v => setSort(v === "rating" ? "rating" : "distance")}>
              <SelectTrigger size="sm" aria-label={t("search.sortAria")} className="h-8 w-[110px] rounded-full bg-white text-[11px] font-semibold text-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="distance">{t("search.sortDistance")}</SelectItem>
                <SelectItem value="rating">{t("search.sortRating")}</SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>
      </div>

      {/* Panneau de filtres (B.2.2) */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="shrink-0 border-b border-slate-200/70 bg-white">
        <CollapsibleContent>
          <div className="space-y-3 px-3 py-3">
            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t("search.brand")}</p>
              <div className="flex flex-wrap gap-1.5">
                {api.brands.map(b => {
                  const on = brandSel.has(b.slug)
                  return (
                    <button
                      key={b.slug}
                      type="button"
                      onClick={() => setBrandSel(toggleIn(brandSel, b.slug))}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                      )}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t("search.service")}</p>
              <div className="flex flex-wrap gap-1.5">
                {SERVICES.map(slug => {
                  const Icon = SERVICE_ICONS[slug]
                  const on = serviceSel.has(slug)
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setServiceSel(toggleIn(serviceSel, slug))}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                      )}
                    >
                      {Icon ? <Icon className={cn("h-3.5 w-3.5", on ? "text-emerald-600" : "text-slate-400")} /> : null}
                      {svc(slug)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t("search.hours")}</p>
              <div className="flex gap-1.5">
                {HOURS_IDS.map(id => {
                  const on = hours === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setHours(on ? null : id)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold transition-colors",
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                      )}
                    >
                      {id === "24h" ? t("common.open24h") : t("common.open7j")}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t("search.minRating")}</p>
              <span className="flex items-center gap-2">
                <StarRating value={minRating} onChange={v => setMinRating(v === minRating ? 0 : v)} size="sm" />
                <span className={cn("w-8 text-right text-[11px] font-semibold", minRating ? "text-emerald-700" : "text-slate-300")}>
                  {minRating ? `${minRating} ★+` : "—"}
                </span>
              </span>
            </div>

            {activeFilters > 0 && (
              <button
                type="button"
                onClick={reset}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("search.reset")}
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Résultats */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-3 py-2">
          <p className="text-[12.5px] font-bold text-slate-700">
            {results.length === 1 ? t("search.resultsOne", { n: results.length }) : t("search.resultsMany", { n: results.length })}
          </p>
          <p className="text-[10px] text-slate-400">{t("search.activeFiles", { n: api.allStations.length })}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">
          <div className="mx-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {results.slice(0, 60).map(s => (
                <StationRow key={s.id} station={s} onClick={() => api.openStation(s)} />
              ))}
              {results.length === 0 && (
                <div className="p-8 text-center">
                  <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-[13px] font-semibold text-slate-600">{t("search.emptyTitle")}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{t("search.emptyDesc")}</p>
                </div>
              )}
            </div>
          </div>
          {results.length > 60 && (
            <p className="mt-2 text-center text-[10px] text-slate-400">{t("search.more", { shown: 60, total: results.length })}</p>
          )}
        </div>
      </div>

      {/* Barre du comparateur (stations épinglées) */}
      <CompareBar api={api} />
    </div>
  )
}
