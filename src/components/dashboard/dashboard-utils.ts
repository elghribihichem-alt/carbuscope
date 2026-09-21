// CarbuScope — Helpers du tableau de bord (module A.2)
// Dates françaises, tri des alertes par priorité, dynamisme des séries.

import type { AlertDTO } from "@/lib/types"

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" })

/** Date relative courte en français : « il y a 3 jours », « à l'instant »… */
export function relativeDate(iso: string): string {
  const t = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const min = Math.round(t / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return rtf.format(-min, "minute")
  const h = Math.round(min / 60)
  if (h < 24) return rtf.format(-h, "hour")
  const d = Math.round(h / 24)
  if (d < 31) return rtf.format(-d, "day")
  const m = Math.round(d / 30)
  if (m < 12) return rtf.format(-m, "month")
  return rtf.format(-Math.round(m / 12), "year")
}

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, MEDIUM: 1, INFO: 2 }

/** Date au format français : « 3 janv. 2025 » */
export function dateFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(iso))
}

/** Tri par priorité (critique > moyen > info) puis date décroissante. */
export function sortByPriority(alerts: AlertDTO[]): AlertDTO[] {
  return [...alerts].sort((a, b) => {
    const s = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
    if (s !== 0) return s
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
}

/** Taux de croissance d'une série (premier → dernier point) ; ∞ si départ nul. */
export function growthRate(values: number[]): number {
  const first = values[0] ?? 0
  const last = values[values.length - 1] ?? 0
  if (first <= 0) return last > 0 ? Number.POSITIVE_INFINITY : 0
  return (last - first) / first
}

/** L'élément date-t-il de moins de `days` jours ? */
export function isFresh(iso: string, days = 7): boolean {
  const t = Date.now() - new Date(iso).getTime()
  return !Number.isNaN(t) && t >= 0 && t < days * 86_400_000
}
