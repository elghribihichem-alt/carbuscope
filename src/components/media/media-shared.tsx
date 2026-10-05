'use client'

// CarbuScope — Module Média (T60) : socle partagé des composants UI du module.
// Dictionnaire local FR/EN/AR (RTL) par fichier de volet — pattern « dict
// maison » : chaque volet porte SES clés, aucun conflit d'édition entre
// volets ; la langue vient du store i18n global, le RTL du layout.

import { useCallback } from "react"
import { useI18nStore, type Lang } from "@/lib/i18n/store"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

export type LocalDict = Partial<Record<"fr" | "en" | "ar", Record<string, string>>>

/** Hook de traduction locale du module Média : t("key") lit la langue globale
 *  (fr/en/ar — fallback fr, fallback clé). Le dictionnaire est fourni par le
 *  volet, ce qui isole chaque écran du point de vue des conflits d'édition. */
export function useLocalT(dict: LocalDict) {
  const lang = useI18nStore(s => s.lang)
  const t = useCallback((key: string): string => {
    const table = dict[lang === "ar" ? "ar" : lang === "en" ? "en" : "fr"] ?? {}
    return table[key] ?? dict.fr?.[key] ?? key
  }, [dict, lang])
  return { t, lang: lang as Lang, isRTL: lang === "ar" }
}

// ─────────────────── Fetch JSON typé ───────────────────

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })
  const body = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`)
  return body
}

// ─────────────────── Méta statuts / badges ───────────────────

export const FACE_STATUS_META: Record<string, { label: string; className: string }> = {
  DISPONIBLE: { label: "Disponible", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  OCCUPEE: { label: "Occupée", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  MAINTENANCE: { label: "Maintenance", className: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  RETIREE: { label: "Retirée", className: "border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500" },
}

export const PANEL_STATUS_META: Record<string, { label: string; className: string }> = {
  ACTIF: { label: "Actif", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  MAINTENANCE: { label: "Maintenance", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  RETIRE: { label: "Retiré", className: "border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500" },
}

export const VISIBILITY_MODE_META: Record<string, { label: string; className: string; hint: string }> = {
  PUBLIQUE: { label: "Publique", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", hint: "Visible par toutes les enseignes" },
  GRANULAIRE: { label: "Granulaire", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400", hint: "Autorisations / exclusions par enseigne, groupe, zone, conditions" },
  EXCLUSIVE: { label: "Exclusive", className: "border-terracotta bg-[#fdeee8] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]", hint: "Réservée à une seule enseigne" },
}

export const SIM_STATUS_META: Record<string, { label: string; className: string }> = {
  BROUILLON: { label: "Brouillon", className: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  ENVOYEE: { label: "Envoyée", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  ARCHIVEE: { label: "Archivée", className: "border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500" },
}

/** Chapeau de module (bandeau titre + description + badge). */
export function ModuleHeader({ title, description, badge, icon: Icon }: {
  title: string
  description: string
  badge?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#fdeee8] text-[#b0563b] dark:bg-[#2a1a13] dark:text-[#e0957a]">
            <Icon className="h-5.5 w-5.5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        {badge ? <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">{badge}</Badge> : null}
      </CardContent>
    </Card>
  )
}

/** Formatage nombres FR compact. */
export const numFr = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : n.toLocaleString("fr-FR")

export const dtFr = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("fr-FR")} DT`

export const pctFr = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("fr-FR")} %`

export const dateFr = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"

/** Classe commune pour cellule éditable au survol (indicateur discret). */
export const editableCellClass = "cursor-default transition-colors hover:bg-amber-50/70 dark:hover:bg-amber-950/40"
