'use client'

// CarbuScope — Aperçu de l'Application Mobile AGENTS TERRAIN (T28 + T38)
// Vue produit dédiée, accessible depuis l'en-tête (bouton « Agents terrain »,
// à côté de « Mobile B2C ») : présentation (gauche) · maquette de téléphone
// interactive démarrant directement dans l'espace agent (connexion par code,
// missions, relevés, rapports) · workflow et codes de démo (droite).
// Colonnes latérales masquées < lg. UI 100 % française, palette émeraude /
// ambre / violette / sarcelle (aucun bleu ni indigo).

import { useEffect, useState } from "react"
import {
  Camera, ClipboardCheck, ClipboardList, Fuel, KeyRound, ListChecks, MousePointerClick,
  Radar, Radio, Route, Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PhoneFrame } from "./phone-frame"
import { MobileApp } from "./mobile-app"
import { BrandDot } from "./shared"

type AgentRow = {
  code: string
  name: string
  brandSlug: string
  zone: string
  missions: number
}

const DIFFERENCIANTS = [
  {
    icon: ClipboardList,
    title: "Missions orchestrées",
    text: "Le superviseur assigne les tournées de contrôle et de veille concurrentielle — l'agent retrouve ses missions du jour, priorités et échéances.",
  },
  {
    icon: Fuel,
    title: "Relevés de prix terrain",
    text: "Prix des concurrents saisis sur place, station par station, horodatés — la veille devient une donnée vivante, plus un tableau mensuel.",
  },
  {
    icon: Camera,
    title: "Rapport de visite guidé",
    text: "Formulaire pas à pas, prestation par prestation : prix affiché, rupture, propreté, file d'attente… photo à l'appui, zéro papier.",
  },
  {
    icon: Radio,
    title: "Remontée temps réel",
    text: "Chaque rapport alimente instantanément l'Observatoire B2B et le moteur de veille de l'enseigne — la journée de terrain se voit au bureau, en direct.",
  },
]

const WORKFLOW: { icon: typeof KeyRound; title: string; text: string }[] = [
  { icon: KeyRound, title: "1 · Connexion par code", text: "Code agent fourni par le superviseur — aucune information bancaire ni mot de passe à retenir." },
  { icon: Route, title: "2 · Missions du jour", text: "Tournées priorisées avec stations à contrôler et échéances — l'agent sait toujours où aller." },
  { icon: ListChecks, title: "3 · Relevés terrain", text: "Prix, faits concurrentiels et photos géolocalisés, prestation par prestation." },
  { icon: Zap, title: "4 · Rapport envoyé", text: "La mission passe à l'état « terminée » côté supervision dès la dernière prestation validée." },
]

const ASTUCE_AGENT = "AGIL-TUN-01 (Karim Ben Salah, Agil — Tunis) dispose de missions en cours : idéale pour tester un parcours complet."

export function MobileAgentView() {
  // Codes de démonstration : agents réels du seed avec leur charge de missions.
  const [agents, setAgents] = useState<AgentRow[] | null>(null)
  const [brandColors, setBrandColors] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch("/api/missions").then(r => r.json()).catch(() => null),
      fetch("/api/brands").then(r => r.json()).catch(() => null),
    ]).then(([m, b]) => {
      if (!alive) return
      const rows = (m?.agents ?? []).map((a: { code: string; name: string; brandSlug: string; zone: string }) => ({
        code: a.code,
        name: a.name,
        brandSlug: a.brandSlug,
        zone: a.zone,
        missions: (m?.missions ?? []).filter((x: { agentCode: string }) => x.agentCode === a.code).length,
      })) as AgentRow[]
      rows.sort((x, y) => y.missions - x.missions || x.code.localeCompare(y.code))
      setAgents(rows)
      const colors: Record<string, string> = {}
      for (const brand of b?.brands ?? []) colors[brand.slug] = brand.color
      setBrandColors(colors)
    })
    return () => { alive = false }
  }, [])

  return (
    <section className="flex flex-1 flex-col bg-gradient-to-b from-teal-50/70 via-background to-background py-6 dark:from-teal-950/30 lg:py-8">
      <div className="mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-10">

        {/* ---- Colonne gauche : présentation produit ---- */}
        <aside className="hidden lg:block" aria-label="Présentation de l'application agents">
          <div className="space-y-5">
            <div>
              <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[11px] font-semibold text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
                Espace agents — application terrain
              </Badge>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-foreground xl:text-[28px]">
                CarbuScope Agents —
                <br />
                le contrôle terrain, orchestré
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                L&apos;application des agents et contrôleurs terrain des enseignes : missions de veille
                concurrentielle, relevés de prix géolocalisés et rapports de visite qui remontent
                directement dans l&apos;Observatoire B2B — le bureau voit la journée de terrain en direct.
              </p>
            </div>

            <ul className="space-y-4">
              {DIFFERENCIANTS.map(f => {
                const Icon = f.icon
                return (
                  <li key={f.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{f.title}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{f.text}</p>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="flex gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
              <MousePointerClick className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[12px] leading-snug text-amber-900 dark:text-amber-300">
                <strong>Aperçu interactif de démonstration.</strong> Les missions, agents et rapports de la
                maquette sont réels : connectez-vous avec un code agent, ouvrez une mission, laissez un
                relevé — tout fonctionne et alimente les données de l&apos;enseigne.
              </p>
            </div>
          </div>
        </aside>

        {/* ---- Colonne centrale : le téléphone ---- */}
        <div className="flex flex-col items-center">
          <div className="mb-4 text-center lg:hidden">
            <h2 className="flex items-center justify-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
              <ClipboardCheck className="h-5 w-5 text-teal-600" />
              CarbuScope Agents
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Missions, relevés et rapports — aperçu interactif</p>
          </div>
          <PhoneFrame>
            <MobileApp startInAgentSpace />
          </PhoneFrame>
        </div>

        {/* ---- Colonne droite : workflow + codes de démo ---- */}
        <aside className="hidden lg:block" aria-label="Workflow de l'agent et codes de démonstration">
          <Card className="overflow-hidden lg:max-h-[min(844px,calc(100vh-220px))] lg:overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Radar className="h-4 w-4 text-teal-600" aria-hidden /> Parcours de l&apos;agent
              </CardTitle>
              <CardDescription>Du code agent au rapport exploité par l&apos;Observatoire B2B</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2.5">
                {WORKFLOW.map(w => {
                  const Icon = w.icon
                  return (
                    <div key={w.title} className="flex items-start gap-3 rounded-lg border bg-card p-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{w.title}</p>
                        <p className="text-[11.5px] leading-snug text-muted-foreground">{w.text}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-xl border p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5 text-violet-600" aria-hidden />
                  Codes agents de démonstration
                </p>
                {agents === null ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">Chargement des agents…</p>
                ) : agents.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">Aucun agent seedé.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {agents.map(a => (
                      <li key={a.code} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
                        <BrandDot color={brandColors[a.brandSlug] ?? "#57534e"} />
                        <span className="font-mono text-[11px] font-bold text-foreground">{a.code}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{a.name} · {a.zone}</span>
                        <span className={`rounded-full px-1.5 py-px text-[9.5px] font-semibold ${a.missions > 0
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                          {a.missions} mission{a.missions > 1 ? "s" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
                  Astuce : {ASTUCE_AGENT}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  )
}
