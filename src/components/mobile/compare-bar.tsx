'use client'

// CarbuScope Mobile — barre du comparateur : stations épinglées (chips avec
// retrait), compteur n/max, bouton « Comparer » et vidage. Affichée en bas des
// écrans Carte / Recherche dès la première épingle (au-dessus de la barre
// d'onglets). S'adapte au RTL via des propriétés logiques.

import { AnimatePresence, motion } from "framer-motion"
import { GitCompareArrows, Trash2, X } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AppApi } from "./shared"
import { BrandDot, fmtKm } from "./shared"
import { MAX_MOBILE_COMPARE, useCompareStore } from "./compare-store"

export function CompareBar({ api }: { api: AppApi }) {
  const { t } = useI18n()
  const ids = useCompareStore(s => s.stationIds)
  const removeCompare = useCompareStore(s => s.removeCompare)
  const clear = useCompareStore(s => s.clear)

  // Résolution des stations épinglées (les non résolues sont ignorées)
  const byId = new Map(api.allStations.map(s => [s.id, s]))
  const pinned = ids.map(id => byId.get(id)).filter(Boolean) as typeof api.allStations

  return (
    <AnimatePresence initial={false}>
      {pinned.length > 0 && (
        <motion.div
          key="compare-bar"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          role="region"
          aria-label={t("compare.barAria")}
          className="z-20 shrink-0 border-t border-emerald-200 bg-white px-2.5 pb-2 pt-2 shadow-[0_-4px_14px_rgba(0,0,0,0.05)]"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
              <GitCompareArrows className="h-4 w-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {pinned.map(s => (
                <span
                  key={s.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 text-[11px] font-medium text-slate-700"
                >
                  <BrandDot color={s.brandColor} />
                  <span className="max-w-[104px] truncate">{s.name}</span>
                  <span className="text-[10px] font-semibold text-emerald-700">{fmtKm(s.distanceKm)}</span>
                  <button
                    type="button"
                    onClick={() => removeCompare(s.id)}
                    aria-label={t("compare.removeAria", { name: s.name })}
                    className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
              {pinned.length < 2 && (
                <span className="shrink-0 text-[10.5px] italic leading-tight text-slate-400">
                  {t("compare.needMore")}
                </span>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-700" aria-hidden>
              {pinned.length}/{MAX_MOBILE_COMPARE}
            </span>
            <button
              type="button"
              onClick={api.openCompare}
              disabled={pinned.length < 2}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-bold shadow-sm transition-all active:scale-95",
                pinned.length >= 2
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              )}
            >
              <GitCompareArrows className="h-3.5 w-3.5" aria-hidden />
              {t("compare.cta")}
            </button>
            <button
              type="button"
              onClick={clear}
              aria-label={t("compare.clearAria")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
