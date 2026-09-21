'use client'

// CarbuScope Mobile — Écran Promotions & sponsors (B.2.9 + B.4)
// Bannière sponsorisée, offres géolocalisées (dérivées des stations réellement proches),
// contenus partenaires fictifs (assurance / banque / télécom).

import { useMemo } from "react"
import { BadgePercent, CreditCard, MapPin, Megaphone, ShieldCheck, Smartphone, Tag, TicketPercent } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi, StationWithDist } from "../shared"
import { BrandDot, ScreenHeader, SectionTitle, fmtKm } from "../shared"

type GeoOffer = { station: StationWithDist; title: string; sub: string }

const PARTNERS = [
  {
    icon: ShieldCheck,
    name: "AssurPlus",
    offerKey: "partner.assurplus.offer" as const,
    subKey: "partner.assurplus.sub" as const,
    tint: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: CreditCard,
    name: "CarbuBank",
    offerKey: "partner.carpubank.offer" as const,
    subKey: "partner.carpubank.sub" as const,
    tint: "bg-purple-50 text-purple-600",
  },
  {
    icon: Smartphone,
    name: "Simio Telecom",
    offerKey: "partner.simio.offer" as const,
    subKey: "partner.simio.sub" as const,
    tint: "bg-amber-50 text-amber-600",
  },
]

export function PromosScreen({ api }: { api: AppApi }) {
  const { t } = useI18n()
  // Offres géolocalisées : dérivées des stations réellement proches (B.2.9)
  const offers = useMemo<GeoOffer[]>(() => {
    const list: GeoOffer[] = []
    const lavage = api.nearby.find(s => s.services.includes("lavage"))
    if (lavage) list.push({ station: lavage, title: t("promos.geo.wash"), sub: t("promos.geo.washSub") })
    const cafe = api.nearby.find(s => s.services.includes("cafe"))
    if (cafe) list.push({ station: cafe, title: t("promos.geo.coffee"), sub: t("promos.geo.coffeeSub") })
    const atm = api.nearby.find(s => s.services.includes("atm"))
    if (atm) list.push({ station: atm, title: t("promos.geo.atm"), sub: t("promos.geo.atmSub") })
    const open24 = api.nearby.find(s => s.open24)
    if (open24) list.push({ station: open24, title: t("promos.geo.night"), sub: t("promos.geo.nightSub") })
    return list
  }, [api.nearby, t])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader
        title={t("promos.title")}
        subtitle={t("promos.subtitle")}
        right={
          <span className="me-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            <Tag className="h-3 w-3" />
            {t("promos.partnersBadge")}
          </span>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* Bannière sponsorisée (B.2.9 / B.4) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-amber-400 to-emerald-600 p-4 text-white shadow-lg">
          <div aria-hidden className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/15" />
          <div aria-hidden className="absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm">
                {t("promos.sponsored")}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ea580c] ring-2 ring-white/40" />
                TotalEnergies
              </span>
            </div>
            <p className="mt-2.5 text-[17px] font-extrabold leading-tight drop-shadow-sm">
              {t("promos.bannerTitle1")}
              <br />
              {t("promos.bannerTitle2")}
            </p>
            <p className="mt-1 text-[11px] text-white/90">{t("promos.bannerSub", { n: 34 })}</p>
            <Button
              size="sm"
              onClick={() => toast.success(t("promos.bannerToast"), { description: t("promos.bannerToastDesc") })}
              className="mt-3 h-9 rounded-full bg-white px-5 text-[12px] font-bold text-emerald-700 shadow-md hover:bg-white/90"
            >
              {t("promos.bannerCta")}
            </Button>
          </div>
        </div>

        {/* Offres géolocalisées */}
        <section className="mt-4">
          <SectionTitle icon={TicketPercent}>{t("promos.geoTitle")}</SectionTitle>
          <div className="space-y-2">
            {offers.map(o => (
              <div key={o.station.id + o.title} className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <BadgePercent className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <BrandDot color={o.station.brandColor} />
                    {o.station.brandName} · {o.station.delegation}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-bold text-slate-800">{o.title}</p>
                  <p className="truncate text-[10.5px] text-slate-400">{o.sub}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                    <MapPin className="h-3 w-3 text-emerald-500" />
                    {o.station.name} · {fmtKm(o.station.distanceKm)} · {t("promos.validUntil")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toast.info(t("promos.saveToast"))}
                  className="shrink-0 self-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10.5px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  {t("promos.save")}
                </button>
              </div>
            ))}
            {offers.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-[12px] text-slate-400">
                {t("promos.geoEmpty")}
              </p>
            )}
          </div>
        </section>

        {/* Contenus partenaires (B.4) */}
        <section className="mt-4">
          <SectionTitle icon={Megaphone}>{t("promos.partnersTitle")}</SectionTitle>
          <div className="space-y-2">
            {PARTNERS.map(p => {
              const Icon = p.icon
              return (
                <div key={p.name} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", p.tint)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{p.name}</p>
                    <p className="truncate text-[12.5px] font-semibold text-slate-800">{t(p.offerKey)}</p>
                    <p className="truncate text-[10px] text-slate-400">{t(p.subKey)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.info(t("promos.partnerToast", { name: p.name }))}
                    className="shrink-0 self-center rounded-full border border-slate-200 px-3 py-1.5 text-[10.5px] font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                  >
                    {t("promos.discover")}
                  </button>
                </div>
              )
            })}
          </div>
          <p className="mt-2.5 text-center text-[10px] leading-snug text-slate-400">
            {t("promos.partnersFoot")}
          </p>
        </section>
      </div>
    </div>
  )
}
