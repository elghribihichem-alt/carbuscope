"use client"

// Shadow Market (T44-c) — section « Vue d'Ensemble » : page d'accueil du module
// pour un DG d'enseigne / la Super Administration. 4 onglets :
//   📊 Indicateurs Clés · 🔴 Alertes · 🏆 Top 10 Menaces · 📅 Calendrier
// Sélecteur de mois : le mois courant affiche les données live, les mois
// passés re-scalent les KPI depuis la série mensuelle consolidée (les listes
// live — alertes, top menaces, calendrier — restent celles du recensement
// courant, signalées par un badge « Données mensuelles consolidées »).

import { useCallback, useEffect, useState } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import type { ShadowOverviewKpis, ShadowOverviewResponse } from "@/lib/types"
import { SectionHeader, monthLabelFr } from "@/components/shadow/shadow-shared"
import { KpisTab } from "./kpis-tab"
import { AlertsTab } from "./alerts-tab"
import { TopTab } from "./top-tab"
import { CalendarTab } from "./calendar-tab"
import { CalendarRange, FileArchive } from "lucide-react"

export function ShadowOverview({ onNavigate }: { onNavigate?: (section: string) => void }) {
  // Onglet actif piloté par la sidebar (store T46, clé « shadow-overview »).
  const setNav = useAppStore(s => s.setNav)
  const tab = useAppStore(s => s.nav["shadow-overview"]) ?? "kpis"
  const [data, setData] = useState<ShadowOverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<string>("__live__")

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/shadow/overview", { signal })
      if (!r.ok) throw new Error(`API /api/shadow/overview [${r.status}]`)
      const d = (await r.json()) as ShadowOverviewResponse
      setData(d)
      setError(null)
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void load(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [load])

  const retry = useCallback(() => {
    void load(new AbortController().signal)
  }, [load])

  if (error && !data) return <ErrorState message={error} retry={retry} />
  if (!data) return <TabSkeleton title="Chargement de la vue d'ensemble du marché parallèle…" />

  const isLive = month === "__live__" || month === data.month
  const monthStat = isLive ? null : data.monthly.find(m => m.month === month) ?? null
  const consolidated = !isLive

  // ---------- Re-scale des KPI pour un mois consolidé (dérivation pure au rendu) ----------
  const kpis: ShadowOverviewKpis = (() => {
    if (!monthStat) return data.kpis
    const idx = data.monthly.findIndex(m => m.month === monthStat.month)
    const prev = idx > 0 ? data.monthly[idx - 1] : null
    const lossRatio = data.kpis.estLossTnd > 0 ? monthStat.estLossTnd / data.kpis.estLossTnd : 1
    const pointsRatio = data.kpis.activePoints > 0 ? monthStat.activePoints / data.kpis.activePoints : 1
    return {
      activePoints: monthStat.activePoints,
      estLossTnd: monthStat.estLossTnd,
      volumeLJ: Math.round(data.kpis.volumeLJ * lossRatio),
      stationsThreatened: Math.round(data.kpis.stationsThreatened * lossRatio),
      stationsThreatenedRed: Math.round(data.kpis.stationsThreatenedRed * lossRatio),
      monthVariationPct: prev && prev.activePoints > 0
        ? ((monthStat.activePoints - prev.activePoints) / prev.activePoints) * 100
        : 0,
      lossVariationPct: prev && prev.estLossTnd > 0
        ? ((monthStat.estLossTnd - prev.estLossTnd) / prev.estLossTnd) * 100
        : 0,
      marketShareStolenPct: data.kpis.marketShareStolenPct * pointsRatio,
      pendingValidation: data.kpis.pendingValidation,
      newThisWeek: monthStat.newPoints,
    }
  })()

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="📈"
        title="SHADOW MARKET — Vue d'Ensemble"
        description={`${data.scope === "NATIONAL" ? "Vision nationale" : `Périmètre ${data.brandSlug ?? "enseigne"}`} · ${monthLabelFr(isLive ? data.month : monthStat?.month ?? data.month)} · ${data.kpis.activePoints.toLocaleString("fr-FR")} points actifs suivis, ${data.kpis.stationsThreatened} stations menacées.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {consolidated && (
              <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                <FileArchive className="h-3.5 w-3.5" aria-hidden />
                Données mensuelles consolidées
              </Badge>
            )}
            <Select value={isLive ? data.month : month} onValueChange={setMonth}>
              <SelectTrigger className="w-[160px]" aria-label="Sélectionner le mois affiché">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={data.month}>
                  {data.monthLabel} (en cours)
                </SelectItem>
                {data.monthly
                  .filter(m => m.month !== data.month)
                  .map(m => (
                    <SelectItem key={m.month} value={m.month}>{monthLabelFr(m.month)}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Contenu de l'onglet actif — la navigation (4 onglets) est portée par la sidebar */}
      <Tabs value={tab} onValueChange={v => setNav("shadow-overview", v)}>
        <TabsContent value="kpis" className="mt-4">
          <KpisTab data={data} kpis={kpis} consolidated={consolidated} selectedMonth={isLive ? data.month : month} onNavigate={onNavigate} />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <AlertsTab data={data} onNavigate={onNavigate} />
        </TabsContent>
        <TabsContent value="top" className="mt-4">
          <TopTab data={data} onNavigate={onNavigate} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
