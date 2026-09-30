'use client'

// D.2.2 — Données souveraines : sources nationales, injection versionnée

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Route, Car, Users, HardHat, DatabaseZap, RefreshCw, Quote, FileBadge, GitBranch, Eye,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TabSkeleton } from "@/components/shell/loading"
import type { GovernoratRow, ProjectDTO, RoadDTO } from "@/lib/types"
import { num, fmtDateTime } from "@/components/settings/settings-shared"

type SourceKey = "traffic" | "fleet" | "demo" | "projects"

type SourceDef = {
  key: SourceKey
  title: string
  source: string
  freq: string
  icon: LucideIcon
  accent: string
}

const SOURCES: SourceDef[] = [
  {
    key: "traffic",
    title: "Trafic routier",
    source: "Tunisie Autoroutes · Ministère de l'Équipement",
    freq: "Mise à jour annuelle",
    icon: Route,
    accent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  {
    key: "fleet",
    title: "Parc automobile",
    source: "INS · ATTT",
    freq: "Mise à jour semestrielle",
    icon: Car,
    accent: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  {
    key: "demo",
    title: "Démographie",
    source: "Institut National de la Statistique (INS)",
    freq: "Mise à jour annuelle",
    icon: Users,
    accent: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  },
  {
    key: "projects",
    title: "Projets d'infrastructure",
    source: "Ministère de l'Équipement et de l'Habitat",
    freq: "Mise à jour trimestrielle",
    icon: HardHat,
    accent: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  },
]

export function BoSovereign() {
  const [roads, setRoads] = useState<RoadDTO[] | null>(null)
  const [govs, setGovs] = useState<GovernoratRow[] | null>(null)
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastInjection, setLastInjection] = useState<Partial<Record<SourceKey, string>>>({})

  useEffect(() => {
    const ac = new AbortController()

    const pRoads = fetch("/api/roads", { signal: ac.signal }).then(r => r.json())
    const pGovs = fetch("/api/governorats", { signal: ac.signal }).then(r => r.json())
    const pProjects = fetch("/api/projects", { signal: ac.signal }).then(r => r.json())

    Promise.all([pRoads, pGovs, pProjects])
      .then(([jR, jG, jP]: [{ roads?: RoadDTO[] }, { governorats?: GovernoratRow[] }, { projects?: ProjectDTO[] }]) => {
        setRoads(jR.roads ?? [])
        setGovs(jG.governorats ?? [])
        setProjects(jP.projects ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger les données souveraines.")
      })
    return () => ac.abort()
  }, [])

  const inject = (def: SourceDef) => {
    // T53-T6b : honnêteté du bouton (pattern T4b/T5b) — aucune route
    // d'injection n'existe côté serveur : la planification reste une simulation
    // locale, le timestamp horodate l'aperçu de la session uniquement.
    const stamp = fmtDateTime(new Date())
    setLastInjection(prev => ({ ...prev, [def.key]: stamp }))
    toast.info("Aperçu de planification — aucune injection exécutée", {
      description: `${def.title} · ${def.source} · ${stamp} — simulation locale, aucune écriture serveur.`,
    })
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="p-5 text-sm text-red-700 dark:text-red-400">{error}</CardContent>
      </Card>
    )
  }
  if (!roads || !govs || !projects) return <TabSkeleton title="Chargement des données souveraines…" />

  const totalTmj = roads.reduce((acc, r) => acc + (r.tmj || 0), 0)
  const totalVehicles = govs.reduce((acc, g) => acc + (g.vehicles || 0), 0)
  const avgMotorization = govs.length > 0 ? govs.reduce((a, g) => a + g.motorizationRate, 0) / govs.length : 0
  const totalPopulation = govs.reduce((acc, g) => acc + (g.population || 0), 0)
  const totalDelegations = govs.reduce((acc, g) => acc + (g.delegationCount || 0), 0)
  const latestProjects = projects.slice(0, 3)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SOURCES.map(def => {
          const Icon = def.icon
          return (
            <Card key={def.key} className="flex flex-col border-border/70">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${def.accent}`}>
                    <Icon className="h-4.5 w-4.5" aria-hidden />
                  </div>
                  <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                    <RefreshCw className="h-3 w-3" aria-hidden /> {def.freq}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-sm font-semibold">{def.title}</CardTitle>
                <CardDescription className="text-xs">{def.source}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="space-y-1.5 text-sm">
                  {def.key === "traffic" && (
                    <>
                      <p className="font-semibold tabular-nums">{roads.length} axes routiers suivis</p>
                      <p className="text-xs text-muted-foreground">
                        TMJ cumulé : {num(totalTmj)} véh/j · poids lourds selon axes
                      </p>
                    </>
                  )}
                  {def.key === "fleet" && (
                    <>
                      <p className="font-semibold tabular-nums">{num(totalVehicles)} véhicules</p>
                      <p className="text-xs text-muted-foreground">
                        Équipement moyen : {(avgMotorization * 100).toFixed(0)} % des ménages
                      </p>
                    </>
                  )}
                  {def.key === "demo" && (
                    <>
                      <p className="font-semibold tabular-nums">{num(totalPopulation)} habitants</p>
                      <p className="text-xs text-muted-foreground">
                        {govs.length} gouvernorats · {num(totalDelegations)} délégations
                      </p>
                    </>
                  )}
                  {def.key === "projects" && (
                    <>
                      <p className="font-semibold tabular-nums">{projects.length} projets suivis</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {latestProjects.map(p => (
                          <li key={p.id} className="truncate">· {p.name}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {lastInjection[def.key] && (
                  <p className="text-[11px] italic text-muted-foreground">
                    Dernière planification (aperçu local) : {lastInjection[def.key]}
                  </p>
                )}

                <div className="mt-auto pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => inject(def)}
                    className="w-full gap-1.5"
                  >
                    <DatabaseZap className="h-3.5 w-3.5" aria-hidden /> Injecter une mise à jour
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Note de gouvernance des données — T53-T6b : tokens zinc */}
      <Card className="border-zinc-300 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-900/50">
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900">
            <Quote className="h-4 w-4" aria-hidden />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-relaxed">
              Chaque donnée a une source, une date, une méthode. La méthodologie est documentée et publique. Les
              données sont versionnées.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                <FileBadge className="h-3 w-3" aria-hidden /> Source horodatée
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                <GitBranch className="h-3 w-3" aria-hidden /> Versionnage des jeux de données
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                <Eye className="h-3 w-3" aria-hidden /> Méthodologie publique
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
