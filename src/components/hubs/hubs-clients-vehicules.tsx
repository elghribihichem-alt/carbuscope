'use client'

// T55-C-a — Hubs > Clients > « vehicules » : le registre des capteurs du
// parc automobile. KPIs (véhicules, km moyen, fidélité moyenne, alertes
// actives), recherche plaque/marque, filtre hub + chip « avec alertes »,
// table DataViews (plaque, marque/modèle, km, hub, dernière visite, points,
// badge d'alerte) et fiche complète au clic (Sheet partagé : stats, timeline
// interventions, conversions, carte fidélité).

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { Award, Car, Gauge, MapPin, Search, TriangleAlert, Wrench } from "lucide-react"
import { useHubs } from "./hubs-shared"
import { SectionHeader } from "@/components/radar/radar-shared"
import {
  fidelityTier, relativeDate, useVehicles, VehicleAlertBadge, VehicleDetailSheet, FIDELITY_TIERS,
} from "./hubs-clients-shared"

export function HubsClientsVehicules() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [hubId, setHubId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [alertesOnly, setAlertesOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // La recherche plaque/marque passe au serveur (SQL contains) ; le chip
  // « avec alertes » active le filtre de dérivation côté serveur.
  const { data, error, reload } = useVehicles({ brand: brandSlug, hubId, q: search.trim() || undefined, alertes: alertesOnly })
  const { data: hubsData } = useHubs(brandSlug)

  const rows = useMemo(() => data?.vehicles ?? [], [data])

  if (error && !data) return <div className="p-1"><ErrorState message={`Base clients indisponible (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title="Chargement de la base clients TMP…" />

  const m = data.meta

  const columns: DataViewColumn<(typeof rows)[number]>[] = [
    {
      key: "plate", header: "Plaque", sortValue: v => v.plate,
      render: v => (
        <div className="min-w-0">
          <p className="font-semibold tabular-nums">{v.plate}</p>
          <p className="text-[11px] text-muted-foreground">{num(v.interventionCount)} interventions · {num(v.conversionsCount)} conversions</p>
        </div>
      ),
    },
    {
      key: "brand", header: "Marque / modèle", sortValue: v => v.brand,
      render: v => (
        <div className="min-w-0">
          <p className="text-sm font-medium">{v.brand}</p>
          <p className="truncate text-[11px] text-muted-foreground">{v.model ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "km", header: "Km", align: "right", sortValue: v => v.km, hideInCards: true,
      render: v => <span className="whitespace-nowrap text-sm tabular-nums">{num(v.km)}</span>,
    },
    {
      key: "hub", header: "Hub", sortValue: v => v.hub.code,
      render: v => (
        <div className="min-w-0">
          <p className="text-xs font-medium tabular-nums">{v.hub.code}</p>
          <p className="truncate text-[11px] text-muted-foreground">{v.hub.gouvernorat}</p>
        </div>
      ),
    },
    {
      key: "lastVisit", header: "Dernière visite", sortValue: v => v.lastVisit ?? "",
      render: v => <span className="whitespace-nowrap text-xs">{v.lastVisit ? relativeDate(v.lastVisit) : "jamais revenu"}</span>,
    },
    {
      key: "loyalty", header: "Fidélité", sortValue: v => v.loyaltyPoints, hideInCards: true,
      render: v => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm tabular-nums">
          {num(v.loyaltyPoints)}
          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${fidelityTier(v.loyaltyPoints).badge}`}>
            {fidelityTier(v.loyaltyPoints).label}
          </Badge>
        </span>
      ),
    },
    {
      key: "alert", header: "Alerte", sortValue: v => v.alert?.type ?? "",
      render: v => <VehicleAlertBadge alert={v.alert} />,
    },
  ]

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Véhicules clients — les capteurs du parc"
        description="Chaque véhicule passé en caisse TMP : immatriculation, marque, kilométrage, hub de rattachement et fidélité — la base capte l'usure du parc automobile pour la boucle de conversion."
        icon={Car}
        badge={`${num(m.total)} véhicules`}
      />

      {/* KPIs de la base filtrée */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Véhicules" value={num(m.total)} sub="dans le périmètre filtré" icon={Car} />
        <KpiCard label="Km moyen" value={`${num(m.kmAvg)} km`} sub="kilométrage moyen du parc capté" icon={Gauge} />
        <KpiCard label="Fidélité moyenne" value={`${num(m.loyaltyAvg)} pts`} sub={`${num(m.loyaltyTotal)} points distribués au total`} icon={Award} tone="warning" />
        <KpiCard label="Alertes actives" value={num(m.alerts.total)} sub={`${m.alerts.vidangeDue} vidanges dues · ${m.alerts.loyaltyNear} fidélités Or`} icon={TriangleAlert} tone="danger" />
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={hubId ?? "all"} onValueChange={v => setHubId(v === "all" ? null : v)}>
              <SelectTrigger className="min-h-11 w-full sm:w-64" aria-label="Filtrer par micro-hub">
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
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher (plaque, marque)…"
                className="min-h-11 pl-9"
                aria-label="Recherche dans la base clients"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAlertesOnly(a => !a)}
            role="switch"
            aria-checked={alertesOnly}
            className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${alertesOnly ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" : "border-border bg-background hover:bg-muted"}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              Avec alertes ({num(m.alerts.total)})
            </span>
          </button>
        </CardContent>
      </Card>

      {/* Registre des véhicules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Registre des véhicules</CardTitle>
          <CardDescription>
            Cliquez une ligne pour la fiche complète (dépenses, visites, timeline des interventions, conversions,
            carte fidélité) · 3 modes d&apos;affichage · tri libre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="hubs-clients-vehicules"
            columns={columns}
            rows={rows}
            rowKey={v => v.id}
            onRowClick={v => setSelectedId(v.id)}
            emptyMessage="Aucun véhicule ne correspond aux filtres."
            maxHeightClassName="max-h-[26rem]"
            renderCard={v => (
              <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setSelectedId(v.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold tabular-nums">{v.plate}</p>
                      <p className="text-[11px] text-muted-foreground">{v.brand}{v.model ? ` ${v.model}` : ""} · {num(v.km)} km</p>
                    </div>
                    <VehicleAlertBadge alert={v.alert} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden /> {v.hub.code}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Wrench className="h-3 w-3" aria-hidden /> {num(v.interventionCount)} interventions
                    </span>
                    <span className="tabular-nums">{num(v.loyaltyPoints)} pts · {fidelityTier(v.loyaltyPoints).label}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Dernière visite : {v.lastVisit ? relativeDate(v.lastVisit) : "jamais revenu"}
                  </p>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>

      {/* Légende des paliers fidélité */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        Paliers fidélité :
        {FIDELITY_TIERS.map(t => (
          <Badge key={t.key} variant="outline" className={t.badge}>{t.label} {t.min}{t.max != null ? `–${t.max}` : "+"} pts</Badge>
        ))}
        · alertes V1 : 180 j / 15 000 km sans vidange / 180 pts.
      </p>

      {/* Fiche véhicule complète */}
      <VehicleDetailSheet vehicleId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
