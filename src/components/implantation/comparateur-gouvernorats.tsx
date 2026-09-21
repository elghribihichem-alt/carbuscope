'use client'

// CarbuScope — Implantation (Task ID: 9) / outil 3 : « Comparateur de gouvernorats ».
// Arbitrage de zones : 2 ou 3 gouvernorats côte à côte (colonnes desktop,
// cartes empilées mobile) — KPI marché, parts, notes, répartitions enseignes,
// meilleure valeur surlignée / moins bonne en ambre, verdict généré.

import { useMemo, useState, type ReactNode } from "react"
import { GitCompareArrows, Lightbulb, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  BrandDot, BrandMiniBar, NoteCell, PALIER_META, PalierBadge,
  fmtPct1, fmtRatio, num, type GovStat, type GovStatsResult,
} from "./implantation-shared"

type Tone = "best" | "worst" | undefined

type KpiRow = {
  key: string
  label: string
  hint?: string
  /** « up » = valeur haute favorable · « down » = valeur basse favorable. */
  direction: "up" | "down" | "none"
  value: (g: GovStat) => number | null
  render: (g: GovStat, tone: Tone) => ReactNode
}

const TONE_CLS: Record<"best" | "worst", string> = {
  best: "bg-emerald-50 dark:bg-emerald-950/60",
  worst: "bg-amber-50 dark:bg-amber-950/50",
}

function toneDot(tone: Tone): ReactNode {
  if (tone === "best") {
    return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" title="Meilleure valeur de la comparaison" aria-label="Meilleure valeur" />
  }
  if (tone === "worst") {
    return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Moins bonne valeur de la comparaison" aria-label="Moins bonne valeur" />
  }
  return null
}

export function ComparateurGouvernorats({ result, brandSlug }: { result: GovStatsResult; brandSlug: string }) {
  const { stats } = result

  /* ---- Sélection : défaut dérivé = 2 plus grands parcs (jamais de setState d'effet) ---- */
  const defaults = useMemo(
    () => [...stats].sort((a, b) => b.vehicles - a.vehicles).slice(0, 2).map((s) => s.name),
    [stats]
  )
  const [picked, setPicked] = useState<string[] | null>(null)
  const selection = picked ?? defaults
  const [addValue, setAddValue] = useState("")

  const byName = useMemo(() => new Map(stats.map((s) => [s.name, s])), [stats])
  const selectedStats = selection.map((n) => byName.get(n)).filter((s): s is GovStat => Boolean(s))
  const myBrandRow = (g: GovStat) => g.stationsByBrand.find((b) => b.slug === brandSlug)

  const addGov = (name: string) => {
    setAddValue("")
    if (selection.includes(name)) return
    if (selection.length >= 3) {
      toast.info("Trois gouvernorats maximum", {
        description: "Retirez-en un avant d'en comparer un autre.",
      })
      return
    }
    setPicked([...selection, name])
  }

  const removeGov = (name: string) => {
    if (selection.length <= 2) {
      toast.info("Comparez au moins deux gouvernorats", {
        description: "Ajoutez un troisième gouvernorat avant d'en retirer un.",
      })
      return
    }
    setPicked(selection.filter((n) => n !== name))
  }

  /* ---- Définition des KPI comparés ---- */
  const kpis: KpiRow[] = [
    {
      key: "population", label: "Population", direction: "up",
      value: (g) => g.population,
      render: (g) => <span className="text-sm tabular-nums">{num(g.population)}</span>,
    },
    {
      key: "vehicles", label: "Parc automobile", direction: "up",
      value: (g) => g.vehicles,
      render: (g) => <span className="text-sm font-semibold tabular-nums">{num(g.vehicles)} <span className="text-[11px] font-normal text-muted-foreground">véh.</span></span>,
    },
    {
      key: "motorization", label: "Motorisation", direction: "up",
      hint: "part de ménages motorisés",
      value: (g) => g.motorizationRate,
      render: (g) => <span className="text-sm tabular-nums">{fmtPct1(g.motorizationRate * 100)}</span>,
    },
    {
      key: "stations", label: "Stations en service", direction: "down",
      hint: "moins d'offre = moins de concurrence",
      value: (g) => g.stationsTotal,
      render: (g) => <span className="text-sm tabular-nums">{num(g.stationsTotal)}</span>,
    },
    {
      key: "ratio", label: "Véh. / station", direction: "up",
      hint: "ratio élevé = parc mal couvert",
      value: (g) => g.ratio,
      render: (g, tone) => (
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("text-sm font-bold tabular-nums", tone === "best" && "text-emerald-700 dark:text-emerald-400")}>
            {fmtRatio(g.ratio)}
          </span>
          <PalierBadge palier={g.palier} />
        </span>
      ),
    },
    {
      key: "mine", label: "Part de mon enseigne", direction: "up",
      value: (g) => myBrandRow(g)?.count ?? 0,
      render: (g) => {
        const b = myBrandRow(g)
        if (!b) return <span className="text-xs italic text-muted-foreground">absente</span>
        return (
          <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
            <BrandDot color={b.color} />
            <span className="font-semibold">{num(b.count)}</span>
            <span className="text-[11px] text-muted-foreground">
              ({fmtPct1((b.count / Math.max(g.stationsTotal, 1)) * 100)})
            </span>
          </span>
        )
      },
    },
    {
      key: "rating", label: "Note moyenne", direction: "up",
      hint: "qualité perçue du réseau local",
      value: (g) => g.avgRating,
      render: (g, tone) => (
        <span className="inline-flex items-center gap-1">
          <NoteCell rating={g.avgRating ?? 0} reviews={g.ratedStations} />
          {tone && toneDot(tone)}
        </span>
      ),
    },
    {
      key: "leader", label: "Meilleure enseigne locale", direction: "none",
      value: () => null,
      render: (g) => {
        const b = g.stationsByBrand[0]
        if (!b) return <span className="text-xs italic text-muted-foreground">—</span>
        return (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <BrandDot color={b.color} />
            <span className="truncate font-medium">{b.name}</span>
            <span className="tabular-nums text-muted-foreground">×{num(b.count)}</span>
          </span>
        )
      },
    },
    {
      key: "repartition", label: "Répartition des enseignes", direction: "none",
      value: () => null,
      render: (g) => (
        <span className="flex flex-col gap-1">
          <BrandMiniBar dist={g.stationsByBrand} height="h-2" className="max-w-[160px]" />
          <span className="text-[10px] text-muted-foreground">
            {g.stationsByBrand.slice(0, 3).map((b) => `${b.name} ${Math.round((b.count / Math.max(g.stationsTotal, 1)) * 100)} %`).join(" · ")}
          </span>
        </span>
      ),
    },
  ]

  /* ---- Meilleure / moins bonne valeur par ligne (2+ valeurs comparables) ---- */
  const flags = useMemo(() => {
    const map = new Map<string, Tone>() // `${govName}||${kpiKey}`
    for (const row of kpis) {
      if (row.direction === "none") continue
      const values = selectedStats.map((g) => ({ g, v: row.value(g) }))
      if (values.some((x) => x.v === null) || values.length < 2) continue
      const nums = values.map((x) => x.v as number)
      if (nums.every((v) => v === nums[0])) continue
      const bestVal = row.direction === "up" ? Math.max(...nums) : Math.min(...nums)
      const worstVal = row.direction === "up" ? Math.min(...nums) : Math.max(...nums)
      for (const { g, v } of values) {
        if (v === bestVal) map.set(`${g.name}||${row.key}`, "best")
        else if (v === worstVal) map.set(`${g.name}||${row.key}`, "worst")
      }
    }
    return map
  }, [selectedStats, kpis])

  const flagOf = (gov: string, key: string): Tone => flags.get(`${gov}||${key}`)

  /* ---- Verdict généré ---- */
  const verdict = useMemo(() => {
    if (selectedStats.length < 2) return []
    const sentences: string[] = []
    const top = (fn: (g: GovStat) => number) => [...selectedStats].sort((a, b) => fn(b) - fn(a))[0]
    const topParc = top((g) => g.vehicles)
    sentences.push(
      `${topParc.name} offre le plus grand parc automobile (${num(topParc.vehicles)} véhicules, ` +
        `${fmtPct1(topParc.motorizationRate * 100)} de motorisation).`
    )
    const topRatio = top((g) => g.ratio)
    sentences.push(
      `${topRatio.name} présente la moindre densité concurrentielle (${fmtRatio(topRatio.ratio)} véhicules par station — ${PALIER_META[topRatio.palier].label.toLowerCase()}).`
    )
    const topShare = top((g) => g.stationsByBrand.find((b) => b.slug === brandSlug)?.count ?? 0)
    const share = topShare.stationsByBrand.find((b) => b.slug === brandSlug)
    if (share && share.count > 0) {
      sentences.push(
        `${topShare.name} est le terrain le mieux couvert par ${share.name} (${num(share.count)} stations, ` +
          `${fmtPct1((share.count / Math.max(topShare.stationsTotal, 1)) * 100)} de l'offre locale).`
      )
    } else {
      sentences.push("Aucune des zones comparées n'est encore couverte par votre enseigne — implantation vierge.")
    }
    const rated = selectedStats.filter((g) => g.avgRating !== null)
    if (rated.length >= 2) {
      const topNote = [...rated].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))[0]
      sentences.push(
        `${topNote.name} obtient la meilleure note moyenne (${topNote.avgRating?.toFixed(1).replace(".", ",")}/5).`
      )
    }
    const topOpp = top((g) => g.opportunity)
    sentences.push(
      `Priorité d'étude : ${topOpp.name}, score d'opportunité ${topOpp.opportunity}/100.`
    )
    return sentences
  }, [selectedStats, brandSlug])

  const remaining = stats.filter((s) => !selection.includes(s.name))

  return (
    <div className="space-y-4">
      {/* Sélection 2-3 gouvernorats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitCompareArrows className="h-4 w-4 text-primary" aria-hidden />
            Gouvernorats comparés
          </CardTitle>
          <CardDescription>
            Deux ou trois marchés côte à côte — défaut : les deux plus grands parcs du pays.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {selection.map((name) => {
            const stat = byName.get(name)
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stat ? PALIER_META[stat.palier].color : "#94a3b8" }} aria-hidden />
                {name}
                <button
                  type="button"
                  onClick={() => removeGov(name)}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Retirer ${name} de la comparaison`}
                >
                  <span aria-hidden>×</span>
                </button>
              </span>
            )
          })}
          <Select value={addValue} onValueChange={(v) => { if (v) addGov(v) }}>
            <SelectTrigger size="sm" className="h-8 w-[220px]" aria-label="Ajouter un gouvernorat à la comparaison">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Ajouter un gouvernorat…
              </span>
            </SelectTrigger>
            <SelectContent>
              {remaining.length === 0 && <SelectItem value="none" disabled>Aucun autre gouvernorat</SelectItem>}
              {remaining.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} · {num(s.vehicles)} véh. · {fmtRatio(s.ratio)} véh./station
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {picked !== null && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPicked(null)}>
              Réinitialiser
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Matrice de comparaison (desktop) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comparaison côte à côte</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden /> meilleure valeur
            </span>
            {" · "}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> moins bonne valeur
            </span>
            {" · "}
            stations en service (ACTIVE + RÉNOVATION)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop : colonnes par gouvernorat */}
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-primary/20 bg-primary/10 hover:bg-primary/10">
                  <TableHead className="text-primary">Indicateur</TableHead>
                  {selectedStats.map((g) => (
                    <TableHead key={g.name} className="text-center text-primary">
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <span className="text-sm font-semibold">{g.name}</span>
                        <PalierBadge palier={g.palier} />
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="align-middle text-xs font-medium">
                      {row.label}
                      {row.hint && <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">{row.hint}</p>}
                    </TableCell>
                    {selectedStats.map((g) => {
                      const tone = flagOf(g.name, row.key)
                      return (
                        <TableCell
                          key={g.name}
                          className={cn("text-center align-middle", tone && TONE_CLS[tone])}
                        >
                          {row.render(g, tone)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile : cartes empilées par gouvernorat */}
          <div className="space-y-3 md:hidden">
            {selectedStats.map((g) => (
              <Card key={g.name}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">{g.name}</p>
                    <PalierBadge palier={g.palier} />
                  </div>
                  <dl className="mt-2 divide-y">
                    {kpis.map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-3 py-1.5">
                        <dt className="text-xs text-muted-foreground">{row.label}</dt>
                        <dd className="text-right">{row.render(g, flagOf(g.name, row.key))}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Verdict */}
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-primary">
            <Lightbulb className="h-4 w-4" aria-hidden />
            Verdict d&apos;arbitrage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {verdict.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Badge variant="secondary" className="mt-0.5 h-4 shrink-0 px-1.5 text-[10px] tabular-nums">
                  {i + 1}
                </Badge>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
