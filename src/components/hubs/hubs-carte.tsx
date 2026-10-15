'use client'

// T55 — Hubs > Carte des TMP : le réseau des micro-hubs sur la mini-carte
// nationale. 4 sous-onglets (clé nav « hubs-carte ») :
//   nationale (carte + KPIs + fiche par clic) · enseigne (répartition par
//   réseau) · performance (classement CA/ROI) · pipeline (constructions &
//   projets + candidats franchise en attente). Fiche détaillée : Sheet droit
//   alimenté par /api/hubs/[id] (interventions, véhicules, conversions).

import { useMemo, useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { MapPinned, Building, BarChart3, CalendarRange, Handshake, TrendingUp, Wrench } from "lucide-react"
import { useHubs, useHubDetail, TunisiaMiniMap, HubStatusBadge, HubFormatBadge, type HubRow } from "./hubs-shared"
import { SectionHeader } from "@/components/radar/radar-shared"

type CarteTab = "nationale" | "enseigne" | "performance" | "pipeline"

const BRAND_LABEL: Record<string, string> = {
  agil: "Agil", shell: "Shell", totalenergies: "TotalEnergies", staroil: "Staroil", ola: "Ola Energy",
}
const money = (v: number) => `${num(v)} DT`

export function HubsCarte({ tab }: { tab: string }) {
  // Vue réseau complet (pas de filtre enseigne) : la carte est nationale,
  // l'onglet « enseigne » compare les réseaux entre eux.
  const { data, error, reload } = useHubs(null)
  const [selected, setSelected] = useState<HubRow | null>(null)
  const t = (["nationale", "enseigne", "performance", "pipeline"].includes(tab) ? tab : "nationale") as CarteTab

  const byBrand = useMemo(() => {
    if (!data) return []
    const m = new Map<string, { slug: string; hubs: number; active: number; ca30: number; caTotal: number; vehicles: number }>()
    for (const h of data.hubs) {
      const cur = m.get(h.brandSlug) ?? { slug: h.brandSlug, hubs: 0, active: 0, ca30: 0, caTotal: 0, vehicles: 0 }
      cur.hubs++
      if (h.status === "ACTIF") cur.active++
      cur.ca30 += h.kpis.ca30
      cur.caTotal += h.kpis.caTotal
      cur.vehicles += h.kpis.vehicles
      m.set(h.brandSlug, cur)
    }
    return [...m.values()].sort((a, b) => b.caTotal - a.caTotal)
  }, [data])

  if (error && !data) return <div className="p-1"><ErrorState message={`Réseau TMP indisponible (${error}).`} retry={reload} /></div>
  if (!data) return <TabSkeleton title="Chargement du réseau des micro-hubs…" />

  const agg = data.aggregate
  const pipelineHubs = data.hubs.filter(h => h.status === "CONSTRUCTION" || h.status === "PROJET")

  return (
    <div className="space-y-4">
      {t === "nationale" && (
        <>
          <SectionHeader
            title="Vue nationale du réseau TMP"
            description="Les micro-hubs franchisés (vidange express, pneus, diagnostic) positionnés sur leurs coordonnées réelles — chaque point est un capteur du parc automobile et un levier d'acquisition pour les stations classiques."
            icon={MapPinned}
            badge={`${agg.hubs} TMP`}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="TMP actifs" value={num(agg.active)} sub={`${agg.construction} en construction · ${agg.projet} en projet`} icon={MapPinned} tone="success" />
            <KpiCard label="CA 30 jours" value={money(agg.ca30)} sub={`${num(agg.interventions)} interventions au total`} icon={TrendingUp} />
            <KpiCard label="Taux de conversion" value={`${agg.conversionRatePct} %`} sub={`${num(agg.conversionsConverted)} clients orientés convertis`} icon={BarChart3} tone="warning" />
            <KpiCard label="Véhicules clients" value={num(agg.vehicles)} sub="capteurs du parc automobile" icon={Wrench} />
          </div>
          <Card>
            <CardContent className="p-4 md:p-6">
              <TunisiaMiniMap hubs={data.hubs} selectedId={selected?.id ?? null} onSelect={setSelected} />
            </CardContent>
          </Card>
          <HubGrid hubs={data.hubs} onSelect={setSelected} />
        </>
      )}

      {t === "enseigne" && (
        <>
          <SectionHeader
            title="Répartition par enseigne"
            description="Comparaison inter-réseaux : nombre de micro-hubs, chiffre d'affaires généré et véhicules captés — le réseau de distribution principal derrière chaque flotte de TMP."
            icon={Building}
            badge={`${byBrand.length} réseaux`}
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enseigne</TableHead>
                      <TableHead className="text-right">TMP</TableHead>
                      <TableHead className="text-right">Actifs</TableHead>
                      <TableHead className="text-right">CA 30 j</TableHead>
                      <TableHead className="text-right">CA cumulé</TableHead>
                      <TableHead className="text-right">Véhicules</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byBrand.map(b => (
                      <TableRow key={b.slug}>
                        <TableCell className="font-medium">{BRAND_LABEL[b.slug] ?? b.slug}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(b.hubs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(b.active)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(b.ca30)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(b.caTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(b.vehicles)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <HubGrid hubs={data.hubs} onSelect={setSelected} />
        </>
      )}

      {t === "performance" && (
        <>
          <SectionHeader
            title="Performance par TMP"
            description="Classement des micro-hubs actifs par chiffre d'affaires cumulé — ROI, payback et taux de conversion de chaque franchisé."
            icon={BarChart3}
            badge="KPIs réels"
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TMP</TableHead>
                      <TableHead>Franchisé</TableHead>
                      <TableHead className="text-right">CA 30 j</TableHead>
                      <TableHead className="text-right">CA mensuel moyen</TableHead>
                      <TableHead className="text-right">ROI</TableHead>
                      <TableHead className="text-right">Payback</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.hubs
                      .filter(h => h.status === "ACTIF")
                      .sort((a, b) => b.kpis.caTotal - a.kpis.caTotal)
                      .map(h => (
                        <TableRow key={h.id} className="cursor-pointer" onClick={() => setSelected(h)}>
                          <TableCell>
                            <p className="font-medium">{h.code}</p>
                            <p className="text-xs text-muted-foreground">{h.name} · {h.gouvernorat}</p>
                          </TableCell>
                          <TableCell className="text-sm">{h.franchisee ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(h.kpis.ca30)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(h.kpis.caMonthly)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`tabular-nums font-semibold ${h.kpis.roiPct >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {h.kpis.roiPct} %
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {h.kpis.paybackMonths ? `${num(h.kpis.paybackMonths)} mois` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{h.kpis.conversionRatePct} %</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                ROI = CA cumulé / investissement initial (honnête : hubs récents encore en montée en charge) ·
                payback = investissement / CA mensuel moyen.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {t === "pipeline" && (
        <>
          <SectionHeader
            title="Pipeline d'ouvertures"
            description="Micro-hubs en construction ou en projet — les prochaines ouvertures du réseau, adossées aux candidats franchise du Radar d'Opportunités."
            icon={CalendarRange}
            badge={`${pipelineHubs.length} à venir`}
          />
          {pipelineHubs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <CalendarRange className="h-8 w-8 text-emerald-500" aria-hidden />
                <p className="text-sm font-medium">Aucune ouverture en préparation</p>
                <p className="text-xs text-muted-foreground">Le réseau est stabilisé — le Radar d&apos;Opportunités identifie les prochaines zones.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pipelineHubs.map(h => (
                <Card key={h.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setSelected(h)}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      <CalendarRange className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {h.code} — {h.name}
                        <HubStatusBadge status={h.status} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {h.gouvernorat}{h.delegation ? ` · ${h.delegation}` : ""} · format <HubFormatBadge format={h.format} />
                      </p>
                      <p className="mt-2 text-xs">
                        Investissement prévu : <strong className="tabular-nums">{money(h.investmentDt)}</strong>
                        {h.franchisee && <> · franchisé : <strong>{h.franchisee}</strong></>}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Handshake className="h-3.5 w-3.5" aria-hidden />
            Les candidats « signés » sans hub ouvert alimentent ce pipeline — pipeline détaillé au round C1.
          </p>
        </>
      )}

      {/* Fiche détaillée d'un TMP (Sheet) */}
      <HubDetailSheet hub={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ---------------- Grille de fiches (vue nationale / enseigne) ---------------- */
function HubGrid({ hubs, onSelect }: { hubs: HubRow[]; onSelect: (h: HubRow) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {hubs.map(h => (
        <Card key={h.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => onSelect(h)}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                  <span className="tabular-nums">{h.code}</span>
                  <span className="truncate font-medium text-muted-foreground">— {h.name}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {BRAND_LABEL[h.brandSlug] ?? h.brandSlug} · {h.gouvernorat}
                  {h.delegation ? ` (${h.delegation})` : ""}
                </p>
              </div>
              <HubStatusBadge status={h.status} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "CA 30 j", value: h.status === "ACTIF" ? money(h.kpis.ca30) : "—" },
                { label: "Véhicules", value: h.status === "ACTIF" ? num(h.kpis.vehicles) : "—" },
                { label: "Conversion", value: h.status === "ACTIF" ? `${h.kpis.conversionRatePct} %` : "—" },
              ].map(k => (
                <div key={k.label} className="rounded-lg border bg-muted/30 p-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight">{k.value}</p>
                </div>
              ))}
            </div>
            {h.franchisee && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Handshake className="h-3 w-3 shrink-0" aria-hidden /> Franchisé : {h.franchisee}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ---------------- Fiche détaillée (Sheet) ---------------- */
function HubDetailSheet({ hub, onClose }: { hub: HubRow | null; onClose: () => void }) {
  const detail = useHubDetail(hub?.id ?? null)
  return (
    <Sheet open={hub !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {hub && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="tabular-nums">{hub.code}</span> — {hub.name}
                <HubStatusBadge status={hub.status} />
              </SheetTitle>
              <SheetDescription>
                {BRAND_LABEL[hub.brandSlug] ?? hub.brandSlug} · {hub.gouvernorat}
                {hub.delegation ? ` · ${hub.delegation}` : ""} · format {hub.format === "EXPRESS" ? "micro-station express" : hub.format === "CLASSIQUE" ? "station classique" : "Mobility Hub"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              {!detail ? (
                <div className="space-y-2 pt-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
                </div>
              ) : (
                <>
                  {/* KPIs du hub */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "CA cumulé", value: money(detail.hub.kpis.caTotal) },
                      { label: "CA 30 j", value: money(detail.hub.kpis.ca30) },
                      { label: "ROI", value: `${detail.hub.kpis.roiPct} %` },
                      { label: "Interventions", value: num(detail.hub.kpis.interventions) },
                      { label: "Véhicules", value: num(detail.hub.kpis.vehicles) },
                      { label: "Conversion", value: `${detail.hub.kpis.conversionsConverted} cli.` },
                    ].map(k => (
                      <div key={k.label} className="rounded-lg border p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Franchisé */}
                  {detail.hub.franchisee && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Franchisé</p>
                      <p className="mt-1 text-sm font-semibold">{detail.hub.franchisee.fullName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {detail.hub.franchisee.experience ?? "—"}
                        {detail.hub.franchisee.phone ? ` · ${detail.hub.franchisee.phone}` : ""}
                      </p>
                    </div>
                  )}

                  {/* Grille tarifaire (référence) */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grille de référence</p>
                    <ul className="space-y-1.5">
                      {detail.hub.services.map(s => (
                        <li key={s.type} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                          <span className="min-w-0 truncate">{s.label}</span>
                          <span className="shrink-0 tabular-nums font-semibold">{money(s.basePriceDt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Dernières interventions */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Dernières interventions ({num(detail.hub.interventions.length)})
                    </p>
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {detail.hub.interventions.map(i => (
                        <li key={i.id} className="rounded-md border px-2.5 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {i.serviceType === "VIDANGE" ? "Vidange" : i.serviceType === "PNEUS" ? "Pneus" : "Diagnostic"}
                              {i.vehicle && <span className="ml-1.5 font-normal text-muted-foreground">{i.vehicle.plate}</span>}
                            </span>
                            <span className="shrink-0 tabular-nums font-semibold">{money(i.priceDt)}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {i.detail ?? "—"} · {new Date(i.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Conversions vers stations */}
                  {detail.hub.conversions.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversions vers stations</p>
                      <ul className="space-y-1.5">
                        {detail.hub.conversions.slice(0, 6).map(c => (
                          <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                            <span className="min-w-0 truncate">{c.detail}</span>
                            <Badge variant="outline" className={`shrink-0 ${c.status === "CONVERTI" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" : c.status === "PERDU" ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"}`}>
                              {c.status === "CONVERTI" ? `+ ${money(c.valueDt)}` : c.status === "PERDU" ? "perdu" : "orienté"}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
