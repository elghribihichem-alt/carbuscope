'use client'

// CarbuScope — KPI « Indice de saturation concurrentielle » (A.5.1).
// Jauge semi-circulaire : < 40 émeraude (zone calme), < 70 ambre (vigilance), sinon rouge (saturé).

import { Gauge } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

const ARC_LENGTH = Math.PI * 30 // rayon 30 → demi-cercle

function toneFor(value: number) {
  if (value < 40) {
    return {
      stroke: "#059669",
      chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
      sub: "text-emerald-600 dark:text-emerald-400",
      hint: "zone concurrentielle calme",
    }
  }
  if (value < 70) {
    return {
      stroke: "#d97706",
      chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
      sub: "text-amber-600 dark:text-amber-400",
      hint: "vigilance conseillée",
    }
  }
  return {
    stroke: "#dc2626",
    chip: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    sub: "text-red-600 dark:text-red-400",
    hint: "marché saturé",
  }
}

export function SaturationCard({ value, avgCompetitors }: { value: number; avgCompetitors: number }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  const tone = toneFor(value)
  const dash = (clamped / 100) * ARC_LENGTH
  const avgTxt = avgCompetitors.toFixed(1).replace(".", ",")

  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone.chip)}>
          <Gauge className="h-4.5 w-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Indice de saturation</p>
          <div className="mt-0.5 flex items-center gap-2.5">
            <p className="text-xl font-bold tabular-nums leading-none">
              {clamped}
              <span className="text-xs font-medium text-muted-foreground"> /100</span>
            </p>
            {/* Jauge semi-circulaire */}
            <svg viewBox="0 0 72 40" className="h-9 w-16 shrink-0" role="img" aria-label={`Indice de saturation : ${clamped} sur 100 — ${tone.hint}`}>
              <path d="M 6 36 A 30 30 0 0 1 66 36" fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: "var(--border)" }} />
              <path
                d="M 6 36 A 30 30 0 0 1 66 36"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                stroke={tone.stroke}
                strokeDasharray={`${dash} ${ARC_LENGTH + 40}`}
              />
            </svg>
          </div>
          <p className={cn("mt-1 truncate text-xs text-muted-foreground", tone.sub)}>
            moy. {avgTxt} concurrents à 5 km · {tone.hint}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
