'use client'

// A.9 — Paramètres : langue de l'interface (5 langues, RTL pour l'arabe)
// Relié au store i18n global : le choix s'applique réellement à l'application
// mobile (aperçu Module B) et persiste dans localStorage « carbuscope-lang ».

import { Check, Languages, Smartphone, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { detectLang, LANGS, useI18n, useI18nStore } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function SettingsLanguageCard() {
  const { t, lang, isAuto } = useI18n()
  const setLang = useI18nStore(s => s.setLang)
  const setAuto = useI18nStore(s => s.setAuto)

  const select = (code: "fr" | "ar" | "en" | "it" | "es") => {
    const next = LANGS.find(l => l.code === code)
    setLang(code)
    toast.success(t("lang.toast", { lang: next?.native ?? code }), {
      description: code === "ar" ? t("lang.toastRtlDesc") : t("lang.toastDesc"),
    })
  }

  const selectAuto = () => {
    setAuto()
    const detected = LANGS.find(l => l.code === detectLang())
    toast.info(t("lang.autoNote", { lang: detected?.native ?? "fr" }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="h-4 w-4 text-purple-600" aria-hidden /> Langue de l&apos;interface
        </CardTitle>
        <CardDescription>
          5 langues disponibles — l&apos;arabe bascule l&apos;interface en RTL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="radiogroup"
          aria-label="Langue de l'interface"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {LANGS.map(l => {
            const on = !isAuto && lang === l.code
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => select(l.code)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                  on && "border-purple-400 bg-purple-50/60 ring-1 ring-purple-300 dark:border-purple-700 dark:bg-purple-950/40 dark:ring-purple-800"
                )}
              >
                <span className="text-xl leading-none" aria-hidden>{l.flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" dir={l.dir}>{l.native}</span>
                  {l.dir === "rtl" && (
                    <Badge variant="outline" className="mt-0.5 h-4 px-1 text-[9px] font-normal">{t("lang.rtlBadge")}</Badge>
                  )}
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden />}
              </button>
            )
          })}
          <button
            type="button"
            role="radio"
            aria-checked={isAuto}
            onClick={selectAuto}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
              isAuto && "border-amber-400 bg-amber-50/60 ring-1 ring-amber-300 dark:border-amber-700 dark:bg-amber-950/40 dark:ring-amber-800"
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t("lang.auto")}</span>
              {isAuto && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  → {LANGS.find(l => l.code === lang)?.native ?? lang}
                </span>
              )}
            </span>
            {isAuto && <Check className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />}
          </button>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("lang.appliedHere")} — {t("lang.auto").toLowerCase()} : {LANGS.find(l => l.code === detectLang())?.native}.
        </p>
      </CardContent>
    </Card>
  )
}
