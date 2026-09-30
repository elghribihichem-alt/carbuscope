"use client"

// Shadow Market (T44-c) — onglet « 🔴 Alertes » : timeline verticale des
// alertes du module (pattern alerts-timeline de la veille) : SeverityDot,
// libellé du type, titre, détail, zone · station · perte · date relative.
// Filtres chips par sévérité, clic → cartographie si pertinent.

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { ShadowOverviewResponse } from "@/lib/types"
import {
  SeverityDot, ALERT_KIND_LABELS, formatTnd, relDateFr, dateFr,
  SHADOW_COLORS,
} from "@/components/shadow/shadow-shared"
import { MapPin, ChevronRight, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

const SEV_CHIPS = [
  { value: "all", label: "Toutes" },
  { value: "CRITICAL", label: "Critiques" },
  { value: "MEDIUM", label: "Moyennes" },
  { value: "INFO", label: "Info" },
] as const

const SEV_COUNT: Record<string, number> = { CRITICAL: 0, MEDIUM: 0, INFO: 0 }

export function AlertsTab({ data, onNavigate }: { data: ShadowOverviewResponse; onNavigate?: (section: string) => void }) {
  const [severity, setSeverity] = useState<string>("all")

  const counts = useMemo(() => {
    const c: Record<string, number> = { ...SEV_COUNT }
    for (const a of data.alerts) c[a.severity] = (c[a.severity] ?? 0) + 1
    return c
  }, [data.alerts])

  const filtered = useMemo(
    () => [...data.alerts]
      .filter(a => severity === "all" || a.severity === severity)
      .sort((a, b) => {
        const order = { CRITICAL: 0, MEDIUM: 1, INFO: 2 } as Record<string, number>
        const s = (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
        if (s !== 0) return s
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      }),
    [data.alerts, severity]
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Alertes du marché parallèle</CardTitle>
            <CardDescription>
              {filtered.length} alerte{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""} sur{" "}
              {data.alerts.length} — triées par sévérité puis date · clic = localiser sur la carte
            </CardDescription>
          </div>
          {severity !== "all" && (
            <Button size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => setSeverity("all")}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Réinitialiser
            </Button>
          )}
        </div>
        {/* Filtres chips par sévérité */}
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par sévérité">
          {SEV_CHIPS.map(c => {
            const active = severity === c.value
            const n = c.value === "all" ? data.alerts.length : counts[c.value] ?? 0
            const color = c.value === "CRITICAL" ? SHADOW_COLORS.red : c.value === "MEDIUM" ? SHADOW_COLORS.orange : c.value === "INFO" ? SHADOW_COLORS.yellow : undefined
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setSeverity(c.value)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-transparent shadow-sm text-white" : "border-stone-300 text-stone-600 hover:bg-accent dark:border-stone-600 dark:text-stone-300",
                  active && c.value === "INFO" ? "text-stone-900" : ""
                )}
                style={active && color ? { backgroundColor: color } : undefined}
              >
                {color && !active && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
                {c.label}
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold tabular-nums", active ? "bg-white/25" : "bg-stone-100 dark:bg-stone-800")}>{n}</span>
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Aucune alerte ne correspond à ce filtre.</p>
        ) : (
          <div className="relative max-h-[620px] overflow-y-auto pr-2 scroll-coffee">
            {/* Ligne verticale de la timeline */}
            <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" aria-hidden />
            <ul>
              {filtered.map(a => (
                <li key={a.id} className="relative pl-7">
                  <SeverityDot severity={a.severity} />
                  <div className="pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: a.severity === "CRITICAL" ? SHADOW_COLORS.red : a.severity === "MEDIUM" ? SHADOW_COLORS.orange : "#b8860b" }}
                      >
                        {a.severity === "CRITICAL" ? "Critique" : a.severity === "MEDIUM" ? "Moyenne" : "Info"}
                      </span>
                      <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] font-normal text-muted-foreground dark:border-stone-700">
                        {ALERT_KIND_LABELS[a.kind] ?? a.kind}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground" title={dateFr(a.date)}>
                        {relDateFr(a.date)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug text-stone-900 dark:text-stone-50">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.detail}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {a.zone}
                      </span>
                      {a.stationName && <span className="truncate">{a.stationName}</span>}
                      {a.lossTnd > 0 && (
                        <strong className="tabular-nums" style={{ color: SHADOW_COLORS.red }}>{formatTnd(a.lossTnd)}</strong>
                      )}
                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate("cartography")}
                          className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                          Voir sur la carte
                          <ChevronRight className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
