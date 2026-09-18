// CarbuScope — Helpers de la veille (module A.7)
// Dates françaises, styles timeline/badges et export CSV des mouvements.

import { MOVEMENT_TYPE_LABELS, type MovementDTO } from "@/lib/types"

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

/** Date au format français : « 3 janv. 2025 » */
export function dateFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(iso))
}

/** L'élément date-t-il de moins de `days` jours ? */
export function isFresh(iso: string, days = 7): boolean {
  const t = Date.now() - new Date(iso).getTime()
  return !Number.isNaN(t) && t >= 0 && t < days * 86_400_000
}

/** Couleur du point de timeline selon la sévérité. */
export const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  MEDIUM: "bg-amber-500",
  INFO: "bg-emerald-500",
}

/** Styles des badges de type de mouvement (ouverture / rénovation / fermeture / re-branding). */
export const MOVEMENT_BADGE_CLS: Record<string, string> = {
  OPENING: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  RENOVATION: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  CLOSURE: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  REBRAND: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
}

/** Couleur par défaut (enseigne inconnue). */
export const NEUTRAL_DOT = "#94a3b8"

/**
 * Export CSV côté client (séparateur « ; », BOM UTF-8 pour Excel FR).
 * Génère un Blob et déclenche le téléchargement.
 */
export function exportMovementsCsv(movements: MovementDTO[]): void {
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`
  const header = ["Date", "Type", "Enseigne", "Station", "Gouvernorat", "Impact estimé"]
  const lines = movements.map(m =>
    [
      dateFr(m.date),
      MOVEMENT_TYPE_LABELS[m.type] ?? String(m.type),
      m.brand,
      m.station,
      m.gouvernorat,
      m.impact,
    ].map(esc).join(";")
  )
  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `carbuscope-mouvements-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
