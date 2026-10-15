'use client'

// T55-C-a — Hubs > Clients > « fidelite » : le programme de fidélité TMP —
// 3 paliers (Membre 0-99, Argent 100-179, Or 180+), récompenses du catalogue
// statique V1 (vidange offerte dès 200 pts, −10 % pneus dès 250 pts —
// documentées, non débitées : le débit de points attend le round de
// caissabilité). Répartition des véhicules par palier (KPIs + barres
// proportionnelles), top 10 fidélité et points cumulés distribués — tout est
// calculé depuis les loyaltyPoints RÉELS de la base clients.

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { Award, Coins, Gift, Info, Medal, Sparkles } from "lucide-react"
import { SectionHeader } from "@/components/radar/radar-shared"
import { FIDELITY_REWARDS, FIDELITY_TIERS, fidelityTier, relativeDate, useVehicles, VehicleDetailSheet } from "./hubs-clients-shared"

export function HubsClientsFidelite() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data, error, reload } = useVehicles({ brand: brandSlug })

  // Répartition par palier + top 10 — dérivées des points réels.
  const dist = useMemo(() => {
    if (!data) return []
    return FIDELITY_TIERS.map(t => ({
      tier: t,
      count: data.vehicles.filter(v => fidelityTier(v.loyaltyPoints).key === t.key).length,
    }))
  }, [data])

  const top10 = useMemo(() => {
    if (!data) return []
    return [...data.vehicles].sort((a, b) => b.loyaltyPoints - a.loyaltyPoints).slice(0, 10)
  }, [data])

  if (error && !data) return <div className="p-1"><ErrorState message={`Programme fidélité indisponible (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title="Chargement du programme de fidélité…" />

  const m = data.meta
  const total = Math.max(1, data.vehicles.length)
  const rewarded = data.vehicles.filter(v => v.loyaltyPoints >= 200).length

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Programme de fidélité TMP"
        description="Chaque prestation encaisse des points sur la carte du client — le mécanisme de rétention des micro-hubs : paliers, récompenses et répartition réelle du parc capté."
        icon={Award}
        badge={`${num(m.loyaltyTotal)} pts distribués`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Points cumulés" value={num(m.loyaltyTotal)} sub="distribués depuis l'ouverture des TMP" icon={Coins} tone="warning" />
        <KpiCard label="Fidélité moyenne" value={`${num(m.loyaltyAvg)} pts`} sub="par véhicule du périmètre" icon={Medal} />
        <KpiCard label="Statut Or" value={num(dist[2]?.count ?? 0)} sub="véhicules à récompense atteinte (≥ 180 pts)" icon={Sparkles} tone="success" />
        <KpiCard label="Éligibles récompense" value={num(rewarded)} sub="≥ 200 pts — vidange offerte mobilisable" icon={Gift} tone="warning" />
      </div>

      {/* Les 3 paliers du programme */}
      <div className="grid gap-4 md:grid-cols-3">
        {dist.map(({ tier, count }) => (
          <Card key={tier.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                  Statut {tier.label}
                </span>
                <Badge variant="outline" className={tier.badge}>
                  {tier.min}{tier.max != null ? `–${tier.max}` : "+"} pts
                </Badge>
              </CardTitle>
              <CardDescription>{tier.perk}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums leading-none">{num(count)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                véhicules · {Math.round((count / total) * 100)} % du parc capté
              </p>
              {/* Barre proportionnelle au volume du palier */}
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${num(count)} véhicules au statut ${tier.label}`}>
                <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${Math.max(2, (count / total) * 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Récompenses échangeables (catalogue statique V1 documenté) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Récompenses échangeables</CardTitle>
          <CardDescription>
            Catalogue V1 statique — les seuils et prestations sont documentés ; le débit de points à l&apos;échange
            attend la caissabilité du TMP (round suivant).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FIDELITY_REWARDS.map(r => {
            const eligible = data.vehicles.filter(v => v.loyaltyPoints >= r.threshold).length
            return (
              <div key={r.threshold} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <Gift className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                    {r.label}
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                      dès {r.threshold} pts
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  <strong className="tabular-nums text-foreground">{num(eligible)}</strong> véhicules éligibles
                </p>
              </div>
            )
          })}
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Honnêteté V1 : les points sont réels (encaissés par intervention), mais aucune récompense n&apos;a encore
            été débitée — le catalogue est donc une offre de référence, pas un historique d&apos;échanges.
          </p>
        </CardContent>
      </Card>

      {/* Top 10 fidélité */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top 10 des clients les plus fidèles</CardTitle>
          <CardDescription>
            Cliquez une ligne pour la fiche complète (historique, conversions, carte) · points réels du registre.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Plaque</TableHead>
                  <TableHead>Client (véhicule)</TableHead>
                  <TableHead>TMP</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Dernière visite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top10.map((v, idx) => {
                  const tier = fidelityTier(v.loyaltyPoints)
                  return (
                    <TableRow key={v.id} className="cursor-pointer" onClick={() => setSelectedId(v.id)}>
                      <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums">{v.plate}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{v.brand}{v.model ? ` ${v.model}` : ""}</p>
                        <p className="text-[11px] text-muted-foreground">{num(v.km)} km · {num(v.interventionCount)} interventions</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{v.hub.code}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{num(v.loyaltyPoints)}</TableCell>
                      <TableCell><Badge variant="outline" className={tier.badge}>{tier.label}</Badge></TableCell>
                      <TableCell className="text-right text-xs">{v.lastVisit ? relativeDate(v.lastVisit) : "—"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fiche véhicule complète */}
      <VehicleDetailSheet vehicleId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
