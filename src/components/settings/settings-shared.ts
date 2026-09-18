"use client"

// CarbuScope — Helpers partagés entre les modules de l'agent 5-e
// (Portail Enseigne, Back-office plateforme, Paramètres A.9)

import { useCallback, useEffect, useState } from "react"

/** Les 24 gouvernorats tunisiens (liste de repli si l'API est indisponible) */
export const GOVERNORAT_NAMES: string[] = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
]

const DAY_MS = 86_400_000

/** « il y a X j » — libellé relatif en français */
export function relDays(iso: string | null | undefined): string {
  if (!iso) return "Jamais"
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return "Hier"
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  if (months < 12) return `il y a ${months} mois`
  return `il y a ${Math.floor(months / 12)} an${months >= 24 ? "s" : ""}`
}

/** Date courte française : « 12 sept. 2026 » */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
}

/** Date + heure française : « 12 sept. 2026, 14:05 » */
export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso))
}

/** Nombre de mois écoulés depuis une date (approx. 30,44 j/mois) */
export function monthsSince(iso: string | Date | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / (DAY_MS * 30.44)
}

/** Nombre de jours écoulés depuis une date */
export function daysSince(iso: string | Date | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / DAY_MS
}

/** Formatage numérique français */
export const num = (v: number): string => new Intl.NumberFormat("fr-FR").format(Math.round(v))

/** Pourcentage à la française : « 96,4 % » */
export const pct = (v: number): string => `${v.toFixed(1).replace(".", ",")} %`

/** Copie dans le presse-papiers (retourne true en cas de succès) */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Hook : noms des gouvernorats (fetch /api/governorats, repli sur la liste statique) */
export function useGovernoratNames(): string[] {
  const [names, setNames] = useState<string[]>(GOVERNORAT_NAMES)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/governorats", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { governorats?: { name: string }[] }) => {
        const list = j.governorats?.map(g => g.name).filter(Boolean) ?? []
        if (list.length > 0) setNames(list)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  return names
}

/** Suffixe de clé API factice (4 hex) */
export function generateKeySuffix(): string {
  return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0")
}

/** Clé API masquée pour l'affichage : csk_live_••••••••••••3f8a */
export function maskedApiKey(suffix: string): string {
  return `csk_live_••••••••••••${suffix}`
}
