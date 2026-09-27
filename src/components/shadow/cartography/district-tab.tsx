"use client"

// Shadow Market (T44-c) — onglet « 🎯 Par District » : filtres en cascade
// Gouvernorat → Délégation → Cité (sélects liés, filtrage client des points),
// statistiques du district et carte focus.

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ShadowMapResponse } from "@/lib/types"
import { GOV_CENTERS } from "@/components/map/tunisia-geo"
import { formatTnd, formatLJ, ShadowKpiCard } from "@/components/shadow/shadow-shared"
import { ShadowMap, type ShadowFocusTarget } from "./shadow-map"
import { Layers, Droplets, TrendingDown, Building2 } from "lucide-react"

const ALL = "__all__"

export function DistrictTab({ data }: { data: ShadowMapResponse }) {
  const [gov, setGov] = useState<string>(ALL)
  const [deleg, setDeleg] = useState<string>(ALL)
  const [cite, setCite] = useState<string>(ALL)
  const [focus, setFocus] = useState<ShadowFocusTarget | null>(null)

  // ----- Options en cascade (dérivées des points) -----
  const govs = useMemo(
    () => [...new Set(data.points.map(p => p.gouvernorat))].sort((a, b) => a.localeCompare(b, "fr")),
    [data.points]
  )
  const delegations = useMemo(
    () => [...new Set(data.points.filter(p => gov === ALL || p.gouvernorat === gov).map(p => p.delegation))].sort((a, b) => a.localeCompare(b, "fr")),
    [data.points, gov]
  )
  const cites = useMemo(
    () => [...new Set(data.points
      .filter(p => (gov === ALL || p.gouvernorat === gov) && (deleg === ALL || p.delegation === deleg))
      .map(p => p.cite)
      .filter((c): c is string => !!c)
    )].sort((a, b) => a.localeCompare(b, "fr")),
    [data.points, gov, deleg]
  )

  const filtered = useMemo(
    () => data.points.filter(p =>
      (gov === ALL || p.gouvernorat === gov) &&
      (deleg === ALL || p.delegation === deleg) &&
      (cite === ALL || p.cite === cite)
    ),
    [data.points, gov, deleg, cite]
  )

  const stats = useMemo(() => ({
    points: filtered.length,
    volumeLJ: filtered.reduce((s, p) => s + p.volumeLJ, 0),
    lossTnd: filtered.reduce((s, p) => s + p.lossTnd, 0),
  }), [filtered])

  const govRow = data.govHeat.find(g => g.gouvernorat === gov)
  const csvCtx = gov === ALL ? "tous-districts" : `${gov.toLowerCase().replace(/\s+/g, "-")}${deleg !== ALL ? `-${deleg.toLowerCase().replace(/\s+/g, "-")}` : ""}`

  const onGovChange = (v: string) => {
    setGov(v); setDeleg(ALL); setCite(ALL)
    const c = v !== ALL ? GOV_CENTERS[v] : undefined
    setFocus(c ? { lat: c[1], lng: c[0], km: 48 } : null)
  }

  return (
    <div className="space-y-4">
      {/* ---------- Filtres en cascade ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres territoriaux en cascade</CardTitle>
          <CardDescription>
            Affinez le périmètre : gouvernorat → délégation → cité. {filtered.length} point{filtered.length > 1 ? "s" : ""} correspondant{filtered.length > 1 ? "s" : ""} aux critères.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="district-gov" className="mb-1 block text-xs font-medium text-muted-foreground">Gouvernorat</label>
              <Select value={gov} onValueChange={onGovChange}>
                <SelectTrigger id="district-gov" className="w-full" aria-label="Filtrer par gouvernorat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous ({govs.length})</SelectItem>
                  {govs.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="district-deleg" className="mb-1 block text-xs font-medium text-muted-foreground">Délégation</label>
              <Select value={deleg} onValueChange={v => { setDeleg(v); setCite(ALL) }}>
                <SelectTrigger id="district-deleg" className="w-full" aria-label="Filtrer par délégation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toutes ({delegations.length})</SelectItem>
                  {delegations.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="district-cite" className="mb-1 block text-xs font-medium text-muted-foreground">Cité / quartier</label>
              <Select value={cite} onValueChange={setCite} disabled={cites.length === 0}>
                <SelectTrigger id="district-cite" className="w-full" aria-label="Filtrer par cité">
                  <SelectValue placeholder={cites.length ? "Toutes" : "Aucune cité recensée"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toutes ({cites.length})</SelectItem>
                  {cites.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- Stats du district ---------- */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ShadowKpiCard label="Points actifs" value={String(stats.points)} sub={gov === ALL ? "national" : `district ${gov}`} icon={Layers} tone="orange" />
        <ShadowKpiCard label="Volume informel" value={formatLJ(stats.volumeLJ)} sub="litres/jour écoulés" icon={Droplets} tone="yellow" />
        <ShadowKpiCard label="Perte estimée" value={formatTnd(stats.lossTnd)} sub="marge grignotée / mois" icon={TrendingDown} tone="red" />
        <ShadowKpiCard
          label="Stations menacées"
          value={govRow ? String(govRow.stationsThreatened) : "—"}
          sub={govRow ? `dans le gouvernorat ${govRow.gouvernorat}` : "choisir un gouvernorat"}
          icon={Building2}
          tone="neutral"
        />
      </div>

      {/* ---------- Carte filtrée ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>
            Carte du district
            {gov !== ALL && ` — ${gov}`}
            {deleg !== ALL && ` · ${deleg}`}
            {cite !== ALL && ` · ${cite}`}
          </CardTitle>
          <CardDescription>
            Points filtrés par le périmètre sélectionné · clic sur un point = fiche terrain · export CSV des points affichés
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShadowMap
            points={filtered}
            govHeat={gov === ALL ? data.govHeat : data.govHeat.filter(g => g.gouvernorat === gov)}
            showGovHeat
            typologies={data.typologies}
            focusOn={focus}
            csvContext={csvCtx}
            height="h-[560px]"
          />
        </CardContent>
      </Card>
    </div>
  )
}
