'use client'

// T55-C-a — Hubs > Clients > « alertes » : les véhicules à rappeler — vidange
// due (dérivation : dernière visite > 180 j, dernière vidange > 180 j, ou
// > 15 000 km sans aucune vidange) et fidélité Or à échanger (≥ 180 points).
// Cartes cliquables → fiche véhicule complète (Sheet). Mention honnête sur
// les seuils V1 (6 mois / 180 j / 10 000 km) : l'alerte est une dérivation
// documentée du registre, pas une donnée saisie.

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { Award, Car, Fuel, Info, TriangleAlert, Wrench } from "lucide-react"
import { SectionHeader } from "@/components/radar/radar-shared"
import { relativeDate, useVehicles, VehicleDetailSheet, type VehicleRow } from "./hubs-clients-shared"

type AlertFilter = "all" | "VIDANGE_DUE" | "LOYALTY_NEAR"

export function HubsClientsAlertes() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [filter, setFilter] = useState<AlertFilter>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, error, reload } = useVehicles({ brand: brandSlug, alertes: true })

  const rows = useMemo(() => {
    if (!data) return []
    return filter === "all" ? data.vehicles : data.vehicles.filter(v => v.alert?.type === filter)
  }, [data, filter])

  if (error && !data) return <div className="p-1"><ErrorState message={`Alertes clients indisponibles (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title="Calcul des alertes d'entretien…" />

  const vidangeDue = data.vehicles.filter(v => v.alert?.type === "VIDANGE_DUE")
  const loyaltyNear = data.vehicles.filter(v => v.alert?.type === "LOYALTY_NEAR")
  const m = { ...data.meta, vidangeDue: data.meta.alerts.vidangeDue, loyaltyNear: data.meta.alerts.loyaltyNear }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Alertes clients — véhicules à rappeler"
        description="Les véhicules du périmètre dont l'entretien est dépassé ou la récompense fidélité atteinte : un moteur de relance honnête, dérivé du registre réel des passages."
        icon={TriangleAlert}
        badge={`${num(m.total)} alertes`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Alertes ouvertes" value={num(m.total)} sub="véhicules à relancer dans le périmètre" icon={TriangleAlert} tone="warning" />
        <KpiCard label="Vidanges dues" value={num(m.vidangeDue)} sub="dernière vidange > 180 j ou > 15 000 km sans vidange" icon={Fuel} tone="danger" />
        <KpiCard label="Fidélité à échanger" value={num(m.loyaltyNear)} sub="≥ 180 points — statut Or, récompense atteinte" icon={Award} tone="success" />
      </div>

      {/* Bandeau d'honnêteté : seuils V1 */}
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <strong>Dérivation V1 documentée</strong> — seuils : rappel d&apos;entretien à 6 mois, vidange due au-delà de
            180 jours ou 15 000 km parcourus sans vidange (le kilométrage au moment de la dernière vidange n&apos;étant
            pas historisé, l&apos;intervalle exact ne peut pas être reconstitué) ; fidélité Or dès 180 points. Ces
            alertes sont calculées depuis le registre réel des interventions — aucune saisie manuelle.
          </p>
        </CardContent>
      </Card>

      {/* Filtres par type d'alerte */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par type d'alerte">
        {([
          { key: "all" as const, label: `Toutes (${num(m.total)})` },
          { key: "VIDANGE_DUE" as const, label: `Vidanges dues (${num(m.vidangeDue)})` },
          { key: "LOYALTY_NEAR" as const, label: `Fidélité Or (${num(m.loyaltyNear)})` },
        ]).map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${filter === f.key ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300" : "border-border bg-background hover:bg-muted"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste des véhicules en alerte */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Car className="h-8 w-8 text-emerald-500" aria-hidden />
            <p className="text-sm font-medium">Aucun véhicule en alerte pour ce filtre</p>
            <p className="text-xs text-muted-foreground">Le parc du périmètre est à jour sur les seuils V1.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(v => <AlertVehicleCard key={v.id} vehicle={v} onClick={() => setSelectedId(v.id)} />)}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Priorité de relance conseillée : vidanges dues « jamais revenu » (client perdu de vue) avant les fidélités Or
        (opportunité commerciale positive).
      </p>

      {/* Fiche véhicule complète */}
      <VehicleDetailSheet vehicleId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}

/* ---------------- Carte véhicule en alerte (cliquable → fiche) ---------------- */
function AlertVehicleCard({ vehicle, onClick }: { vehicle: VehicleRow; onClick: () => void }) {
  const isVidange = vehicle.alert?.type === "VIDANGE_DUE"
  const since = vehicle.alert?.sinceDays
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onClick}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0">
            <span className="font-bold tabular-nums">{vehicle.plate}</span>
            <span className="ml-1.5 truncate font-medium text-muted-foreground">{vehicle.brand}{vehicle.model ? ` ${vehicle.model}` : ""}</span>
          </span>
          {isVidange ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
              Vidange due{since != null ? ` · depuis ${num(since)} j` : ""}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              Fidélité Or · {num(vehicle.loyaltyPoints)} pts
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tabular-nums">{num(vehicle.km)} km</span>·<span>{vehicle.hub.code} — {vehicle.hub.gouvernorat}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {isVidange ? <Fuel className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden /> : <Award className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
          {isVidange
            ? vehicle.alert?.label === "vidange jamais faite"
              ? `Aucune vidange enregistrée malgré ${num(vehicle.km)} km — entretien de base à proposer.`
              : vehicle.lastVisit
                ? `Dernier passage ${relativeDate(vehicle.lastVisit)} — au-delà du seuil de 180 jours.`
                : "Jamais revenu depuis le diagnostic initial — client à reconquérir."
            : `Récompense atteinte : vidange offerte dès 200 pts (catalogue V1) — ${num(200 - vehicle.loyaltyPoints > 0 ? 200 - vehicle.loyaltyPoints : 0)} pts avant la vidange offerte.`}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Wrench className="h-3 w-3 shrink-0" aria-hidden />
          {num(vehicle.interventionCount)} interventions · {num(vehicle.conversionsCount)} conversions enregistrées.
        </p>
        <p className="pt-0.5 text-[11px] text-primary/80">Cliquez pour ouvrir la fiche complète →</p>
      </CardContent>
    </Card>
  )
}
