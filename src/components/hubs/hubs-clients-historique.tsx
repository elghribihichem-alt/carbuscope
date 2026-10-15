'use client'

// T55-C-a — Hubs > Clients > « historique » : timeline verticale d'un
// véhicule (fuseau unique fusionnant interventions et conversions — la plus
// récente en tête). Sélecteur combobox (recherche plaque/marque), défaut =
// véhicule le plus récemment revenu ; navigation précédent/suivant entre
// véhicules du périmètre filtré. Icônes : VIDANGE=Fuel, PNEUS=CircleDot,
// DIAGNOSTIC=Bot, conversions=ArrowRight + badge statut.
// Pattern timeline B3-a (radar-formats-plan) : rail vertical, pastille
// numérotée par événement, carte au survol.

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { ArrowRight, Award, Bot, CalendarClock, Car, ChevronLeft, ChevronRight, CircleDot, Fuel, History, Wrench } from "lucide-react"
import { useHubs } from "./hubs-shared"
import { SectionHeader } from "@/components/radar/radar-shared"
import {
  CONVERSION_STATUS_META, dateFr, fidelityTier, money, relativeDate, SERVICE_META, useVehicles, useVehicleDetail,
} from "./hubs-clients-shared"

type TimelineEvent =
  | { kind: "intervention"; id: string; date: string; serviceType: string; detail: string | null; priceDt: number; durationMin: number | null }
  | { kind: "conversion"; id: string; date: string; status: string; detail: string; stationCode: string | null; valueDt: number }

export function HubsClientsHistorique() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [hubId, setHubId] = useState<string | null>(null)
  const [comboOpen, setComboOpen] = useState(false)
  const [vehicleId, setVehicleId] = useState<string | null>(null)

  // Liste des véhicules du périmètre (tri dernière visite desc) — le défaut
  // « le plus récent » est la première ligne ; navigation prev/next dedans.
  const { data, error, reload } = useVehicles({ brand: brandSlug, hubId })
  const { data: hubsData } = useHubs(brandSlug)

  const vehicles = useMemo(() => data?.vehicles ?? [], [data])
  // Dérivation : véhicule explicite, sinon le plus récent du périmètre
  // (première ligne — tri dernière visite desc) ; index résolu ≥ 0.
  const resolvedIndex = vehicleId ? vehicles.findIndex(v => v.id === vehicleId) : 0
  const currentIndex = resolvedIndex >= 0 ? resolvedIndex : 0
  const effective = vehicles[currentIndex] ?? null
  // La fiche détaillée suit le véhicule EFFECTIF (défaut compris).
  const detail = useVehicleDetail(effective?.id ?? null)

  // Fuseau unique : interventions + conversions du véhicule, tri desc.
  const events = useMemo<TimelineEvent[]>(() => {
    const v = detail?.vehicle
    if (!v) return []
    const merged: TimelineEvent[] = [
      ...v.interventions.map(i => ({
        kind: "intervention" as const, id: i.id, date: i.createdAt, serviceType: i.serviceType,
        detail: i.detail, priceDt: i.priceDt, durationMin: i.durationMin,
      })),
      ...v.conversions.map(c => ({
        kind: "conversion" as const, id: c.id, date: c.createdAt, status: c.status,
        detail: c.detail, stationCode: c.stationCode, valueDt: c.valueDt,
      })),
    ]
    return merged.sort((a, b) => b.date.localeCompare(a.date))
  }, [detail])

  const goPrev = () => {
    if (currentIndex > 0) setVehicleId(vehicles[currentIndex - 1].id)
  }
  const goNext = () => {
    if (currentIndex < vehicles.length - 1) setVehicleId(vehicles[currentIndex + 1].id)
  }

  if (error && !data) return <div className="p-1"><ErrorState message={`Historique indisponible (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title="Chargement de la base clients…" />

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Historique par véhicule"
        description="La relation complète du TMP avec un client : chaque intervention (vidange, pneus, diagnostic) et chaque orientation vers une station, sur un seul fuseau chronologique."
        icon={History}
        badge="Historique réel"
      />

      {/* Sélection du véhicule : combobox + filtre hub + navigation */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button" variant="outline"
                className="min-h-11 w-full justify-start gap-2 font-normal xl:w-80"
                aria-label="Choisir un véhicule dans l'historique"
              >
                <Car className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {effective ? (
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-semibold tabular-nums">{effective.plate}</span>
                    <span className="ml-1.5 text-muted-foreground">{effective.brand}{effective.model ? ` ${effective.model}` : ""}</span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Aucun véhicule…</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder="Rechercher une plaque, une marque…" className="min-h-11" />
                <CommandList>
                  <CommandEmpty>Aucun véhicule trouvé.</CommandEmpty>
                  <CommandGroup>
                    {vehicles.slice(0, 200).map(v => (
                      <CommandItem
                        key={v.id}
                        value={`${v.plate} ${v.brand} ${v.model ?? ""}`}
                        onSelect={() => { setVehicleId(v.id); setComboOpen(false) }}
                        className="min-h-11"
                      >
                        <span className="font-semibold tabular-nums">{v.plate}</span>
                        <span className="ml-1.5 truncate text-muted-foreground">
                          {v.brand}{v.model ? ` ${v.model}` : ""} · {v.hub.code}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={hubId ?? "all"} onValueChange={v => { setVehicleId(null); setHubId(v === "all" ? null : v) }}>
            <SelectTrigger className="min-h-11 w-full xl:w-64" aria-label="Filtrer le périmètre par micro-hub">
              <SelectValue placeholder="Tous les TMP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-11">Tous les TMP ({num(hubsData?.hubs.length ?? 0)})</SelectItem>
              {hubsData?.hubs.map(h => (
                <SelectItem key={h.id} value={h.id} className="min-h-11">
                  {h.code} — {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 xl:ml-auto">
            <Button
              type="button" variant="outline" size="icon" className="min-h-11 w-11"
              onClick={goPrev} disabled={currentIndex <= 0}
              aria-label="Véhicule précédent du périmètre"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">
              {vehicles.length > 0 ? `${currentIndex + 1} / ${num(vehicles.length)}` : `— / ${num(vehicles.length)}`}
            </span>
            <Button
              type="button" variant="outline" size="icon" className="min-h-11 w-11"
              onClick={goNext} disabled={currentIndex >= vehicles.length - 1}
              aria-label="Véhicule suivant du périmètre"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Résumé du véhicule sélectionné */}
      {effective && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
          {[
            { label: "Kilométrage", value: `${num(effective.km)} km`, icon: Car },
            { label: "Dernière visite", value: effective.lastVisit ? relativeDate(effective.lastVisit) : "jamais", icon: CalendarClock },
            { label: "Interventions", value: num(detail?.vehicle.stats.servicesCount ?? effective.interventionCount), icon: Wrench },
            { label: "Conversions", value: num(detail?.vehicle.stats.conversionsCount ?? effective.conversionsCount), icon: ArrowRight },
            { label: "Fidélité", value: `${num(effective.loyaltyPoints)} pts`, icon: Award, sub: fidelityTier(effective.loyaltyPoints).label },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="flex items-start gap-2.5 p-3">
                <k.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="text-sm font-bold tabular-nums leading-tight">{k.value}</p>
                  {k.sub && <p className="text-[10px] text-muted-foreground">{k.sub}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Timeline fusionnée */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Fuseau chronologique{effective ? ` — ${effective.plate}` : ""}
          </CardTitle>
          <CardDescription>
            {events.length > 0
              ? `${num(events.length)} événements (interventions + orientations station), du plus récent au plus ancien.`
              : "Aucun événement enregistré pour ce véhicule."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!detail || events.length === 0 ? (
            <div className="space-y-2 py-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : (
            <ol className="space-y-3">
              {events.map((ev, idx) => {
                const isIntervention = ev.kind === "intervention"
                const sm = isIntervention
                  ? SERVICE_META[(ev as Extract<TimelineEvent, { kind: "intervention" }>).serviceType as keyof typeof SERVICE_META] ?? SERVICE_META.DIAGNOSTIC
                  : null
                const Icon = sm ? sm.icon : ArrowRight
                const last = idx === events.length - 1
                return (
                  <li key={`${ev.kind}-${ev.id}`} className="relative pl-12 sm:pl-14">
                    {/* Rail vertical (sauf dernier événement) — pattern B3-a */}
                    {!last && (
                      <span className="absolute left-[17px] top-12 h-[calc(100%-2.25rem)] w-0.5 bg-border" aria-hidden />
                    )}
                    <span className={`absolute left-0 top-1 flex h-9 w-9 items-center justify-center rounded-full border ${sm ? sm.badge : "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400"}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold">
                          {isIntervention ? sm?.label : "Orientation station"}
                        </p>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {dateFr(ev.date)} · {relativeDate(ev.date)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {isIntervention ? (
                          <>
                            <span>{(ev as Extract<TimelineEvent, { kind: "intervention" }>).detail ?? "—"}</span>
                            <span className="font-semibold tabular-nums text-foreground">
                              {money((ev as Extract<TimelineEvent, { kind: "intervention" }>).priceDt)}
                            </span>
                            {(ev as Extract<TimelineEvent, { kind: "intervention" }>).durationMin != null && (
                              <span className="tabular-nums">
                                · {(ev as Extract<TimelineEvent, { kind: "intervention" }>).durationMin} min
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span>{(ev as Extract<TimelineEvent, { kind: "conversion" }>).detail}</span>
                            {(ev as Extract<TimelineEvent, { kind: "conversion" }>).stationCode && (
                              <span className="tabular-nums">→ station {(ev as Extract<TimelineEvent, { kind: "conversion" }>).stationCode}</span>
                            )}
                            {(ev as Extract<TimelineEvent, { kind: "conversion" }>).valueDt > 0 && (
                              <span className="font-semibold tabular-nums text-foreground">
                                {money((ev as Extract<TimelineEvent, { kind: "conversion" }>).valueDt)}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {!isIntervention && (
                        <div className="mt-1.5">
                          <Badge variant="outline" className={CONVERSION_STATUS_META[(ev as Extract<TimelineEvent, { kind: "conversion" }>).status as keyof typeof CONVERSION_STATUS_META]?.badge ?? ""}>
                            {CONVERSION_STATUS_META[(ev as Extract<TimelineEvent, { kind: "conversion" }>).status as keyof typeof CONVERSION_STATUS_META]?.label ?? (ev as Extract<TimelineEvent, { kind: "conversion" }>).status}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {detail && events.length > 0 && (
            <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
              Icônes du fuseau : <Fuel className="inline h-3 w-3" aria-hidden /> vidange ·{" "}
              <CircleDot className="inline h-3 w-3" aria-hidden /> pneus ·{" "}
              <Bot className="inline h-3 w-3" aria-hidden /> diagnostic ·{" "}
              <ArrowRight className="inline h-3 w-3" aria-hidden /> orientation station — événements réels du
              registre (aucune reconstruction).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
