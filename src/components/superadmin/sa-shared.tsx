'use client'

// Super Administration — helpers de rendu partagés (dates, temps relatif)

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })

export function fmtDate(iso: string): string {
  return DATE_FMT.format(new Date(iso))
}

/** « à l'instant », « il y a 4 h », « il y a 3 j »… */
export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return "à l'instant"
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 31) return `il y a ${d} j`
  const mo = Math.floor(d / 30)
  return `il y a ${mo} mois`
}

/** Nombre de jours avant une échéance (négatif = dépassée). */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}
