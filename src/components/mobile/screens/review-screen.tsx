'use client'

// CarbuScope Mobile — Écran Avis (B.2.6)
// Note globale 1-5, critères individuels (propreté, accueil, rapidité, services),
// commentaire + photo (mock), POST /api/reviews → recalcul de la note moyenne.

import { useState } from "react"
import { Loader2, Send, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "../shared"
import { PhotoMock, ScreenHeader, StarRating, StationContextBar } from "../shared"

const CRITERES = [
  { key: "proprete", labelKey: "review.crit.cleanliness" as const },
  { key: "accueil", labelKey: "review.crit.welcome" as const },
  { key: "rapidite", labelKey: "review.crit.speed" as const },
  { key: "services", labelKey: "review.crit.services" as const },
]

const RATING_KEYS = ["review.rating1", "review.rating2", "review.rating3", "review.rating4", "review.rating5"] as const

export function ReviewScreen({ api }: { api: AppApi }) {
  const { t } = useI18n()
  const s = api.selected
  const [rating, setRating] = useState(0)
  const [criteria, setCriteria] = useState<Record<string, number>>({})
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)

  if (!s) return null

  const submit = async () => {
    if (!rating) {
      toast.error(t("review.errorNoRating"))
      return
    }
    setSending(true)
    const crit: Record<string, number> = {}
    for (const c of CRITERES) {
      const v = criteria[c.key] ?? 0
      if (v > 0) crit[c.key] = v
    }
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: s.id,
          author: "Vous (démo)",
          rating,
          comment: comment.trim(),
          criteria: Object.keys(crit).length ? crit : null,
        }),
      })
      if (!r.ok) throw new Error("erreur serveur")
      toast.success(t("review.success"), { description: t("review.successDesc") })
      api.incUserStat("reviews")
      api.refreshDetail()
      api.back()
    } catch {
      toast.error(t("review.error"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader title={t("review.title")} subtitle={s.name} onBack={api.back} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3">
        <StationContextBar station={s} />

        {/* Note globale */}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <h2 className="text-[12.5px] font-bold text-slate-700">{t("review.globalTitle")}</h2>
          <div className="mt-2 flex justify-center">
            <StarRating value={rating} onChange={setRating} size="lg" />
          </div>
          <p
            className={cn(
              "mt-2 text-[13px] font-bold",
              rating === 0 ? "text-slate-300" : rating <= 2 ? "text-red-600" : rating === 3 ? "text-amber-600" : "text-emerald-600"
            )}
          >
            {rating === 0 ? t("review.tapStars") : t(RATING_KEYS[rating - 1])}
          </p>
        </section>

        {/* Critères (B.2.6) */}
        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{t("review.criteriaTitle")}</h2>
          <div className="mt-1 divide-y divide-slate-100">
            {CRITERES.map(c => {
              const v = criteria[c.key] ?? 0
              return (
                <div key={c.key} className="flex items-center justify-between py-2">
                  <span className="text-[12.5px] font-medium text-slate-700">{t(c.labelKey)}</span>
                  <StarRating value={v} onChange={nv => setCriteria(prev => ({ ...prev, [c.key]: nv }))} size="sm" />
                </div>
              )
            })}
          </div>
        </section>

        {/* Commentaire */}
        <section className="mt-3">
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={t("review.placeholder")}
            aria-label={t("review.commentAria")}
            className="min-h-[90px] rounded-xl border-slate-200 bg-white text-[13px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
        </section>

        <section className="mt-3">
          <PhotoMock label={t("review.photo")} fileName="avis_pompes.jpg" />
        </section>

        <p className="mt-3 flex items-start gap-1.5 px-1 text-[10.5px] leading-snug text-slate-400">
          <Star className="mt-px h-3 w-3 shrink-0 text-amber-400" />
          {t("review.note")}
        </p>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-3 pt-2.5">
        <Button
          onClick={submit}
          disabled={sending}
          className="h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t("review.sending") : t("review.submit")}
        </Button>
      </div>
    </div>
  )
}
