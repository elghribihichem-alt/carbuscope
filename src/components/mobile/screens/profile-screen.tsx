'use client'

// CarbuScope Mobile — Écran Profil (B.2.7 + B.3.2 + B.3.4)
// Réputation (points, niveau « Contributeur fiable »), badges, historique,
// préférences (enseignes & services favoris), sélection de langue (5 langues).
// + Carte « Espace agent — veille terrain » (T28) en tête d'écran.

import { Award, BadgeCheck, Camera, ChevronRight, Crown, Footprints, Globe, Heart, Languages, MapPin, Medal, Settings2, Sparkles, Star, ThumbsUp, X } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { LANGS, useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { BrandDot, ScreenHeader, SectionTitle, fmtKm, fmtNote } from "../shared"
import type { AgentSummary } from "../agent-shared"
import { useFavoritesStore } from "../favorites-store"

const FAV_SERVICES = ["lavage", "cafe", "recharge", "atm", "vidange"]

const REPUTATION = { points: 348, next: 500 }

const BADGE_DEFS: { key: "profile.badge1" | "profile.badge2" | "profile.badge3" | "profile.badge4"; icon: React.ComponentType<{ className?: string }>; tint: string }[] = [
  { key: "profile.badge1", icon: Medal, tint: "border-amber-200 bg-amber-50 text-amber-700" },
  { key: "profile.badge2", icon: Camera, tint: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { key: "profile.badge3", icon: Award, tint: "border-purple-200 bg-purple-50 text-purple-700" },
  { key: "profile.badge4", icon: ThumbsUp, tint: "border-slate-200 bg-slate-50 text-slate-600" },
]

export function ProfileScreen({
  api, agent, onOpenAgent,
}: {
  api: AppApi
  agent: AgentSummary | null
  onOpenAgent: () => void
}) {
  const { t, lang, isAuto, setLang, setAuto, svc } = useI18n()
  const favBrands = useFavoritesStore(st => st.favBrands)
  const favServices = useFavoritesStore(st => st.favServices)
  const stationIds = useFavoritesStore(st => st.stationIds)
  const toggleFavBrand = useFavoritesStore(st => st.toggleFavBrand)
  const toggleFavService = useFavoritesStore(st => st.toggleFavService)
  const removeFavorite = useFavoritesStore(st => st.removeFavorite)

  // Stations favorites résolues depuis les données chargées (persistées par id)
  const favoriteStations = api.allStations.filter(s => stationIds.includes(s.id))
  // Enseigne de l'agent connecté (carte « Espace agent »)
  const agentBrand = api.brands.find(b => b.slug === agent?.brandSlug)

  const visited = api.nearby.slice(1, 4)
  const visitMeta = [
    { what: t("profile.visit1What"), when: t("profile.visit1When"), amount: "48,20 DT" },
    { what: t("profile.visit2What"), when: t("profile.visit2When"), amount: "60,00 DT" },
    { what: t("profile.visit3What"), when: t("profile.visit3When"), amount: "12,40 DT" },
  ]

  const pct = Math.min(100, Math.round((REPUTATION.points / REPUTATION.next) * 100))

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* Espace agent — veille terrain (T28) : connexion par code agent */}
        <button
          type="button"
          onClick={onOpenAgent}
          aria-label="Ouvrir l'espace agent — veille terrain"
          className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 p-4 text-start text-white shadow-lg shadow-emerald-900/15 ring-1 ring-emerald-600/40 transition-transform active:scale-[0.985]"
        >
          <span aria-hidden className="absolute -end-8 -top-12 h-32 w-32 rounded-full bg-white/10" />
          <span aria-hidden className="absolute -start-10 -bottom-14 h-36 w-36 rounded-full bg-white/5" />
          <span className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Footprints className="h-5 w-5 text-emerald-50" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold leading-tight">Espace agent</span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-emerald-100/85">
                Missions de contrôle et veille concurrentielle de votre enseigne
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/70 rtl:rotate-180" />
          </span>
          <span className="relative mt-3 flex items-center gap-2">
            {agent ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-50">
                <BrandDot color={agentBrand?.color ?? "#34d399"} />
                <span className="truncate">Agent {agentBrand?.name ?? agent.brandSlug} · {agent.name}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-50">
                <Footprints className="h-3 w-3" />
                Ex : Agent TotalEnergies
              </span>
            )}
            <span className="ms-auto shrink-0 rounded-full bg-white px-3 py-1 text-[10.5px] font-extrabold text-emerald-800">
              {agent ? "Ouvrir" : "Se connecter"}
            </span>
          </span>
        </button>

        {/* Identité + réputation (B.2.7 / B.3.2) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 border-2 border-emerald-200 shadow-sm">
              <AvatarFallback className="bg-emerald-600 text-lg font-extrabold text-white">CT</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold text-slate-800">{t("profile.subtitle")}</p>
              <p className="text-[11px] text-slate-400">{t("profile.member")}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <BadgeCheck className="h-3 w-3" />
                {t("profile.levelWeight", { level: t("profile.levelName") })}
              </span>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
              <Crown className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-3.5">
            <div className="flex items-end justify-between">
              <p className="text-[22px] font-extrabold leading-none tabular-nums text-slate-800">
                {REPUTATION.points} <span className="text-xs font-semibold text-slate-400">{t("profile.ptsUnit")}</span>
              </p>
              <p className="text-[10px] text-slate-400">
                {t("profile.next", { n: REPUTATION.next - REPUTATION.points, level: t("profile.nextLevelName") })}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
              {t("profile.ruleNote")}
            </p>
          </div>
        </div>

        {/* Badges gagnés */}
        <section className="mt-4">
          <SectionTitle icon={Medal}>{t("profile.badgesTitle")}</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {BADGE_DEFS.map(b => {
              const Icon = b.icon
              return (
                <span key={b.key} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold", b.tint)}>
                  <Icon className="h-3.5 w-3.5" />
                  {t(b.key)}
                </span>
              )
            })}
          </div>
        </section>

        {/* Historique (B.2.7) */}
        <section className="mt-4">
          <SectionTitle icon={MapPin}>{t("profile.visitedTitle")}</SectionTitle>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {visited.map((v, i) => (
              <div key={v.id} className="flex items-center gap-2.5 p-2.5">
                <BrandDot color={v.brandColor} className="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-slate-800">{v.name}</span>
                  <span className="block text-[10.5px] text-slate-400">
                    {visitMeta[i]?.what ?? t("profile.visitPassage")} · {visitMeta[i]?.when ?? t("profile.visitRecently")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[11.5px] font-bold tabular-nums text-slate-700">{visitMeta[i]?.amount ?? "—"}</span>
                  <span className="flex items-center justify-end gap-0.5 text-[10px] text-amber-500">
                    <Star className="h-2.5 w-2.5 fill-amber-400" />
                    {fmtNote(v.rating)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
              <p className="text-[18px] font-extrabold tabular-nums text-slate-800">{api.userStats.reviews}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{t("profile.statsReviews")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
              <p className="text-[18px] font-extrabold tabular-nums text-slate-800">{api.userStats.reports}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{t("profile.statsReports")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
              <p className="text-[18px] font-extrabold tabular-nums text-emerald-600">{api.userStats.validated}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{t("profile.statsValidated")}</p>
            </div>
          </div>
        </section>

        {/* Stations favorites (B.2.7) — persistées */}
        <section className="mt-4">
          <SectionTitle icon={Heart}>
            {t("profile.myFavorites")}
            {favoriteStations.length > 0 && (
              <span className="ms-1.5 rounded-full bg-amber-100 px-1.5 py-px text-[9.5px] font-bold text-amber-700">
                {favoriteStations.length}
              </span>
            )}
          </SectionTitle>
          {favoriteStations.length > 0 ? (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-amber-200/70 bg-white shadow-sm">
              {favoriteStations.map(st => (
                <div key={st.id} className="flex items-center gap-2.5 p-2.5 transition-colors hover:bg-amber-50/40">
                  <button
                    type="button"
                    onClick={() => api.openStation(st)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                    aria-label={t("profile.openFavAria", { name: st.name })}
                  >
                    <span className="relative">
                      <BrandDot color={st.brandColor} className="h-8 w-8" />
                      <Heart className="absolute -bottom-0.5 -end-0.5 h-3 w-3 fill-amber-400 text-amber-500 drop-shadow-sm" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-slate-800">{st.name}</span>
                      <span className="block text-[10.5px] text-slate-400">
                        {st.gouvernorat} · {fmtKm(st.distanceKm)} · {fmtNote(st.rating)}/5
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeFavorite(st.id)
                      toast.info(t("profile.removedToast"), { description: st.name })
                    }}
                    aria-label={t("profile.removeFavAria", { name: st.name })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-3.5 text-center">
              <Heart className="mx-auto h-5 w-5 text-slate-300" aria-hidden />
              <p className="mt-1.5 text-[12px] font-semibold text-slate-600">{t("profile.favEmptyTitle")}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">
                {t("profile.favEmptyDesc")}
              </p>
            </div>
          )}
        </section>

        {/* Préférences (B.2.7) — persistées */}
        <section className="mt-4">
          <SectionTitle icon={Settings2}>{t("profile.prefs")}</SectionTitle>
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t("profile.favBrands")}</p>
              <div className="flex flex-wrap gap-1.5">
                {api.brands.map(b => {
                  const on = favBrands.includes(b.slug)
                  return (
                    <button
                      key={b.slug}
                      type="button"
                      onClick={() => toggleFavBrand(b.slug)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
                      )}
                    >
                      <BrandDot color={b.color} />
                      {b.name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t("profile.favServices")}</p>
              <div className="flex flex-wrap gap-1.5">
                {FAV_SERVICES.map(slug => {
                  const Icon = SERVICE_ICONS[slug]
                  const on = favServices.includes(slug)
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => toggleFavService(slug)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
                      )}
                    >
                      {Icon ? <Icon className={cn("h-3.5 w-3.5", on ? "text-emerald-600" : "text-slate-400")} /> : null}
                      {svc(slug)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[9.5px] leading-snug text-slate-400">
                {t("profile.prefsNote")}
              </p>
            </div>
          </div>
        </section>

        {/* Langue (B.3.4) — reliée au store global : change réellement l'interface */}
        <section className="mt-4">
          <SectionTitle icon={Languages}>{t("profile.language")}</SectionTitle>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map(l => {
                const on = !isAuto && lang === l.code
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      setLang(l.code)
                      toast.success(t("lang.toast", { lang: l.native }), {
                        description: l.dir === "rtl" ? t("lang.toastRtlDesc") : t("lang.toastDesc"),
                      })
                    }}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors",
                      on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
                    )}
                  >
                    <Globe className="h-3 w-3" />
                    {l.native}
                    {l.dir === "rtl" && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-px text-[9px] font-bold text-purple-700">{t("lang.rtlBadge")}</span>
                    )}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  setAuto()
                  toast.info(t("lang.autoNote", { lang: LANGS.find(x => x.code === lang)?.native ?? lang }))
                }}
                aria-pressed={isAuto}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors",
                  isAuto ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"
                )}
              >
                <Sparkles className="h-3 w-3" />
                {t("lang.auto")}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              {t("profile.langNote")}
            </p>
          </div>
        </section>

        <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">
          {t("profile.version")}
          <br />
          {t("profile.versionNote")}
        </p>
      </div>
    </div>
  )
}
