'use client'

// T55 — Hubs > Analytics & conversions : le cœur du module — mesure du taux
// de conversion TMP → station, CA généré pour le réseau principal, ROI par
// TMP et comparatif entre franchisés. 4 sous-onglets (clé « hubs-analytics »)
// alimentés par /api/hubs/analytics (entonnoir, CA mensuel 6 mois, services).

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ResponsiveContainer, ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { useChartPalette } from "@/hooks/use-chart-palette"
import { AXIS_STYLE, GRID_STROKE, tooltipStyle, num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { Gauge, Banknote, TrendingUp, UsersRound, GitCompare, Car, Radar, ArrowRight, Wrench } from "lucide-react"
import { useHubs } from "./hubs-shared"
import { SectionHeader } from "@/components/radar/radar-shared"
import type { AnalyticsResponse } from "./hubs-shared"

const money = (v: number) => `${num(v)} DT`

// T55-C-b — parc automobile national (ATTT, ordre de grandeur de référence
// affiché honnêtement dans la formule de couverture du réseau TMP).
const PARC_ATTT = 2_470_000

const SERVICE_LABEL: Record<string, string> = { VIDANGE: "Vidanges", PNEUS: "Pneus", DIAGNOSTIC: "Diagnostics" }
const BRAND_LABEL: Record<string, string> = {
  agil: "Agil", shell: "Shell", totalenergies: "TotalEnergies", staroil: "Staroil", ola: "Ola Energy",
}

export function HubsAnalytics({ tab }: { tab: string }) {
  const brandSlug = useAppStore(s => s.brandSlug)
  const brandName = useAppStore(s => s.session?.brandName) ?? "mon enseigne"
  const { data: hubsData } = useHubs(null) // réseaux complets pour le comparatif
  const palette = useChartPalette()
  // T55-C-b — boucle capteur→Radar : hubs du périmètre enseigne (lentille du
  // panneau « Capteurs du parc ») + navigation vers le Radar d'opportunités.
  const setNav = useAppStore(s => s.setNav)
  const { data: hubsScope } = useHubs(brandSlug)

  // Chargement analytics (lentille enseigne — les KPIs de conversion mesurent
  // ce que MON réseau gagne ; « comparatif » bascule en vision nationale).
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/hubs/analytics${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: AnalyticsResponse) => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [brandSlug])

  const t = (["taux", "ca", "roi", "comparatif"].includes(tab) ? tab : "taux") as "taux" | "ca" | "roi" | "comparatif"

  const chartData = useMemo(
    () => (data ? data.monthly.map(m => ({ ...m, conversionsK: Math.round(m.conversions / 1000) })) : []),
    [data],
  )

  // Agrégation nationale par enseigne (comparatif inter-réseaux).
  const brandsAgg = useMemo(() => {
    if (!hubsData) return []
    const acc: Record<string, { hubs: number; ca: number }> = {}
    for (const h of hubsData.hubs) {
      const cur = acc[h.brandSlug] ?? { hubs: 0, ca: 0 }
      cur.hubs++
      cur.ca += h.kpis.caTotal
      acc[h.brandSlug] = cur
    }
    const maxCa = Math.max(1, ...Object.values(acc).map(v => v.ca))
    return Object.entries(acc)
      .map(([slug, v]) => ({ slug, ...v, maxCa }))
      .sort((a, b) => b.ca - a.ca)
  }, [hubsData])

  // T55-C-b — capteurs du parc (données réelles /api/hubs, périmètre enseigne) :
  // véhicules captés par hub actif (barres), zones de capture (top gouvernorats),
  // couverture du parc national ATTT et CA moyen par véhicule capté.
  const capteurs = useMemo(() => {
    const agg = hubsScope?.aggregate
    const hubsActifs = (hubsScope?.hubs ?? [])
      .filter(h => h.status === "ACTIF")
      .sort((a, b) => b.kpis.vehicles - a.kpis.vehicles)
    const maxVehicles = Math.max(1, ...hubsActifs.map(h => h.kpis.vehicles))
    const gov = new Map<string, number>()
    for (const h of hubsScope?.hubs ?? []) {
      gov.set(h.gouvernorat, (gov.get(h.gouvernorat) ?? 0) + h.kpis.vehicles)
    }
    const topGouvernorats = [...gov.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([gouvernorat, vehicles]) => ({ gouvernorat, vehicles }))
    return {
      vehicles: agg?.vehicles ?? null,
      interventions: agg?.interventions ?? null,
      active: agg?.active ?? null,
      hubsActifs,
      maxVehicles,
      topGouvernorats,
      partPct: agg && agg.vehicles > 0 ? (agg.vehicles / PARC_ATTT) * 100 : null,
      caParVehicule: agg && agg.vehicles > 0 ? Math.round(agg.caTotal / agg.vehicles) : null,
    }
  }, [hubsScope])

  // Deep-link vers le Radar d'opportunités (pattern openRadarAlerts du TDB enseigne).
  const openRadar = useCallback(() => {
    setNav("espace", "radar")
    setNav("radar", "scoring")
  }, [setNav])

  if (error && !data) return <div className="p-1"><ErrorState message={`Analytics indisponibles (${error}).`} /></div>
  if (!data) return <TabSkeleton title="Agrégation des conversions et du CA…" />

  const funnelMax = Math.max(data.funnel.ORIENTE, data.funnel.CONVERTI, data.funnel.PERDU, 1)

  return (
    <div className="space-y-4">
      {t === "taux" && (
        <>
          <SectionHeader
            title="Taux de conversion TMP → station"
            description={`Entonnoir réel des clients orientés par les micro-hubs vers les stations classiques de ${brandName} : chaque client fidélisé en micro-hub devient un levier de réparations lourdes.`}
            icon={Gauge}
            badge={`${data.conversionRatePct} %`}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Orientés" value={num(data.funnel.ORIENTE)} sub="clients envoyés vers une station" icon={GitCompare} />
            <KpiCard label="Convertis" value={num(data.funnel.CONVERTI)} sub={`${data.conversionRatePct} % de réussite`} icon={Gauge} tone="success" />
            <KpiCard label="Perdus" value={num(data.funnel.PERDU)} sub="orientation sans suite" icon={UsersRound} tone="danger" />
            <KpiCard label="CA attribué" value={money(data.caAttributed)} sub="réparations lourdes générées" icon={Banknote} />
          </div>
          {/* Entonnoir horizontal */}
          <Card>
            <CardContent className="space-y-3 p-4 md:p-6">
              {[
                { key: "ORIENTE", label: "Orientés vers une station", color: "bg-emerald-500", tone: "text-emerald-700 dark:text-emerald-400" },
                { key: "CONVERTI", label: "Convertis (réparation réalisée)", color: "bg-emerald-700", tone: "text-emerald-800 dark:text-emerald-300" },
                { key: "PERDU", label: "Perdus (sans suite)", color: "bg-red-400", tone: "text-red-700 dark:text-red-400" },
              ].map(f => {
                const v = data.funnel[f.key as keyof typeof data.funnel]
                return (
                  <div key={f.key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{f.label}</span>
                      <span className={`tabular-nums font-bold ${f.tone}`}>{num(v)} <span className="text-xs text-muted-foreground">({data.totalConversions > 0 ? Math.round((v / data.totalConversions) * 100) : 0} %)</span></span>
                    </div>
                    <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${f.color}`} style={{ width: `${(v / funnelMax) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Traçabilité : chaque véhicule client du micro-hub enregistre ses orientations (vidange dépassée,
                pneus usés, diagnostic lourd) puis leur issue — la donnée alimente aussi la boucle du Radar.
              </p>
            </CardContent>
          </Card>

          {/* T55-C-b — Panneau « Capteurs du parc automobile » (boucle capteur→Radar) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Car className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Capteurs du parc automobile
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                  périmètre {brandName}
                </Badge>
              </CardTitle>
              <CardDescription>
                Chaque véhicule client enregistré dans un TMP est un capteur du parc : kilométrage, défauts détectés
                et orientations alimentent la boucle du Radar d&apos;opportunités.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Véhicules uniques captés"
                  value={capteurs.vehicles !== null ? num(capteurs.vehicles) : "…"}
                  sub="clients enregistrés dans les TMP du périmètre"
                  icon={Car}
                  tone="success"
                />
                <KpiCard
                  label="Interventions cumulées"
                  value={capteurs.interventions !== null ? num(capteurs.interventions) : "…"}
                  sub="vidanges · pneus · diagnostics (registre)"
                  icon={Wrench}
                />
                <KpiCard
                  label="Couverture du parc national"
                  value={capteurs.partPct !== null ? `≈ ${capteurs.partPct.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} %` : "…"}
                  sub={`véhicules captés ÷ parc ATTT (~${num(PARC_ATTT)}) — formule honnête`}
                  icon={Radar}
                />
                <KpiCard
                  label="CA moyen / véhicule capté"
                  value={capteurs.caParVehicule !== null ? money(capteurs.caParVehicule) : "—"}
                  sub={capteurs.vehicles ? `CA interventions ÷ ${num(capteurs.vehicles)} véhicules` : "aucun véhicule capté"}
                  icon={Banknote}
                />
              </div>

              {/* Barres des hubs actifs — véhicules captés (mesure réelle byHub) */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Véhicules captés par hub actif{capteurs.active !== null ? ` (${num(capteurs.active)} actifs)` : ""}
                </p>
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {capteurs.hubsActifs.length === 0 ? (
                    <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                      Aucun hub actif dans le périmètre — les barres apparaîtront dès l&apos;ouverture d&apos;un TMP.
                    </p>
                  ) : capteurs.hubsActifs.map(h => (
                    <div key={h.id} className="min-h-11 rounded-lg border bg-muted/20 px-3 py-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate font-medium">
                          <span className="tabular-nums">{h.code}</span> — {h.name}
                          <span className="text-muted-foreground"> · {h.gouvernorat}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-bold">{num(h.kpis.vehicles)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                          style={{ width: `${(h.kpis.vehicles / capteurs.maxVehicles) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interprétation « signal Radar » + CTA */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Signal Radar
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                  {capteurs.topGouvernorats.length > 0 ? (
                    <>
                      Les zones où les TMP capturent le plus de véhicules signalent une demande entretenue :
                      <strong className="font-semibold">
                        {" "}{capteurs.topGouvernorats.map(g => `${g.gouvernorat} (${num(g.vehicles)})`).join(", ")}
                      </strong>
                      . Le moteur de scoring pondère déjà le parc automobile de chaque gouvernorat — les poches
                      voisines à forte demande sont les prochaines zones à scorer.
                    </>
                  ) : (
                    "Aucun véhicule encore capté dans le périmètre — le signal Radar s&apos;activera dès les premiers passages en TMP."
                  )}
                </p>
                <Button onClick={openRadar} className="mt-3 min-h-11 gap-2">
                  <Radar className="h-4 w-4" aria-hidden />
                  Voir le Radar d&apos;opportunités
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* T55-C-b — Registre conversions résumé (lecture seule — actions dans Services) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <GitCompare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Registre des conversions — résumé
              </CardTitle>
              <CardDescription>
                Complément de l&apos;entonnoir : répartition proportionnelle des issues d&apos;orientation et valeur
                convertie cumulée sur la période.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.totalConversions === 0 ? (
                <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Aucune orientation enregistrée sur le périmètre — le registre se remplit à chaque passage en TMP.
                </p>
              ) : (
                <>
                  {/* Blocs proportionnels — largeur ∝ volume */}
                  <div
                    className="flex h-8 w-full overflow-hidden rounded-lg"
                    role="img"
                    aria-label={`Répartition des ${data.totalConversions} orientations : ${data.funnel.ORIENTE} orientées, ${data.funnel.CONVERTI} converties, ${data.funnel.PERDU} perdues`}
                  >
                    {([
                      { key: "ORIENTE", label: "Orientés", color: "bg-stone-400 dark:bg-stone-600", v: data.funnel.ORIENTE },
                      { key: "CONVERTI", label: "Convertis", color: "bg-emerald-500 dark:bg-emerald-400", v: data.funnel.CONVERTI },
                      { key: "PERDU", label: "Perdus", color: "bg-red-400 dark:bg-red-500", v: data.funnel.PERDU },
                    ] as const).map(b => (
                      b.v > 0 ? (
                        <div
                          key={b.key}
                          className={`${b.color} min-w-0 flex items-center justify-center overflow-hidden px-1 text-[10px] font-bold text-white dark:text-white/90`}
                          style={{ width: `${(b.v / data.totalConversions) * 100}%` }}
                          title={`${b.label} : ${num(b.v)}`}
                        >
                          {b.v}
                        </div>
                      ) : null
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="min-h-11 rounded-lg border bg-muted/20 px-2 py-2">
                      <p className="font-semibold tabular-nums text-stone-700 dark:text-stone-300">{num(data.funnel.ORIENTE)}</p>
                      <p className="text-muted-foreground">orientés</p>
                    </div>
                    <div className="min-h-11 rounded-lg border bg-muted/20 px-2 py-2">
                      <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{num(data.funnel.CONVERTI)}</p>
                      <p className="text-muted-foreground">convertis</p>
                    </div>
                    <div className="min-h-11 rounded-lg border bg-muted/20 px-2 py-2">
                      <p className="font-semibold tabular-nums text-red-700 dark:text-red-400">{num(data.funnel.PERDU)}</p>
                      <p className="text-muted-foreground">perdus</p>
                    </div>
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/40">
                <span className="text-sm font-medium">Valeur convertie totale</span>
                <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{money(data.caAttributed)}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Convention du registre : seules les orientations CONVERTI portent une valeur attribuée — les issues
                sans suite n&apos;enregistrent pas de montant. Registre complet et actions de statut (orienter,
                convertir, clôturer) : <strong className="font-semibold">Services › Conversions</strong> — lecture
                seule ici.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {t === "ca" && (
        <>
          <SectionHeader
            title="CA généré pour les stations"
            description={`Chiffre d'affaires des micro-hubs et valeur des conversions attribuées — tendance sur 6 mois pour ${brandName}.`}
            icon={Banknote}
            badge="6 mois"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="CA attribué cumulé" value={money(data.caAttributed)} sub="conversions réalisées" icon={Banknote} tone="success" />
            {data.byService.map(s => (
              <KpiCard key={s.type} label={SERVICE_LABEL[s.type] ?? s.type} value={money(s.ca)} sub={`${num(s.count)} prestations`} icon={WrenchIcon(s.type)} />
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">CA mensuel — interventions + conversions</CardTitle>
              <CardDescription>Barres : CA du mois (DT) · courbe : valeur des conversions réalisées (k DT)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72" role="img" aria-label="CA mensuel des micro-hubs sur six mois">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="mois" tick={AXIS_STYLE} interval={0} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={64} />
                    <Tooltip contentStyle={tooltipStyle()} formatter={(v, n) => [n === "Conversions (k)" ? `${num(Number(v) * 1000)} DT` : money(Number(v)), String(n)]} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                    <Bar dataKey="ca" name="CA du mois (DT)" fill={palette.color(1)} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="conversionsK" name="Conversions (k)" stroke={palette.color(3)} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {t === "roi" && (
        <>
          <SectionHeader
            title="ROI par TMP"
            description="Retour sur investissement de chaque micro-hub : CA cumulé rapporté à l'investissement initial, avec payback estimé et taux de conversion du franchisé."
            icon={TrendingUp}
            badge={`${data.byHub.length} TMP actifs`}
          />
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TMP</TableHead>
                      <TableHead>Franchisé</TableHead>
                      <TableHead className="text-right">Investissement</TableHead>
                      <TableHead className="text-right">CA cumulé</TableHead>
                      <TableHead className="text-right">ROI</TableHead>
                      <TableHead className="text-right">Conversion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byHub.map(h => (
                      <TableRow key={h.id}>
                        <TableCell>
                          <p className="font-medium tabular-nums">{h.code}</p>
                          <p className="text-xs text-muted-foreground">{h.name} · {h.gouvernorat}</p>
                        </TableCell>
                        <TableCell className="text-sm">{h.franchisee ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(h.investmentDt)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(h.caTotal)}</TableCell>
                        <TableCell className="text-right">
                          <span className={`inline-flex items-center gap-2 tabular-nums font-semibold ${h.roiPct >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, h.roiPct * 8)}%` }} />
                            </span>
                            {h.roiPct} %
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{h.conversionRatePct} %</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                Barre de progression = ROI × 8 (plafonnée à 100 %) — les hubs ouverts récemment sont en montée en
                charge : le payback type se mesure en années (voir fiche TMP).
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {t === "comparatif" && (
        <>
          <SectionHeader
            title="Comparatif entre franchisés et réseaux"
            description="Classement national des micro-hubs par CA cumulé — et vue inter-réseaux (nombre de TMP, CA, conversions) pour situer votre enseigne."
            icon={UsersRound}
            badge="vision nationale"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top micro-hubs (CA cumulé)</CardTitle>
                <CardDescription>Tous réseaux confondus — honnête : hubs anciens privilégiés.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {hubsData?.hubs
                  .filter(h => h.status === "ACTIF")
                  .sort((a, b) => b.kpis.caTotal - a.kpis.caTotal)
                  .slice(0, 7)
                  .map((h, i) => (
                    <div key={h.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{h.code} — {h.name}</p>
                        <p className="text-[11px] text-muted-foreground">{BRAND_LABEL[h.brandSlug] ?? h.brandSlug} · {h.franchisee ?? "—"}</p>
                      </div>
                      <span className="shrink-0 tabular-nums font-semibold">{money(h.kpis.caTotal)}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Réseaux en présence</CardTitle>
                <CardDescription>Cumuls nationaux par enseigne.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {brandsAgg.map(b => (
                  <div key={b.slug}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium">{BRAND_LABEL[b.slug] ?? b.slug}</span>
                      <span className="tabular-nums text-muted-foreground">{num(b.hubs)} TMP · {money(b.ca)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400" style={{ width: `${(b.ca / b.maxCa) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

/** Icône par type de service (KPI du volet CA). */
function WrenchIcon(type: string) {
  return type === "VIDANGE" ? Banknote : type === "PNEUS" ? UsersRound : Gauge
}
