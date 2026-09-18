'use client'

// CarbuScope Mobile — Écran Profil (B.2.7 + B.3.2 + B.3.4)
// Réputation (points, niveau « Contributeur fiable »), badges, historique,
// préférences (enseignes & services favoris), sélection de langue (5 langues).

import { useState } from "react"
import { Award, BadgeCheck, Camera, Crown, Globe, Languages, MapPin, Medal, Settings2, Star, ThumbsUp } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { SERVICE_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { BrandDot, ScreenHeader, SectionTitle, fmtNote, toggleIn } from "../shared"

const REPUTATION = { points: 348, next: 500, level: "Contributeur fiable", nextLevel: "Contributeur expert" }

const BADGES = [
  { label: "Première contribution", icon: Medal, tint: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "Photographe", icon: Camera, tint: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "Vétéran — 3 signalements", icon: Award, tint: "border-purple-200 bg-purple-50 text-purple-700" },
  { label: "5 avis utiles", icon: ThumbsUp, tint: "border-slate-200 bg-slate-50 text-slate-600" },
]

const LANGS = [
  { id: "ar", label: "العربية", rtl: true },
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
  { id: "it", label: "Italiano" },
  { id: "es", label: "Español" },
]

const FAV_SERVICES = ["lavage", "cafe", "recharge", "atm", "vidange"]

export function ProfileScreen({ api }: { api: AppApi }) {
  const [favBrands, setFavBrands] = useState<Set<string>>(new Set(["agil"]))
  const [favServices, setFavServices] = useState<Set<string>>(new Set(["lavage", "cafe"]))
  const [lang, setLang] = useState("fr")

  const visited = api.nearby.slice(1, 4)
  const visitMeta = [
    { when: "il y a 2 jours", what: "Plein + lavage", amount: "48,20 DT" },
    { when: "il y a 5 jours", what: "Carburant sans plomb", amount: "60,00 DT" },
    { when: "il y a 1 sem.", what: "Gonflage + boutique", amount: "12,40 DT" },
  ]

  const pct = Math.min(100, Math.round((REPUTATION.points / REPUTATION.next) * 100))

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader title="Profil" subtitle="Conducteur tunisien" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* Identité + réputation (B.2.7 / B.3.2) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 border-2 border-emerald-200 shadow-sm">
              <AvatarFallback className="bg-emerald-600 text-lg font-extrabold text-white">CT</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold text-slate-800">Conducteur tunisien</p>
              <p className="text-[11px] text-slate-400">Membre depuis mars 2025 · Tunis</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <BadgeCheck className="h-3 w-3" />
                {REPUTATION.level} · poids fort
              </span>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
              <Crown className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-3.5">
            <div className="flex items-end justify-between">
              <p className="text-[22px] font-extrabold leading-none tabular-nums text-slate-800">
                {REPUTATION.points} <span className="text-xs font-semibold text-slate-400">pts de réputation</span>
              </p>
              <p className="text-[10px] text-slate-400">
                {REPUTATION.next - REPUTATION.points} pts → {REPUTATION.nextLevel}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
              Règle B.3.2 : un historique fiable donne un poids plus fort à vos signalements.
            </p>
          </div>
        </div>

        {/* Badges gagnés */}
        <section className="mt-4">
          <SectionTitle icon={Medal}>Badges gagnés</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map(b => {
              const Icon = b.icon
              return (
                <span key={b.label} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold", b.tint)}>
                  <Icon className="h-3.5 w-3.5" />
                  {b.label}
                </span>
              )
            })}
          </div>
        </section>

        {/* Historique (B.2.7) */}
        <section className="mt-4">
          <SectionTitle icon={MapPin}>Stations visitées récemment</SectionTitle>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {visited.map((v, i) => (
              <div key={v.id} className="flex items-center gap-2.5 p-2.5">
                <BrandDot color={v.brandColor} className="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-slate-800">{v.name}</span>
                  <span className="block text-[10.5px] text-slate-400">
                    {visitMeta[i]?.what ?? "Passage"} · {visitMeta[i]?.when ?? "récemment"}
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
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Avis laissés</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
              <p className="text-[18px] font-extrabold tabular-nums text-slate-800">{api.userStats.reports}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Signalements</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-sm">
              <p className="text-[18px] font-extrabold tabular-nums text-emerald-600">{api.userStats.validated}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Validés</p>
            </div>
          </div>
        </section>

        {/* Préférences (B.2.7) */}
        <section className="mt-4">
          <SectionTitle icon={Settings2}>Préférences</SectionTitle>
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Enseignes favorites</p>
              <div className="flex flex-wrap gap-1.5">
                {api.brands.map(b => {
                  const on = favBrands.has(b.slug)
                  return (
                    <button
                      key={b.slug}
                      type="button"
                      onClick={() => setFavBrands(toggleIn(favBrands, b.slug))}
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
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Services préférés</p>
              <div className="flex flex-wrap gap-1.5">
                {FAV_SERVICES.map(slug => {
                  const Icon = SERVICE_ICONS[slug]
                  const on = favServices.has(slug)
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setFavServices(toggleIn(favServices, slug))}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                        on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
                      )}
                    >
                      {Icon ? <Icon className={cn("h-3.5 w-3.5", on ? "text-emerald-600" : "text-slate-400")} /> : null}
                      {SERVICE_LABELS[slug]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Langue (B.3.4) */}
        <section className="mt-4">
          <SectionTitle icon={Languages}>Langue de l'application</SectionTitle>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map(l => {
                const on = lang === l.id
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setLang(l.id)
                      toast.success(`Langue de l'interface : ${l.label}`, {
                        description: l.rtl
                          ? "Passage en mode RTL (droite → gauche) — démo. La langue est détectée automatiquement au premier lancement."
                          : "B.3.4 — détection automatique de la langue du téléphone (démo).",
                      })
                    }}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors",
                      on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"
                    )}
                  >
                    <Globe className="h-3 w-3" />
                    {l.label}
                    {l.rtl && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-px text-[9px] font-bold text-purple-700">RTL</span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              5 langues : arabe (RTL), français, anglais, italien, espagnol — détection automatique du téléphone.
            </p>
          </div>
        </section>

        <p className="mt-5 text-center text-[10px] leading-relaxed text-slate-400">
          CarbuScope Mobile v1.2.0 (aperçu de démonstration)
          <br />
          Données stations, avis et contributions : réelles · profil fictif
        </p>
      </div>
    </div>
  )
}
