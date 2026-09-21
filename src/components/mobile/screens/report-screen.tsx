'use client'

// CarbuScope Mobile — Écran Signalement (B.2.5 + B.3.2)
// 6 types de problème, commentaire, photo (mock), position GPS auto,
// POST /api/contributions — validation communautaire par 3 concordances.

import { useState } from "react"
import { Banknote, Cylinder, DoorClosed, Flame, Fuel, Landmark, Loader2, MapPin, Send, Sparkles, Users, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { PhotoMock, ScreenHeader, StationContextBar } from "../shared"

const TYPES: { id: string; labelKey: "report.type.closed" | "report.type.service" | "report.type.price" | "report.type.pump" | "report.type.queue" | "report.type.cleanliness"; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "CLOSED", labelKey: "report.type.closed", icon: DoorClosed },
  { id: "SERVICE_UNAVAILABLE", labelKey: "report.type.service", icon: Wrench },
  { id: "PRICE_ABNORMAL", labelKey: "report.type.price", icon: Banknote },
  { id: "PUMP_BROKEN", labelKey: "report.type.pump", icon: Fuel },
  { id: "QUEUE", labelKey: "report.type.queue", icon: Users },
  { id: "CLEANLINESS", labelKey: "report.type.cleanliness", icon: Sparkles },
]

export function ReportScreen({ api }: { api: AppApi }) {
  const { t } = useI18n()
  const s = api.selected
  const [type, setType] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)

  if (!s) return null

  const submit = async () => {
    if (!type) {
      toast.error(t("report.errorNoType"))
      return
    }
    setSending(true)
    try {
      const r = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationCode: s.code,
          type,
          comment: comment.trim(),
          author: "Vous (démo)",
          lat: s.lat,
          lng: s.lng,
        }),
      })
      if (!r.ok) throw new Error("erreur serveur")
      toast.success(t("report.success"), { description: t("report.successDesc") })
      api.incUserStat("reports")
      api.back()
    } catch {
      toast.error(t("report.error"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader title={t("report.title")} subtitle={s.name} onBack={api.back} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3">
        <StationContextBar station={s} />

        <section className="mt-4">
          <h2 className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{t("report.typeTitle")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(tp => {
              const Icon = tp.icon
              const on = type === tp.id
              return (
                <button
                  key={tp.id}
                  type="button"
                  onClick={() => setType(tp.id)}
                  aria-pressed={on}
                  className={cn(
                    "relative flex items-start gap-2.5 rounded-xl border p-3 text-start transition-all",
                    on ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400" : "border-slate-200 bg-white hover:border-emerald-300"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      on ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold leading-tight text-slate-800">{t(tp.labelKey)}</span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{t(`${tp.labelKey}.hint` as const)}</span>
                  </span>
                  {on && (
                    <span className="absolute end-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden>
                        <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-4">
          <h2 className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{t("report.detailsTitle")}</h2>
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={t("report.detailsPlaceholder")}
            aria-label={t("report.commentAria")}
            className="min-h-[84px] rounded-xl border-slate-200 bg-white text-[13px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
        </section>

        {/* Prix de référence quand le signalement concerne un prix anormal (T22) */}
        {type === "PRICE_ABNORMAL" && api.prices.length > 0 && (
          <section
            className="mt-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-amber-50/40 p-3"
            aria-live="polite"
          >
            <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-800">
              <Banknote className="h-3.5 w-3.5" aria-hidden />
              {t("prices.reportRef")}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {api.prices.map(p => {
                const isEssence = p.fuelType === "ESSENCE"
                const isGazole = p.fuelType === "GAZOLE"
                const Icon = isEssence ? Fuel : isGazole ? Flame : Cylinder
                return (
                  <div key={p.fuelType} className="flex flex-col items-center gap-0.5 rounded-lg border border-emerald-100 bg-white/90 px-1 py-2">
                    <Icon className={isEssence ? "h-3.5 w-3.5 text-emerald-600" : isGazole ? "h-3.5 w-3.5 text-amber-600" : "h-3.5 w-3.5 text-orange-600"} aria-hidden />
                    <span className="text-[12px] font-extrabold tabular-nums leading-none text-slate-800">
                      {(p.priceMillimes / 1000).toFixed(3).replace(".", ",")}
                    </span>
                    <span className="text-[8.5px] font-medium text-slate-400">
                      {t(`prices.${p.fuelType.toLowerCase()}` as never)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-emerald-800/70">{t("prices.reportRefDesc")}</p>
          </section>
        )}

        <section className="mt-3 space-y-2.5">
          <PhotoMock label={t("report.photo")} fileName="signalement_station.jpg" />
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-slate-700">{t("report.gps")}</p>
              <p className="text-[10px] text-slate-500">
                {t("report.gpsDesc", { lat: s.lat.toFixed(4).replace(".", ","), lng: s.lng.toFixed(4).replace(".", ",") })}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[11px] leading-snug text-amber-800">
            {t("report.ruleA")} <strong>{t("report.ruleB")}</strong> {t("report.ruleC")}
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-3 pt-2.5">
        <Button
          onClick={submit}
          disabled={sending}
          className="h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t("report.sending") : t("report.submit")}
        </Button>
      </div>
    </div>
  )
}
