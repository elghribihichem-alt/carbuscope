'use client'

// T55-C-b — Hubs > Paramètres TMP › « tarifs ». ① Grille de référence
// nationale (GET /api/hubs/services — 3 HubService, lecture seule ici :
// l'édition est en console Super Admin). ② Tarifs PRATIQUÉS par hub du
// périmètre : CA moyen par intervention mesuré depuis les KPIs réels
// (/api/hubs via useHubs) et comparé à la référence nationale — statut
// dans la norme ±15 % (émeraude) / au-dessus (ambre) / en dessous (stone).
// Aucune donnée inventée : chaque valeur est une mesure du registre.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, Fuel, Lock, SlidersHorizontal, Tag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataViews } from "@/components/ui/data-views"
import type { DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { ErrorState } from "@/components/shell/loading"
import { SectionHeader } from "@/components/radar/radar-shared"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { useHubs, HubStatusBadge } from "./hubs-shared"

// ---------- DTO / hook locaux (hubs-shared.tsx est figé) ----------

interface ServiceDTO {
  type: string
  label: string
  basePriceDt: number
  durationMin: number
}

function useServicesGrid() {
  const [services, setServices] = useState<ServiceDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  useEffect(() => {
    let alive = true
    fetch("/api/hubs/services")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { services: ServiceDTO[] }) => { if (alive) { setServices(d.services); setError(null) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [reloadKey])
  return { services, error, reload }
}

// ---------- Métadonnées d'affichage de la grille ----------

const SERVICE_META: Record<string, { icon: typeof Fuel; badge: string; hint: string }> = {
  VIDANGE: {
    icon: Fuel,
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    hint: "tarif affiché en vitrine des TMP — base huile + filtre",
  },
  PNEUS: {
    icon: Tag,
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    hint: "vente & montage — le pneu, hors équilibrage optionnel",
  },
  DIAGNOSTIC: {
    icon: Bot,
    badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    hint: "lecture électronique complète + compte rendu client",
  },
}

// Statut d'écart au tarif de référence (±15 %).
type EcartStatut = "NORME" | "AU_DESSUS" | "EN_DESSOUS" | "NON_MESURABLE"

const ECART_META: Record<EcartStatut, { label: string; badge: string; tone: string }> = {
  NORME: {
    label: "Dans la norme",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  AU_DESSUS: {
    label: "Au-dessus",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    tone: "text-amber-600 dark:text-amber-400",
  },
  EN_DESSOUS: {
    label: "En dessous",
    badge: "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
    tone: "text-stone-600 dark:text-stone-400",
  },
  NON_MESURABLE: {
    label: "Non mesurable",
    badge: "border-stone-300 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400",
    tone: "text-muted-foreground",
  },
}

interface HubTarifRow {
  id: string
  code: string
  name: string
  gouvernorat: string
  status: string
  interventions: number
  caMoyen: number | null
  ecartPct: number | null
  statut: EcartStatut
}

const money = (v: number) => `${num(v)} DT`

export function HubsParametresTarifs() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const { services, error: servicesError, reload: reloadServices } = useServicesGrid()
  const { data: hubsData, error: hubsError, reload: reloadHubs } = useHubs(brandSlug)

  // Référence nationale = moyenne simple des 3 tarifs de la grille (formule
  // affichée à l'utilisateur — le CA moyen/intervention mélange les 3 services).
  const reference = useMemo(
    () => (services && services.length ? services.reduce((s, x) => s + x.basePriceDt, 0) / services.length : null),
    [services],
  )

  const rows = useMemo<HubTarifRow[]>(() => {
    if (!hubsData || reference === null) return []
    return hubsData.hubs.map(h => {
      const caMoyen = h.kpis.interventions > 0 ? Math.round(h.kpis.caTotal / h.kpis.interventions) : null
      let statut: EcartStatut = "NON_MESURABLE"
      let ecartPct: number | null = null
      if (caMoyen !== null && reference > 0) {
        ecartPct = Math.round(((caMoyen - reference) / reference) * 1000) / 10
        statut = Math.abs(ecartPct) <= 15 ? "NORME" : ecartPct > 0 ? "AU_DESSUS" : "EN_DESSOUS"
      }
      return {
        id: h.id,
        code: h.code,
        name: h.name,
        gouvernorat: h.gouvernorat,
        status: h.status,
        interventions: h.kpis.interventions,
        caMoyen,
        ecartPct,
        statut,
      }
    })
  }, [hubsData, reference])

  const mesurables = rows.filter(r => r.statut !== "NON_MESURABLE")
  const dansNorme = mesurables.filter(r => r.statut === "NORME").length

  const columns = useMemo<DataViewColumn<HubTarifRow>[]>(() => [
    {
      key: "hub",
      header: "TMP",
      sortValue: r => r.code,
      render: r => (
        <div className="min-w-0">
          <p className="font-medium tabular-nums">{r.code}</p>
          <p className="truncate text-xs text-muted-foreground">{r.name} · {r.gouvernorat}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Statut",
      sortValue: r => r.status,
      render: r => <HubStatusBadge status={r.status} />,
      hideInCards: true,
    },
    {
      key: "interventions",
      header: "Interventions",
      align: "right",
      sortValue: r => r.interventions,
      render: r => <span className="tabular-nums">{num(r.interventions)}</span>,
    },
    {
      key: "caMoyen",
      header: "CA moyen / intervention",
      align: "right",
      sortValue: r => r.caMoyen ?? -1,
      render: r => (
        <span className="tabular-nums font-semibold">{r.caMoyen !== null ? money(r.caMoyen) : "—"}</span>
      ),
    },
    {
      key: "ecart",
      header: "Écart à la référence",
      align: "right",
      sortValue: r => r.ecartPct ?? -999,
      render: r => (
        <span className={`tabular-nums font-semibold ${ECART_META[r.statut].tone}`}>
          {r.ecartPct !== null ? `${r.ecartPct > 0 ? "+" : ""}${r.ecartPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}
        </span>
      ),
    },
    {
      key: "lecture",
      header: "Lecture",
      render: r => <Badge variant="outline" className={ECART_META[r.statut].badge}>{ECART_META[r.statut].label}</Badge>,
    },
  ], [])

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Tarification des services TMP"
        description="Grille de référence nationale des 3 services (vidange express, pneus, diagnostic) et écart MESURÉ de chaque micro-hub : le CA moyen par intervention, calculé sur le registre réel, situe les pratiques locales par rapport à la référence."
        icon={SlidersHorizontal}
        badge={reference !== null ? `référence ≈ ${Math.round(reference)} DT` : undefined}
      />

      {/* ① Grille de référence nationale */}
      {servicesError && !services ? (
        <ErrorState message={`Grille nationale indisponible (${servicesError}).`} retry={reloadServices} />
      ) : !services ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {services.map(s => {
            const meta = SERVICE_META[s.type] ?? SERVICE_META.DIAGNOSTIC
            const Icon = meta.icon
            return (
              <Card key={s.type} className="gap-0">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={s.label}>{s.label}</span>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1.5">
                    <Badge variant="outline" className={meta.badge}>{s.type}</Badge>
                    grille nationale
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Tarif de référence</span>
                    <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {s.basePriceDt.toLocaleString("fr-FR")} <span className="text-xs font-medium text-muted-foreground">DT</span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Durée indicative</span>
                    <span className="tabular-nums text-sm font-semibold">{s.durationMin} min</span>
                  </div>
                  <p className="border-t pt-2 text-[11px] leading-snug text-muted-foreground">{meta.hint}</p>
                </CardContent>
              </Card>
            )
          })}
          <p className="col-span-full flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground sm:col-span-3">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Grille nationale — édition console Super Admin (volet « Radar &amp; Hubs › Grille tarifaire TMP », compte
            racine, chaque modification auditée). Les nouvelles interventions des TMP partent de cette référence&nbsp;;
            les sur-tarifs locaux négociés par le franchisé restent en lecture seule côté enseigne (V1).
          </p>
        </div>
      )}

      {/* ② Tarifs pratiqués par hub — mesure réelle */}
      {hubsError && !hubsData ? (
        <ErrorState message={`Réseau TMP indisponible (${hubsError}).`} retry={reloadHubs} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Référence nationale"
              value={reference !== null ? money(Math.round(reference)) : "—"}
              sub="moyenne des 3 tarifs de la grille"
              icon={SlidersHorizontal}
              tone="success"
            />
            <KpiCard label="TMP mesurés" value={num(mesurables.length)} sub="hubs avec au moins 1 intervention" icon={Tag} />
            <KpiCard
              label="Dans la norme (±15 %)"
              value={num(dansNorme)}
              sub={mesurables.length ? `${Math.round((dansNorme / mesurables.length) * 100)} % des TMP mesurés` : "aucune mesure"}
              icon={Bot}
              tone={dansNorme === mesurables.length && mesurables.length > 0 ? "success" : "default"}
            />
            <KpiCard
              label="Hubs du périmètre"
              value={hubsData ? num(hubsData.aggregate.hubs) : "…"}
              sub={hubsData ? `${num(hubsData.aggregate.active)} actifs · ${num(hubsData.aggregate.interventions)} interventions` : "chargement"}
              icon={Fuel}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tarifs pratiqués par micro-hub</CardTitle>
              <CardDescription>
                CA total ÷ nombre d&apos;interventions du hub (registre réel) comparé à la référence nationale —
                écart exprimé en % du tarif de référence.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pb-3">
              <DataViews
                columns={columns}
                rows={rows}
                rowKey={r => r.id}
                viewKey="hubs-parametres-tarifs"
                maxHeightClassName="max-h-96"
                emptyMessage="Aucun micro-hub dans le périmètre — la mesure s'affichera dès la première intervention enregistrée."
              />
              <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                Lecture : « au-dessus » traduit un panier moyen plus riche (gammes hautes, prestations
                complémentaires négociées localement par le franchisé — V1 lecture seule) ; « en dessous » un
                positionnement économique. Hubs sans intervention : mesure non calculable. Formule de référence :
                moyenne simple des 3 tarifs nationaux
                {reference !== null ? ` (${services?.map(s => s.basePriceDt.toLocaleString("fr-FR")).join(" + ")}) ÷ 3 ≈ ${Math.round(reference)} DT` : ""}.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
