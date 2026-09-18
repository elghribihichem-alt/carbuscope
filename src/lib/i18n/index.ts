// i18n — point d'entrée unique : hook useI18n(), translate(), helpers de formatage.
// Usage : const { t, lang, isRTL, locale } = useI18n()
//         t("map.aroundMe")  ·  t("map.bellAria", { n: 3 })

"use client"

import { useCallback, useEffect, useState } from "react"
import { SERVICE_LABELS } from "@/lib/types"
import { fr, type DictKey } from "./fr"
import { ar } from "./ar"
import { en } from "./en"
import { it } from "./it"
import { es } from "./es"
import { detectLang, LANG_META, useI18nStore, type Lang } from "./store"

export type { Lang } from "./store"
export { LANGS, LANG_META, detectLang, useI18nStore } from "./store"
export type { DictKey } from "./fr"

const DICTS: Record<Lang, Partial<Record<DictKey, string>>> = { fr, ar, en, it, es }

/** Traduction pure — fallback français, fallback clé */
export function translate(lang: Lang, key: DictKey, params?: Record<string, string | number>): string {
  let raw = DICTS[lang][key] ?? fr[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      raw = raw.split(`{${k}}`).join(String(v))
    }
  }
  return raw
}

/** Libellé d'un service dans la langue courante (fallback libellé FR puis slug) */
export function serviceLabel(lang: Lang, slug: string): string {
  return translate(lang, `service.${slug}` as DictKey) === `service.${slug}`
    ? (SERVICE_LABELS[slug] ?? slug)
    : translate(lang, `service.${slug}` as DictKey)
}

/** Date relative localisée (Intl.RelativeTimeFormat — « aujourd'hui », « 2 days ago », « منذ يومين »…) */
export function relativeDate(lang: Lang, iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(LANG_META[lang].locale, { numeric: "auto" })
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return rtf.format(0, "day")
  if (days < 30) return rtf.format(-days, "day")
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month")
  return rtf.format(-Math.floor(days / 365), "year")
}

/** Date courte localisée (5 janv. 2026 / Jan 5, 2026 / ٥ جمار٢٠٢٦…) */
export function formatDate(lang: Lang, iso: string): string {
  return new Intl.DateTimeFormat(LANG_META[lang].locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}

/** Heure HH:MM localisée */
export function formatTime(lang: Lang, date: Date): string {
  return date.toLocaleTimeString(LANG_META[lang].locale, { hour: "2-digit", minute: "2-digit" })
}

/** Nombres localisés (séparateur de milliers selon la locale) */
export function formatNumber(lang: Lang, n: number): string {
  return new Intl.NumberFormat(LANG_META[lang].locale).format(n)
}

/**
 * Hook principal — résout la langue effective (choix explicite, sinon détection
 * du terminal). Le passage « mounted » évite tout écart d'hydratation SSR :
 * premier rendu identique serveur/client (fr), puis application du choix.
 */
export function useI18n() {
  const stored = useI18nStore(s => s.lang)
  const setLang = useI18nStore(s => s.setLang)
  const setAuto = useI18nStore(s => s.setAuto)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(id)
  }, [])

  const lang: Lang = mounted ? (stored ?? detectLang()) : "fr"
  const t = useCallback((key: DictKey, params?: Record<string, string | number>) => translate(lang, key, params), [lang])
  const svc = useCallback((slug: string) => serviceLabel(lang, slug), [lang])

  return {
    lang,
    explicit: stored,
    isAuto: stored === null,
    t,
    svc,
    setLang,
    setAuto,
    isRTL: LANG_META[lang].dir === "rtl",
    dir: LANG_META[lang].dir as "ltr" | "rtl",
    locale: LANG_META[lang].locale,
  }
}
