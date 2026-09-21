// i18n — Store global de langue (B.3.4 / A.9)
// - `lang: null` → détection automatique de la langue du téléphone
// - `lang: "fr" | "ar" | "en" | "it" | "es"` → choix explicite persisté
// Persistance localStorage « carbuscope-lang », merge assainissant.

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Lang = "fr" | "ar" | "en" | "it" | "es"

export const LANGS: { code: Lang; native: string; flag: string; dir: "ltr" | "rtl" }[] = [
  { code: "fr", native: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "ar", native: "العربية", flag: "🇹🇳", dir: "rtl" },
  { code: "en", native: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "it", native: "Italiano", flag: "🇮🇹", dir: "ltr" },
  { code: "es", native: "Español", flag: "🇪🇸", dir: "ltr" },
]

export const LANG_META: Record<Lang, { native: string; flag: string; dir: "ltr" | "rtl"; locale: string }> = {
  fr: { native: "Français", flag: "🇫🇷", dir: "ltr", locale: "fr-FR" },
  ar: { native: "العربية", flag: "🇹🇳", dir: "rtl", locale: "ar-TN" },
  en: { native: "English", flag: "🇬🇧", dir: "ltr", locale: "en-GB" },
  it: { native: "Italiano", flag: "🇮🇹", dir: "ltr", locale: "it-IT" },
  es: { native: "Español", flag: "🇪🇸", dir: "ltr", locale: "es-ES" },
}

const VALID: Lang[] = ["fr", "ar", "en", "it", "es"]

interface I18nState {
  /** null = mode automatique (détection du terminal) */
  lang: Lang | null
  setLang: (l: Lang) => void
  setAuto: () => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    set => ({
      lang: null,
      setLang: l => set({ lang: l }),
      setAuto: () => set({ lang: null }),
    }),
    {
      name: "carbuscope-lang",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<I18nState>
        const ok = p.lang !== null && typeof p.lang === "string" && VALID.includes(p.lang)
        return { ...current, lang: ok ? (p.lang as Lang) : null }
      },
    }
  )
)

/** Détection B.3.4 — langue du terminal (client uniquement, mémoïsée) */
let detectedCache: Lang | null = null
export function detectLang(): Lang {
  if (detectedCache) return detectedCache
  if (typeof navigator === "undefined") return "fr"
  const tags = [navigator.language, ...(navigator.languages ?? [])]
  for (const tag of tags) {
    const base = (tag ?? "").toLowerCase().split("-")[0]
    if ((VALID as string[]).includes(base)) {
      detectedCache = base as Lang
      return detectedCache
    }
  }
  detectedCache = "fr"
  return "fr"
}
