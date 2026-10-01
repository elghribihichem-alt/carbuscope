'use client'

// CarbuScope — T54-B2 — bandeau discret des alertes de zone du Radar
// d'opportunités (en tête du module, tous volets confondus) + Sheet de liste :
// type, gouvernorat, message, date FR relative et acquittement (PATCH
// /api/radar/alerts → toast sonner + rechargement local). Les données et la
// mutation d'acquittement sont possédées par radar-module.tsx (le bandeau est
// une vue) — le compte alimente aussi le KPI « Zones détectées » du volet
// scoring.

import { useState } from "react"
import { Bell, Check, CheckCheck, Landmark, MapPin, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/shell/loading"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type ZoneAlertRow = {
  id: string
  gouvernorat: string
  type: string
  score: number
  threshold: number
  message: string
  acknowledged: boolean
  acknowledgedBy: string | null
  createdAt: string
}

/** Métadonnée d'affichage par type d'alerte (palette sans bleu). */
const TYPE_META: Record<string, { label: string; icon: typeof TrendingUp; chip: string; dot: string }> = {
  OPPORTUNITE: {
    label: "Opportunité",
    icon: TrendingUp,
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  ZONE_BLANCHE: {
    label: "Zone blanche",
    icon: MapPin,
    chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  FONCIER: {
    label: "Foncier",
    icon: Landmark,
    chip: "border-[#e6a084] bg-[#fdf1eb] text-[#b4552f] dark:border-[#7a4a38] dark:bg-[#3a241c] dark:text-[#e8a186]",
    dot: "bg-[#e07856]",
  },
}

export function alertTypeMeta(type: string) {
  return TYPE_META[type] ?? {
    label: type,
    icon: Bell,
    chip: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
    dot: "bg-zinc-400",
  }
}

export function RadarAlertsBanner({
  alerts,
  loading,
  onAcknowledge,
}: {
  alerts: ZoneAlertRow[] | null
  loading: boolean
  onAcknowledge: (id: string, acknowledged: boolean) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const unack = alerts?.filter(a => !a.acknowledged) ?? []
  const unackCount = unack.length

  // Rien à signaler : le bandeau reste discret (une ligne fine neutre).
  if (loading && alerts === null) {
    return <Skeleton className="h-9 rounded-lg" aria-label="Chargement des alertes du Radar…" />
  }
  if (unackCount === 0) {
    if (!alerts || alerts.length === 0) return null
    return (
      <p className="flex min-w-0 items-center gap-2 px-1 text-[11px] text-muted-foreground">
        <CheckCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Toutes les alertes de zone sont acquittées ({alerts.length} historisée{alerts.length > 1 ? "s" : ""}).
      </p>
    )
  }

  return (
    <>
      {/* Bandeau discret (en tête du module, au-dessus des sous-onglets). */}
      <div
        role="status"
        className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-[#e6a084] bg-[#fdf1eb] px-3 py-2 dark:border-[#7a4a38] dark:bg-[#312019]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e07856]/15 text-[#b4552f] dark:text-[#e8a186]" aria-hidden>
          <Bell className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 flex-1 truncate text-xs text-[#7a3d24] dark:text-[#e8c4b4]">
          <span className="font-semibold">{t("sb.radar.title")}</span> — {unackCount} alerte
          {unackCount > 1 ? "s" : ""} de zone non acquittée{unackCount > 1 ? "s" : ""} à examiner.
        </p>
        <Badge className="bg-[#e07856] text-white dark:bg-[#c25f3c] dark:text-white" aria-label={`${unackCount} alertes non acquittées`}>
          {unackCount}
        </Badge>
        <Button
          size="sm"
          className="h-9 min-h-9 gap-1.5"
          onClick={() => setOpen(true)}
          aria-label={`Examiner les ${unackCount} alertes de zone non acquittées`}
        >
          Examiner
        </Button>
      </div>

      {/* Sheet : liste des alertes (non acquittées d'abord — ordre de l'API). */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b border-[var(--c-line)] p-4 dark:border-zinc-800">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-[#e07856]" aria-hidden />
              Alertes du Radar — {unackCount} active{unackCount > 1 ? "s" : ""}
            </SheetTitle>
            <SheetDescription>
              Zones détectées par la passe de scoring (idempotente) : opportunités fortes, zones blanches à fort
              potentiel et signaux fonciers. Acquittez une alerte pour la retirer du bandeau.
            </SheetDescription>
          </SheetHeader>
          <ul className="min-w-0 divide-y divide-[var(--c-line)] dark:divide-zinc-800">
            {(alerts ?? []).map(a => {
              const meta = alertTypeMeta(a.type)
              const Icon = meta.icon
              return (
                <li key={a.id} className={cn("min-w-0 p-4", a.acknowledged && "opacity-60")}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.chip)}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[11px]", meta.chip)}>
                          {meta.label}
                        </Badge>
                        <span className="text-xs font-semibold">{a.gouvernorat}</span>
                        {a.acknowledged ? (
                          <Badge variant="outline" className="gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3 w-3" aria-hidden />
                            acquittée
                          </Badge>
                        ) : (
                          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-label="Alerte non acquittée" />
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">{a.message}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground" title={a.createdAt}>
                        Détectée {relativeFr("fr", a.createdAt)}
                        {a.acknowledged && a.acknowledgedBy ? ` · acquittée par ${a.acknowledgedBy}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant={a.acknowledged ? "outline" : "default"}
                      size="sm"
                      className="h-11 min-h-11 gap-1.5"
                      disabled={busyId === a.id}
                      onClick={async () => {
                        setBusyId(a.id)
                        await onAcknowledge(a.id, !a.acknowledged)
                        setBusyId(null)
                      }}
                      aria-label={
                        a.acknowledged
                          ? `Désacquitter l'alerte ${a.gouvernorat}`
                          : `Acquitter l'alerte ${a.gouvernorat}`
                      }
                    >
                      {a.acknowledged ? (
                        <>
                          <Check className="h-3.5 w-3.5 rotate-180" aria-hidden />
                          Annuler l&apos;acquit
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Acquitter
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Date relative FR (Intl.RelativeTimeFormat — même méthode que lib/i18n). */
function relativeFr(_lang: string, iso: string): string {
  try {
    const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" })
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (days <= 0) return rtf.format(0, "day")
    if (days < 30) return rtf.format(-days, "day")
    if (days < 365) return rtf.format(-Math.floor(days / 30), "month")
    return rtf.format(-Math.floor(days / 365), "year")
  } catch {
    return iso
  }
}
