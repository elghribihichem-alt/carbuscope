'use client'

// T55-B2 — Détail d'une zone du Radar (Sheet droit), extrait de radar-zones
// pour être réutilisé partout : carte des zones, Top 50 du scoring (drill-down
// délégations), alertes. Un slot `actions` permet à chaque appelant d'ajouter
// ses CTA (formats recommandés, simulation de rentabilité…) sans dupliquer
// le corps du drawer (5 critères, délégations, foncier, PPA, lecture générée).

import { motion } from "framer-motion"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  PalierBadge, ScoreBar, PALIER_META,
} from "@/components/implantation/implantation-shared"
import type { PalierKey } from "@/components/implantation/implantation-shared"
import { num } from "@/lib/chart"
import { TriangleAlert } from "lucide-react"
import type { RadarZoneDTO } from "@/lib/radar-scoring"

export function ZoneDetailSheet({
  zone, onClose, actions, rank,
}: {
  zone: RadarZoneDTO | null
  onClose: () => void
  /** CTA contextuels (formats, simulations…) rendus sous la lecture générée. */
  actions?: React.ReactNode
  /** Rang dans le classement (Top 50) — badge discret optionnel. */
  rank?: number
}) {
  const maxDelegStations = zone ? Math.max(1, ...zone.delegations.map(d => d.stations)) : 1
  return (
    <Sheet open={zone !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {zone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base">
                {rank !== undefined && (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-1.5 text-xs font-bold tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {rank}
                  </span>
                )}
                {zone.gouvernorat}
                <PalierBadge palier={zone.palier as PalierKey} />
              </SheetTitle>
              <SheetDescription>
                {num(zone.stationsTotal)} stations en service · {num(zone.delegations.length)} délégations couvertes
                {zone.delegationWithoutStation > 0 && ` · ${zone.delegationWithoutStation} sans station`}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              {/* Score global + 5 critères */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Score d&apos;opportunité</p>
                  <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{zone.score}<span className="text-sm text-muted-foreground">/100</span></p>
                </div>
                <div className="mt-2"><ScoreBar value={zone.score} color="#059669" className="h-2" /></div>
                <ul className="mt-3 space-y-1.5">
                  {[
                    ["Parc automobile", zone.components.parc],
                    ["Pouvoir d'achat", zone.components.ppa],
                    ["Trafic routier", zone.components.traffic],
                    ["Concurrence", zone.components.compet],
                    ["Foncier", zone.components.land],
                  ].map(([label, v]) => (
                    <li key={label as string} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                      <ScoreBar value={v as number} color="#10b981" className="h-1.5 flex-1" />
                      <span className="w-8 text-right tabular-nums font-medium">{v as number}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Alerte active */}
              {zone.alert && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Alerte — score {zone.alert.score}/100 (seuil {zone.alert.threshold})
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">{zone.alert.detail}</p>
                </div>
              )}

              {/* KPIs du gouvernorat */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Parc", value: num(zone.vehicles) },
                  { label: "Population", value: num(zone.population) },
                  { label: "Ratio", value: num(zone.ratio) },
                  { label: "TMJ", value: zone.tmj > 0 ? num(zone.tmj) : "—" },
                  { label: "PPA", value: `${zone.ppaIndex}${zone.ppaEstimated ? " est." : ""}` },
                  { label: "Foncier", value: `${num(zone.landPriceDt)} DT/m²${zone.landEstimated ? " est." : ""}` },
                ].map(k => (
                  <div key={k.label} className="rounded-lg border p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Présence des enseignes */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Répartition des enseignes</p>
                <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label={`Répartition des ${zone.stationsTotal} stations par enseigne`}>
                  {zone.stationsByBrand.map(b => (
                    <span key={b.slug} style={{ backgroundColor: b.color, width: `${(b.count / Math.max(1, zone.stationsTotal)) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-2 space-y-1">
                  {zone.stationsByBrand.slice(0, 6).map(b => (
                    <li key={b.slug} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      <span className="tabular-nums text-muted-foreground">{num(b.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Délégations — barres proportionnelles (perfectionnement B1) */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Délégations ({zone.delegations.length} couvertes)
                </p>
                {zone.delegationWithoutStation > 0 && (
                  <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                    {zone.delegationWithoutStation} délégation{zone.delegationWithoutStation > 1 ? "s" : ""} sans station
                    en service — poches blanches à instruire en priorité.
                  </p>
                )}
                <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {zone.delegations.map(d => (
                    <li key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate" title={d.name}>{d.name}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-emerald-500"
                          style={{ width: `${(d.stations / maxDelegStations) * 100}%` }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{num(d.stations)} stat.</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lecture générée */}
              <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                Lecture d&apos;implantation : {PALIER_META[zone.palier as PalierKey].description.toLowerCase()} Zone
                {zone.myBrandStations === 0 ? " vierge de votre enseigne — priorité d'étude" : ` couverte à ${zone.myBrandSharePct} % par votre réseau`}
                {zone.tmj > 0 ? ` · trafic journalier cumulé de ${num(zone.tmj)} véhicules` : " · hors axes majeurs recensés"}.
              </p>

              {/* CTA contextuels (B2 — drill-down Top 50 → formats / simulations) */}
              {actions && <div className="space-y-2">{actions}</div>}
            </div>
          </motion.div>
        )}
      </SheetContent>
    </Sheet>
  )
}
