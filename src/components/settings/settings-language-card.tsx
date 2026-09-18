'use client'

// A.9 — Paramètres : langue de l'interface (5 langues, RTL pour l'arabe)

import { useState } from "react"
import { toast } from "sonner"
import { Languages, Check, Smartphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Langue = {
  code: string
  drapeau: string
  label: string
  note?: string
}

const LANGUES: Langue[] = [
  { code: "ar", drapeau: "🇹🇳", label: "العربية", note: "RTL" },
  { code: "fr", drapeau: "🇫🇷", label: "Français" },
  { code: "en", drapeau: "🇬🇧", label: "English" },
  { code: "it", drapeau: "🇮🇹", label: "Italiano" },
  { code: "es", drapeau: "🇪🇸", label: "Español" },
]

export function SettingsLanguageCard() {
  // Le français est la langue sélectionnée par défaut (interface actuelle)
  const [langue, setLangue] = useState("fr")

  const select = (code: string) => {
    const previous = LANGUES.find(l => l.code === langue)?.label
    const next = LANGUES.find(l => l.code === code)
    setLangue(code)
    if (code !== "fr") {
      toast.info(`Interface programmée pour « ${next?.label} »`, {
        description: "La traduction sera appliquée à la prochaine session de démonstration (actuellement : Français).",
      })
    } else {
      toast.success("Langue de l'interface : Français", {
        description: previous && previous !== "Français" ? `Remplace « ${previous} ».` : undefined,
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="h-4 w-4 text-purple-600" aria-hidden /> Langue de l&apos;interface
        </CardTitle>
        <CardDescription>5 langues disponibles — l&apos;arabe bascule l&apos;interface en RTL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          role="radiogroup"
          aria-label="Langue de l'interface"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
        >
          {LANGUES.map(l => {
            const on = langue === l.code
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
                <span className="text-xl leading-none" aria-hidden>{l.drapeau}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" dir={l.code === "ar" ? "rtl" : "ltr"}>{l.label}</span>
                  {l.note && (
                    <Badge variant="outline" className="mt-0.5 h-4 px-1 text-[9px] font-normal">{l.note}</Badge>
                  )}
                </span>
                {on && <Check className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden />}
              </button>
            )
          })}
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Détection automatique disponible sur mobile (langue du terminal).
        </p>
      </CardContent>
    </Card>
  )
}
