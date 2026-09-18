'use client'

// CarbuScope — Alertes actives (module A.7.1)
// Filtres par type (chips), sévérité et recherche + timeline verticale stylée.

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SeverityBadge, ImpactBadge } from "@/components/shell/badges"
import { ALERT_TYPE_LABELS, type AlertDTO } from "@/lib/types"
import { MapPin, Search, RotateCcw, DoorOpen, Hammer, ArrowLeftRight, HardHat, Scale } from "lucide-react"
import { cn } from "@/lib/utils"
import { relativeDate, dateFr, isFresh, SEVERITY_DOT, NEUTRAL_DOT } from "./veille-utils"

const SEV_ORDER: Record<string, number> = { CRITICAL: 0, MEDIUM: 1, INFO: 2 }
const ALERT_TYPES = ["OPENING", "RENOVATION", "REBRAND", "INFRA", "REGULATORY"] as const

const TYPE_ICONS: Record<string, typeof DoorOpen> = {
  OPENING: DoorOpen,
  RENOVATION: Hammer,
  REBRAND: ArrowLeftRight,
  INFRA: HardHat,
  REGULATORY: Scale,
}

export function AlertsTimeline({ alerts, brandColors }: { alerts: AlertDTO[]; brandColors: Record<string, string> }) {
  const [types, setTypes] = useState<string[]>([])
  const [severity, setSeverity] = useState("all")
  const [search, setSearch] = useState("")

  const toggleType = (t: string) => {
    setTypes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))
  }
  const resetFilters = () => {
    setTypes([])
    setSeverity("all")
    setSearch("")
  }

  const hasFilters = types.length > 0 || severity !== "all" || search.trim() !== ""

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return alerts
      .filter(a =>
        (types.length === 0 || types.includes(a.type)) &&
        (severity === "all" || a.severity === severity) &&
        (!q || `${a.title} ${a.description} ${a.brand} ${a.gouvernorat}`.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const s = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
        if (s !== 0) return s
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  }, [alerts, types, severity, search])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Alertes actives</CardTitle>
            <CardDescription>
              {filtered.length} alerte{filtered.length > 1 ? "s" : ""} affichée
              {filtered.length > 1 ? "s" : ""} sur {alerts.length} — triées par priorité puis date
            </CardDescription>
          </div>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8 shrink-0 text-xs" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          )}
        </div>

        {/* ---------- Filtres (A.7 : chips par type, sévérité, recherche) ---------- */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ALERT_TYPES.map(t => {
            const Icon = TYPE_ICONS[t]
            const active = types.includes(t)
            return (
              <Button
                key={t}
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-8 gap-1.5 rounded-full px-3 text-xs"
                onClick={() => toggleType(t)}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                {ALERT_TYPE_LABELS[t]}
              </Button>
            )
          })}
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger size="sm" className="w-[150px]" aria-label="Filtrer par sévérité">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes sévérités</SelectItem>
              <SelectItem value="CRITICAL">Critique</SelectItem>
              <SelectItem value="MEDIUM">Moyen</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (titre, enseigne, lieu)…"
              className="h-8 pl-8 text-xs"
              aria-label="Rechercher dans les alertes"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="max-h-[520px] pr-3">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucune alerte ne correspond à ces filtres.
            </p>
          ) : (
            <div className="relative">
              {/* Ligne verticale de la timeline */}
              <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" aria-hidden />
              <ul>
                {filtered.map(a => (
                  <li key={a.id} className="relative pl-7">
                    <span
                      className={cn(
                        "absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-background shadow-sm",
                        SEVERITY_DOT[a.severity] ?? "bg-slate-400"
                      )}
                      aria-hidden
                    />
                    <div className="pb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={a.severity} />
                        <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                          {ALERT_TYPE_LABELS[a.type] ?? String(a.type)}
                        </Badge>
                        {isFresh(a.date) && (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 bg-emerald-50 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                          >
                            Nouveau
                          </Badge>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground" title={dateFr(a.date)}>
                          {relativeDate(a.date)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold leading-snug">{a.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {a.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {a.brand && (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: brandColors[a.brand] ?? NEUTRAL_DOT }}
                              aria-hidden
                            />
                            {a.brand}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {a.gouvernorat}
                        </span>
                        <ImpactBadge impact={a.impact} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
