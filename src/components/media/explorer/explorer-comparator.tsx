'use client'

// CarbuScope — T60-e — COMPARATEUR de faces (2-8, accès complet uniquement —
// l'API rejette une face agrégée avec un 400 explicite). Dialog plein écran :
// colonnes = faces, lignes = métriques clés. Meilleure valeur = émeraude,
// moins bonne = terracotta, neutre = zinc ; le PRIX est inversé (moins cher =
// vert). En-tête : score composite renvoyé par POST /api/media/compare
// (normalisation min-max sur le lot, pondérations du membre) en badge + barre
// de progression. Footer : pondérations affichées + renvoi vers Préférences.

import { useEffect, useMemo, useState } from "react"
import { GitCompareArrows, Loader2, RotateCcw, TriangleAlert } from "lucide-react"
import { apiJson, dtFr, numFr, pctFr, useLocalT, type LocalDict } from "@/components/media/media-shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { FACE_STATUS_META } from "@/components/media/media-shared"
import type { FaceFullDTO } from "@/lib/media/shared"
import { mergeDicts, X_DICT } from "./explorer-shared"

const C_DICT: LocalDict = {
  fr: {
    "c.m.audience": "Audience journalière",
    "c.m.tmja": "TMJA (véh./j)",
    "c.m.odv": "ODV journalières",
    "c.m.prixS": "Prix / semaine",
    "c.m.prixM": "Prix / mois",
    "c.m.prixA": "Prix / année",
    "c.m.occup": "Occupation 12 mois",
    "c.m.sov": "Part de voix",
    "c.m.congestion": "Indice de congestion",
    "c.m.lecture": "Temps de lecture (s)",
    "c.m.vitesse": "Vitesse réelle (km/h)",
    "c.w.audience": "audience",
    "c.w.trafic": "trafic",
    "c.w.prix": "prix",
    "c.w.sov": "part de voix",
    "c.retry": "Réessayer",
    "c.bestTip": "Meilleure valeur du lot",
    "c.worstTip": "Moins bonne valeur du lot",
  },
  en: {
    "c.m.audience": "Daily audience",
    "c.m.tmja": "TMJA (veh./d)",
    "c.m.odv": "Daily DVN",
    "c.m.prixS": "Price / week",
    "c.m.prixM": "Price / month",
    "c.m.prixA": "Price / year",
    "c.m.occup": "12-month occupancy",
    "c.m.sov": "Share of voice",
    "c.m.congestion": "Congestion index",
    "c.m.lecture": "Reading time (s)",
    "c.m.vitesse": "Real speed (km/h)",
    "c.w.audience": "audience",
    "c.w.trafic": "traffic",
    "c.w.prix": "price",
    "c.w.sov": "share of voice",
    "c.retry": "Retry",
    "c.bestTip": "Best value of the set",
    "c.worstTip": "Worst value of the set",
  },
  ar: {
    "c.m.audience": "الجمهور اليومي",
    "c.m.tmja": "الحركة اليومية",
    "c.m.odv": "فرص الرؤية اليومية",
    "c.m.prixS": "السعر / أسبوع",
    "c.m.prixM": "السعر / شهر",
    "c.m.prixA": "السعر / سنة",
    "c.m.occup": "الإشغال 12 شهرًا",
    "c.m.sov": "حصة الصوت",
    "c.m.congestion": "مؤشر الازدحام",
    "c.m.lecture": "زمن القراءة (ث)",
    "c.m.vitesse": "السرعة الفعلية (كم/س)",
    "c.w.audience": "الجمهور",
    "c.w.trafic": "الحركة",
    "c.w.prix": "السعر",
    "c.w.sov": "حصة الصوت",
    "c.retry": "إعادة المحاولة",
    "c.bestTip": "أفضل قيمة",
    "c.worstTip": "أسوأ قيمة",
  },
}

/** Métrique comparée : dir "up" = plus haut mieux, "down" = plus bas mieux
 *  (prix, vitesse réelle — un trafic lent expose plus longtemps). */
interface MetricDef {
  key: keyof FaceFullDTO & string
  labelKey: string
  dir: "up" | "down"
  fmt: (v: number) => string
}

const METRICS: MetricDef[] = [
  { key: "audienceJournaliere", labelKey: "c.m.audience", dir: "up", fmt: numFr },
  { key: "tmja", labelKey: "c.m.tmja", dir: "up", fmt: numFr },
  { key: "odvJournalieres", labelKey: "c.m.odv", dir: "up", fmt: numFr },
  { key: "prixSemaine", labelKey: "c.m.prixS", dir: "down", fmt: dtFr },
  { key: "prixMois", labelKey: "c.m.prixM", dir: "down", fmt: dtFr },
  { key: "prixAnnee", labelKey: "c.m.prixA", dir: "down", fmt: dtFr },
  { key: "tauxOccupation12m", labelKey: "c.m.occup", dir: "up", fmt: pctFr },
  { key: "partDeVoix", labelKey: "c.m.sov", dir: "up", fmt: pctFr },
  { key: "indiceCongestion", labelKey: "c.m.congestion", dir: "up", fmt: numFr },
  { key: "tempsLectureS", labelKey: "c.m.lecture", dir: "up", fmt: v => `${numFr(v)} s` },
  { key: "vitesseReelle", labelKey: "c.m.vitesse", dir: "down", fmt: v => `${numFr(v)} km/h` },
]

const BEST_CLS = "bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
const WORST_CLS = "bg-[#fdeee8] font-semibold text-[#b0563b] dark:bg-[#2a1a13] dark:text-[#e0957a]"

interface CompareResponse {
  faces: FaceFullDTO[]
  scores: number[]
  weights: { audience: number; trafic: number; prix: number; partDeVoix: number }
}

export interface ExplorerComparatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  faceIds: string[]
  /** Ville/format par faceId — déduits par le conteneur des panneaux chargés
   *  (le DTO compare ne transporte pas la localisation). */
  metaById?: Record<string, { ville: string; format: string }>
}

const C_MERGED = mergeDicts(X_DICT, C_DICT)

export function ExplorerComparator({ open, onOpenChange, faceIds, metaById }: ExplorerComparatorProps) {
  const { t } = useLocalT(C_MERGED)
  const [data, setData] = useState<CompareResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  // Réinitialisation au changement de lot comparé : pattern « ajustement au
  // rendu » (setState gardé pendant le rendu — évite le setState synchrone
  // dans l'effet, règle react-hooks/set-state-in-effect).
  const fetchKey = `${open ? 1 : 0}|${faceIds.join(",")}|${reload}`
  const [lastKey, setLastKey] = useState(fetchKey)
  if (fetchKey !== lastKey) {
    setLastKey(fetchKey)
    setData(null)
    setError(null)
  }

  useEffect(() => {
    if (!open || faceIds.length < 2) return
    const ctrl = new AbortController()
    apiJson<CompareResponse>("/api/media/compare", {
      method: "POST",
      body: JSON.stringify({ faceIds }),
      signal: ctrl.signal,
    })
      .then(d => setData(d))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [open, faceIds, reload])

  // Scores normalisés pour la barre de progression (0-100).
  const maxScore = useMemo(
    () => (data ? Math.max(...data.scores, 1) : 1),
    [data],
  )
  const bestScoreIdx = useMemo(
    () => (data && data.scores.length > 1 ? data.scores.indexOf(Math.max(...data.scores)) : -1),
    [data],
  )
  const worstScoreIdx = useMemo(
    () => (data && data.scores.length > 1 ? data.scores.indexOf(Math.min(...data.scores)) : -1),
    [data],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4 text-[#b0563b]" aria-hidden /> {t("x.cmp.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">{t("x.cmp.desc")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {error !== null ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/50">
              <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                <TriangleAlert className="h-4 w-4" aria-hidden /> {error}
              </p>
              <Button variant="outline" className="h-11 gap-2 text-sm" onClick={() => setReload(k => k + 1)}>
                <RotateCcw className="h-4 w-4" aria-hidden /> {t("c.retry")}
              </Button>
            </div>
          ) : data === null ? (
            <div className="space-y-2 p-1" aria-busy="true">
              <Skeleton className="h-16 w-full rounded-lg" />
              {METRICS.map(m => <Skeleton key={m.key} className="h-10 w-full rounded-lg" />)}
              <p className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {t("x.cmp.title")}…
              </p>
            </div>
          ) : faceIds.length < 2 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("x.cmp.empty")}
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t("x.cmp.title")}</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="sticky start-0 z-10 min-w-36 bg-background p-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("x.cmp.metric")}
                  </th>
                  {data.faces.map((f, i) => (
                    <th key={f.id} scope="col" className="min-w-36 border-s p-2 align-top">
                      <div className="space-y-1 text-center">
                        <p className="font-mono text-[11px] font-semibold">{f.code}</p>
                        <p className="text-[10px] leading-tight text-muted-foreground">
                          {metaById?.[f.id]?.ville ? `${metaById[f.id].ville} · ` : ""}
                          {metaById?.[f.id]?.format ?? f.orientation}
                        </p>
                        {/* Score composite (badge + barre proportionnelle) */}
                        <div className="mx-auto flex max-w-32 items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={
                              i === bestScoreIdx
                                ? `gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400`
                                : i === worstScoreIdx
                                  ? `gap-1 border-[#e5c9be] bg-[#fdeee8] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]`
                                  : "gap-1"
                            }
                            title={t("x.cmp.score")}
                          >
                            {t("x.cmp.score")} {numFr(Math.round(data.scores[i] * 10) / 10)}
                          </Badge>
                        </div>
                        <Progress value={Math.max(4, Math.min(100, (data.scores[i] / maxScore) * 100))} className="mx-auto h-1.5 max-w-32" aria-hidden />
                        {FACE_STATUS_META[f.status] && (
                          <Badge variant="outline" className={`text-[9px] ${FACE_STATUS_META[f.status].className}`}>
                            {FACE_STATUS_META[f.status].label}
                          </Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map(m => {
                  const values = data.faces.map(f => Number((f as unknown as Record<string, unknown>)[m.key] ?? 0))
                  const best = m.dir === "up" ? Math.max(...values) : Math.min(...values)
                  const worst = m.dir === "up" ? Math.min(...values) : Math.max(...values)
                  const hasSpread = best !== worst
                  return (
                    <tr key={m.key} className="border-b last:border-0">
                      <th scope="row" className="sticky start-0 z-10 bg-background p-2 text-left text-xs font-medium text-muted-foreground">
                        {t(m.labelKey)}
                      </th>
                      {data.faces.map((f, i) => {
                        const v = values[i]
                        const isBest = hasSpread && v === best
                        const isWorst = hasSpread && v === worst
                        return (
                          <td
                            key={f.id}
                            className={`border-s p-2 text-center tabular-nums transition-colors ${isBest ? BEST_CLS : isWorst ? WORST_CLS : ""}`}
                            title={isBest ? t("c.bestTip") : isWorst ? t("c.worstTip") : undefined}
                          >
                            {m.fmt(v)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {data && (
          <footer className="border-t pt-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide">{t("x.cmp.weights")} :</span>
              <span>{t("c.w.audience")} {Math.round(data.weights.audience * 100)} %</span> ·
              <span>{t("c.w.trafic")} {Math.round(data.weights.trafic * 100)} %</span> ·
              <span>{t("c.w.prix")} {Math.round(data.weights.prix * 100)} %</span> ·
              <span>{t("c.w.sov")} {Math.round(data.weights.partDeVoix * 100)} %</span>
              <span className="w-full font-normal italic">{t("x.cmp.weightsNote")}</span>
            </p>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}
